/**
 * Fino Convo brain — the composed, offline, synchronous reply pipeline
 * (FINO_INTELLIGENCE_V2.md §4). Every stage is a pure function; the whole
 * thing runs on-device with no network, no API key.
 *
 *   normalize → canonicalize → score intents → extract slots
 *     → (classifier fallback when rules are weak) → (clarify if tied)
 *     → bridge to data → narrate
 *
 * `routeMessage` is a drop-in superset of the old finoBrain export: same
 * `(raw, ctx?)` signature, same `BrainResponse` shape, so the ChatScreen send
 * path is unchanged. Transaction LOGGING is still NOT handled here — typed
 * expenses go through the deterministic `parseChatTransaction` taxonomy path on
 * the ChatScreen *before* this router runs (one message = log OR answer).
 *
 * Hybrid classifier (P3): the weighted rules decide when they're confident
 * (margin ≥ 1). When they're silent or tied, the Multinomial Naive-Bayes model
 * (`classifier/`, trained offline → `model.json`) takes over — it catches
 * paraphrases the rules miss and REJECTS out-of-scope chatter via its synthetic
 * `unknown` class. NB softmax confidence saturates, so the gate is the
 * `unknown` label, not a probability threshold. Logging never touches any of
 * this; it stays deterministic.
 */

import { normalize } from '../core/normalize';
import { isAbusive } from './safety';
import { canonicalize } from './canonicalize';
import { scoreIntents, type IntentId, type IntentScore } from './intents';
import { extractSlots, type Slots } from './slots';
import { mergeWithMemory, rememberTurn, turnFromResolved } from './memory';
import {
  answerGreeting,
  answerThanks,
  answerHelp,
  answerFallback,
  answerClarify,
  answerTimeClarify,
  answerDataIntent,
} from './intelligenceBridge';
import {
  predict,
  type NbModel,
  type Prediction,
} from './classifier/naiveBayes';
import modelJson from './classifier/model.json';
import type { BrainContext, BrainResponse, BrainResponseMeta } from './types';

export type {
  BrainContext,
  BrainResponse,
  BrainResponseMeta,
  ChatCard,
  ChatCardKind,
  BreakdownCard,
  BreakdownSegment,
  CompareCard,
  ForecastCard,
  CoachCard,
  CoachReason,
  TxListCard,
  TxListRow,
  StatusCard,
  SummaryCard,
  BudgetCard,
  BudgetRow,
  NeedsWantsCard,
  PatternCard,
  PatternBar,
  CardStatus,
  CardAction,
  NavTarget,
  DeltaDirection,
  TxLite,
  AccountSummary,
  BudgetLite,
  RecurringIncomeLite,
  RecurringBillLite,
  BrainMutation,
  ConversationMemory,
  ConversationTurn,
} from './types';
export type { IntentId } from './intents';
export { selectProactiveCoach } from './coach';
export { looksLikeQuestion, looksLikeCommand } from './route';
export { isAbusive } from './safety';
export { CONVERSATION_MEMORY_MAX } from './memory';

const MODEL = modelJson as unknown as NbModel;

/** Meta for a deterministic decline — empty/punctuation-only input, or abusive
 *  input short-circuited before classification. Marked 'declined' (not 'none')
 *  so the host renders it instantly and never feeds it to the miss-telemetry
 *  corpus (we don't want a slur growing the training set). */
const DECLINED_META: BrainResponseMeta = {
  source: 'declined',
  intent: null,
  ruleMargin: 0,
  mlMatched: 0,
};

/** Intents that need `BrainContext` numbers to answer. */
const DATA_INTENTS = new Set<IntentId>([
  'balance',
  'income',
  'spend',
  'breakdown',
  'topCategory',
  'compare',
  'cut',
  'count',
  'savings',
  'coach',
  'overspend',
  'transactions',
  'categoryOf',
  'salaryStatus',
  'billStatus',
  'summary',
  'budgetStatus',
  'needsVsWants',
  'dowPattern',
  'incomeShare',
  'trend',
  'typicalSpend',
  'subscriptionCut',
  'emergencyFund',
  'goalPlan',
  'bonusAdvice',
  'improveSavings',
  'cutAmount',
  'ruleOfThumb',
  'impulseTips',
  'afford',
  'debt',
  'safeToSpend',
  'reCategorize',
  'splitBill',
  'runway',
  'explainSpend',
  'monthPattern',
  'upcomingBills',
  'setBudget',
  'deleteTransaction',
  'transfer',
  'reminder',
]);

