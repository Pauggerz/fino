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
import { spellNormalize } from './spell';
import { looksLikeLogStatement } from './route';
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
  answerLowConfidence,
  answerLogClarify,
  answerDataIntent,
  withMediumClarify,
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
  PseudoIntentId,
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
export {
  looksLikeQuestion,
  looksLikeCommand,
  looksLikeLogStatement,
} from './route';
export { spellNormalize, extendSpellVocab } from './spell';
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
  confidence: 1, // deterministic short-circuit — nothing uncertain about it
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

// ─── Open-set domain anchor (review fix, 2026-07-07) ────────────────────────
//
// The char-gram Naive-Bayes over-matches grammatical off-topic English: a
// sentence made of ordinary function words shares most of its n-grams with the
// finance corpus, so "how tall is mount everest" scored `safeToSpend` at
// matched 31/42, and "who is the president" scored `debt`. The matched/margin
// gate can't tell these from a real rule-silent paraphrase — both look dense.
//
// The discriminator is DOMAIN VOCABULARY. Every genuine finance question names
// money in some form (spend / save / pay / cash / bills / afford / a category)
// or uses the first-person "how much did I …" quantity frame. Off-topic chatter
// does not. So a PURE classifier guess (rules fully silent) at a data intent is
// trusted only when at least one finance anchor is present; otherwise it falls
// through to the gentle fallback. Chit-chat intents (greeting/thanks/help) are
// exempt — they're safe redirects, not answers that expose the user's numbers.
const FINANCE_ANCHOR_RE = new RegExp(
  [
    String.raw`\b(money|cash|pera|kwarta|kuwarta|peso|pesos|php|wallet|funds?|balance|broke|rich|net worth)\b`,
    String.raw`\b(spend|spent|spending|expenses?|gastos|ginastos|nagastos|budgets?)\b`,
    String.raw`\b(save|saved|saving|savings|ipon|naiipon|naimpon|nest egg|emergenc\w*|rainy day|safety net)\b`,
    String.raw`\b(income|earn(?:ed|ings)?|salary|sweldo|suweldo|sahod|paycheck|paid|pay|kita|kumita|bonus|windfall)\b`,
    String.raw`\b(bills?|subscri\w*|recurring|debts?|owe[ds]?|utang|lent|loaned|borrowed|loan)\b`,
    String.raw`\b(transactions?|purchases?|bought|buy(?:ing)?|buys|charges?|receipts?|accounts?|bank|gcash|maya|bpi|transfer)\b`,
    String.raw`\b(financ\w*|afford|categor(?:y|ies))\b`,
    // First-person money-quantity frame ("how much did i blow this month").
    // Deliberately first-person: "how much does a car cost" / "how many
    // countries" do NOT match, so third-person trivia stays out of scope.
    String.raw`\bhow (?:much|many) (?:did|do|have|has|am|are|can|could|should|will|would) (?:i|we)\b`,
  ].join('|'),
  'i'
);

/** True when the text carries at least one finance-domain word / frame. Used to
 *  gate pure classifier guesses so off-topic chatter can't be force-answered as
 *  a finance query. Exported for the review probe / test harness. */
export function hasFinanceAnchor(text: string): boolean {
  return FINANCE_ANCHOR_RE.test(text);
}

/** How the winning intent was decided. */
export type ClassificationSource = 'rules' | 'classifier' | 'none';

// ─── Unified confidence (INTELLIGENCE_UPGRADE.md, Phase B1) ─────────────────
//
// One number ∈ [0,1] per turn, combining the deciding layer's separation with
// how much of the message the winner actually consumed. NB softmax is NOT an
// input — it saturates at 1.0 on this model (measured: "I bought ice crwam20"
// scored softmax 1.0 for `transactions`). Coverage is the discriminator: a
// real paraphrase shares most of its features with the corpus; an accidental
// match shares a sliver.

/** Below this, a classifier-sourced win is offered as a chip, not answered. */
export const LOW_CONFIDENCE = 0.45;

/** Below this (but ≥ LOW), a classifier-sourced win still answers, but the
 *  reply is guaranteed to carry clarify chips (Phase B2's MEDIUM band) so a
 *  near-miss guess is a one-tap correction. Rules are exempt — they're
 *  precise by construction at margin ≥ 1. */
export const MEDIUM_CONFIDENCE = 0.6;