/** Data intents that genuinely consume a parsed time range. Used for two
 *  things: (1) a clearly-temporal-but-unresolved phrase ("lately") should
 *  clarify the window rather than silently answer for "this month"; (2) they
 *  inherit a "sticky" session window from the previous turn (convo/memory.ts) so
 *  "…this week" then "give me a breakdown" stays on this week. Keep this in sync
 *  with the handlers that actually slice by `slots.timeRange`. */
const TIME_SCOPED_INTENTS = new Set<IntentId>([
  'spend',
  'breakdown',
  'topCategory',
  'summary',
  'transactions',
  'count',
  'needsVsWants',
  'dowPattern',
  'upcomingBills',
]);

// Open-set gate for the classifier. NB softmax saturates, so we reject on raw
// separation instead: gibberish that shares a few stray char-grams lands at
// matched≈3 / tiny signal, whereas a real rule-silent query sits at matched≥27
// (measured on the eval set). Trusting the prediction only above this floor
// keeps "qwerty asdf" out without touching genuine paraphrases.
//
// The floor is now CALIBRATED at train time (train-brain.ts measures a gibberish
// panel against the freshly-built vocab and emits `model.gate`) instead of being
// a hand-bumped constant — it used to creep 3→6 by hand as the corpus grew. The
// constants below are only the fallback for an older model.json with no `gate`.
const ML_MIN_MATCHED = MODEL.gate?.minMatched ?? 6;
const ML_MIN_MARGIN = MODEL.gate?.minMargin ?? 1;

/** How the winning intent was decided. */
export type ClassificationSource = 'rules' | 'classifier' | 'none';

export type Classification = {
  /** Winning intent, or null when nothing in scope matched → fallback. */
  intent: IntentId | null;
  /** Which layer decided. */
  source: ClassificationSource;
  /** True when rules tied between two data intents and the classifier didn't
   *  break it → the brain should ask rather than guess. */
  needsClarify: boolean;
  /** Winning rule intent's total trigger weight (0 = rules silent). */
  ruleScore: number;
  /** top-1 − top-2 rule weight gap. */
  ruleMargin: number;
  /** Second-best rule intent, when there is one. */
  runnerUp: IntentId | null;
  /** Raw classifier prediction (debugging / the test harness). */
  ml: Prediction;
  slots: Slots;
  /** Full ranked rule-score list. */
  scores: IntentScore[];
};

export type ClassifyOptions = {
  now?: Date;
  /** User's category names so slot resolution can bubble up to their labels. */
  categoryNames?: string[];
};

/**
 * Run the understanding half of the pipeline (everything before narration).
 * Exposed for `npm run test:brain` and any future debug surface.
 */
export function classifyMessage(
  raw: string,
  opts: ClassifyOptions = {}
): Classification {
  const norm = normalize(raw);
  const canonical = canonicalize(norm);
  const scores = scoreIntents(canonical);
  const slots = extractSlots(norm, opts);

  const ruleTop = scores[0];
  const second = scores[1] ?? null;
  const ruleScore = ruleTop.score;
  const ruleMargin = ruleScore - (second?.score ?? 0);
  const runnerUp = second && second.score > 0 ? second.id : null;

  const ml = predict(MODEL, raw);
  const mlIntent: IntentId | null =
    ml.label !== 'unknown' &&
    ml.matched >= ML_MIN_MATCHED &&
    ml.margin >= ML_MIN_MARGIN
      ? ml.label
      : null;

  let intent: IntentId | null;
  let source: ClassificationSource;
  let needsClarify = false;

  if (ruleMargin >= 1) {
    // Clear rule winner — unchanged from the rules-only engine.
    intent = ruleTop.id;
    source = 'rules';
  } else if (mlIntent) {
    // Rules silent or tied → trust the classifier (unless it abstained).
    intent = mlIntent;
    source = 'classifier';
  } else if (ruleScore > 0) {
    // Rules tied and the classifier abstained ('unknown') → keep the rule
    // winner, but flag a clarify when two data intents are deadlocked.
    intent = ruleTop.id;
    source = 'rules';
    needsClarify = Boolean(
      runnerUp && DATA_INTENTS.has(ruleTop.id) && DATA_INTENTS.has(runnerUp)
    );
  } else {
    // Nothing in scope.
    intent = null;
    source = 'none';
  }

  return {
    intent,
    source,
    needsClarify,
    ruleScore,
    ruleMargin,
    runnerUp,
    ml,
    slots,
    scores,
  };
}