export function computeConfidence(
  c: Classification,
  finalIntent: IntentId | string | null,
  inherited: boolean
): number {
  if (finalIntent === null) return 0;
  // A continuation that inherited the prior turn's intent — trusted (the user
  // is building on an answer they just accepted) but soft.
  if (inherited) return 0.66;
  if (c.needsClarify) return 0.4;
  if (c.source === 'rules') {
    // Rules are precise by construction; margin is the whole story.
    return Math.min(0.95, 0.62 + 0.09 * Math.min(c.ruleMargin, 4));
  }
  if (c.source === 'classifier') {
    const ratio = c.ml.total > 0 ? c.ml.matched / c.ml.total : 0;
    const base = Math.min(0.9, 0.45 + 0.02 * c.ml.margin);
    return Math.max(0, Math.min(1, base * (0.55 + 0.45 * ratio)));
  }
  return 0.5;
}

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
  // Typo pass (Phase A3): snap OOV tokens to known words so the DETERMINISTIC
  // layers fire on "how mcuh did i spnd" — without this, a one-letter slip
  // silently demotes an explainable rule win into a classifier guess. The NB
  // predict below still reads the RAW text; its char n-grams are typo-robust
  // by construction and shouldn't compound with a correction.
  const fixed = spellNormalize(norm);
  const canonical = canonicalize(fixed);
  const scores = scoreIntents(canonical);
  const slots = extractSlots(fixed, opts);

  const ruleTop = scores[0];
  const second = scores[1] ?? null;
  const ruleScore = ruleTop.score;
  const ruleMargin = ruleScore - (second?.score ?? 0);
  const runnerUp = second && second.score > 0 ? second.id : null;

  const ml = predict(MODEL, raw);
  let mlIntent: IntentId | null =
    ml.label !== 'unknown' &&
    ml.matched >= ML_MIN_MATCHED &&
    ml.margin >= ML_MIN_MARGIN
      ? ml.label
      : null;

  // Open-set domain gate: a PURE classifier guess (rules fully silent) at a
  // data intent must be anchored by a finance-domain word, or we reject it as
  // off-topic. Tie-break guesses (ruleScore > 0) are exempt — the rules already
  // found finance signal there. See FINANCE_ANCHOR_RE above.
  // Check BOTH the raw-normalized and spell-fixed text: spell correction can
  // corrupt a valid domain word ("safety net" → "safely net"), while a genuine
  // typo ("mony") only anchors after the fix — accept either. The ~1KB regex
  // only runs when the gate actually applies (REVIEW_2026-07-08 P1.5) — on a
  // rule win or a classifier abstain it is never evaluated.
  if (
    mlIntent &&
    ruleScore === 0 &&
    DATA_INTENTS.has(mlIntent) &&
    !FINANCE_ANCHOR_RE.test(norm) &&
    !FINANCE_ANCHOR_RE.test(fixed)
  ) {
    mlIntent = null;
  }

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

  // A first-person purchase STATEMENT ("I bought ice crwam20" whose amount the
  // logger couldn't parse) must never be force-answered as a query — the NB
  // classifier shares too much vocabulary with "what did i buy" to reject it
  // (Phase A2). Ask for the missing amount instead. Deterministic: high
  // confidence, no memory update (a clarify shouldn't seed follow-up carry).
  if (looksLikeLogStatement(norm)) {
    return {
      ...answerLogClarify(norm),
      meta: {
        source: 'rules',
        intent: 'logClarify',
        ruleMargin: 0,
        mlMatched: 0,
        confidence: 0.9,
      },
    };
  }

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

  // Unified confidence for the turn (Phase B1). `inherited` = memory carried
  // an intent the message didn't classify to on its own.
  const inherited = intent !== null && intent !== c.intent;
  const confidence = computeConfidence(c, intent, inherited);
  const assistEligible =
    intent === null ||
    (c.source === 'classifier' && !inherited && confidence < LOW_CONFIDENCE);

  // Classification metadata for the host: drives the intent-accurate working
  // steps and the miss-telemetry log. `source: 'none'` means a true fallback
  // (rules silent + classifier abstained + nothing inherited).
  const meta: BrainResponseMeta = {
    source: intent === null ? 'none' : c.source,
    intent,
    ruleMargin: c.ruleMargin,
    mlMatched: c.ml.matched,
    confidence,
    ...(assistEligible ? { assistEligible: true } : {}),
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

  // LOW-confidence classifier win (Phase B2): the guess consumed too little of
  // the message to trust — offer it as a one-tap chip instead of answering.
  // Rules stay trusted at margin ≥ 1; only the recall layer is gated. No
  // memory update: a hedged guess must not seed follow-up carry-over.
  if (c.source === 'classifier' && !inherited && confidence < LOW_CONFIDENCE) {
    return { ...answerLowConfidence(intent), meta };
  }

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

  // MEDIUM band (Phase B2): a classifier-sourced win in [LOW, MEDIUM) still
  // answers, but the reply must carry clarify chips so a near-miss guess is a
  // one-tap correction rather than a retype. Rules stay untouched.
  const mediumBand =
    c.source === 'classifier' && !inherited && confidence < MEDIUM_CONFIDENCE;
  const answer = answerDataIntent(intent, slots, ctx, norm) ?? answerFallback();
  return withMemory(mediumBand ? withMediumClarify(answer, intent) : answer);
}