/**
 * Route a raw user message to an offline reply. Synchronous and side-effect
 * free — safe to call on the render path. Pass `ctx` to unlock the data-aware
 * insight answers; without it, only chit-chat resolves.
 */
export function routeMessage(raw: string, ctx?: BrainContext): BrainResponse {
  const norm = normalize(raw);
  if (!norm) return { ...answerFallback(), meta: DECLINED_META };

  // Clearly abusive/obscene input is declined outright — never run through the
  // classifier (which could otherwise force a finance answer onto a slur). An
  // abusive turn also resets nothing and is never remembered. The 'declined'
  // meta keeps it out of the miss-telemetry corpus and renders instantly.
  if (isAbusive(norm)) return { ...answerFallback(), meta: DECLINED_META };

  const nowMs = ctx?.now ? Date.parse(ctx.now) : Date.now();
  const c = classifyMessage(raw, {
    now: ctx?.now ? new Date(ctx.now) : undefined,
    categoryNames: ctx?.topCategories.map((tc) => tc.name),
  });

  // Short-term memory: a follow-up ("what about last month?", "and transport?")
  // inherits the previous turn's intent/category/time window before we narrate.
  // The brain stays pure — memory comes in via ctx and the updated window goes
  // out on the response; ChatScreen owns the storage. A confident rule win on
  // the follow-up's own intent (margin ≥ 1) is kept; a weak/classifier guess on
  // a pure slot-refinement defers to the prior intent.
  const selfIntentConfident = c.source === 'rules' && c.ruleMargin >= 1;
  const intentIsTimeScoped =
    c.intent !== null && TIME_SCOPED_INTENTS.has(c.intent);
  const merged = mergeWithMemory(
    norm,
    {
      intent: c.intent,
      slots: c.slots,
      selfIntentConfident,
      intentIsTimeScoped,
    },
    ctx?.memory,
    nowMs
  );
  const { intent, slots } = merged;

  // Classification metadata for the host: drives the intent-accurate working
  // steps and the miss-telemetry log. `source: 'none'` means a true fallback
  // (rules silent + classifier abstained + nothing inherited).
  const meta: BrainResponseMeta = {
    source: intent === null ? 'none' : c.source,
    intent,
    ruleMargin: c.ruleMargin,
    mlMatched: c.ml.matched,
  };

  // Stamp the updated memory window onto whatever response we return, so even a
  // clarify/fallback turn advances the conversation state. `at` is the resolve
  // time so ChatScreen / the continuation TTL can age turns out.
  const atIso = ctx?.now ?? new Date(nowMs).toISOString();
  const withMemory = (res: BrainResponse): BrainResponse => {
    const memory = rememberTurn(
      ctx?.memory,
      turnFromResolved(intent, slots, atIso)
    );
    return { ...res, memory, meta };
  };

  // Nothing matched (rules silent + classifier abstained, nothing inherited) →
  // gentle fallback. A bare continuation that inherited an intent skips this.
  if (intent === null) return withMemory(answerFallback());

  // Genuine tie the classifier couldn't break → ask instead of guessing. (Only
  // possible from a self-resolved turn; an inherited intent is unambiguous.)
  if (c.needsClarify && c.runnerUp && intent === c.intent)
    return withMemory(answerClarify(intent, c.runnerUp));

  // A clearly-temporal phrase we couldn't pin to a range → clarify the window
  // rather than silently answering for "this month".
  if (TIME_SCOPED_INTENTS.has(intent) && slots.timeRangeUnresolved)
    return withMemory(answerTimeClarify());

  // Chit-chat / meta intents (answerable without context).
  if (intent === 'greeting') return withMemory(answerGreeting(norm));
  if (intent === 'thanks') return withMemory(answerThanks(norm));
  if (intent === 'help') return withMemory(answerHelp());

  // Data answers (incl. count, which now tallies the snapshot) need the live
  // context. Without it, fall back gently.
  if (!ctx) return withMemory(answerFallback());

  return withMemory(
    answerDataIntent(intent, slots, ctx, norm) ?? answerFallback()
  );
}
