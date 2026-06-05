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
import { canonicalize } from './canonicalize';
import { scoreIntents, type IntentId, type IntentScore } from './intents';
import { extractSlots, type Slots } from './slots';
import {
  answerGreeting,
  answerThanks,
  answerHelp,
  answerCount,
  answerFallback,
  answerClarify,
  answerDataIntent,
} from './intelligenceBridge';
import {
  predict,
  type NbModel,
  type Prediction,
} from './classifier/naiveBayes';
import modelJson from './classifier/model.json';
import type { BrainContext, BrainResponse } from './types';

export type {
  BrainContext,
  BrainResponse,
  ChatCard,
  ChatCardKind,
  BreakdownCard,
  BreakdownSegment,
  CompareCard,
  ForecastCard,
  CoachCard,
  CoachReason,
  CardStatus,
  CardAction,
  DeltaDirection,
} from './types';
export type { IntentId } from './intents';
export { selectProactiveCoach } from './coach';

const MODEL = modelJson as unknown as NbModel;

/** Intents that need `BrainContext` numbers to answer. */
const DATA_INTENTS = new Set<IntentId>([
  'balance',
  'income',
  'spend',
  'breakdown',
  'topCategory',
  'compare',
  'cut',
  'savings',
  'coach',
  'overspend',
]);

// Open-set gate for the classifier. NB softmax saturates, so we reject on raw
// separation instead: gibberish that shares a stray char-gram lands at
// matched≈1 / margin≈0.4, whereas a real rule-silent query sits at matched≥20 /
// margin≥35 (measured on the eval set). Trusting the prediction only above this
// floor keeps "qwerty asdf" out without touching genuine paraphrases.
const ML_MIN_MATCHED = 3;
const ML_MIN_MARGIN = 1;

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
  if (!norm) return answerFallback();

  const c = classifyMessage(raw, {
    categoryNames: ctx?.topCategories.map((tc) => tc.name),
  });

  // Nothing matched (rules silent + classifier abstained) → gentle fallback.
  if (c.intent === null) return answerFallback();

  // Genuine tie the classifier couldn't break → ask instead of guessing.
  if (c.needsClarify && c.runnerUp) return answerClarify(c.intent, c.runnerUp);

  // Chit-chat / meta intents (answerable without context).
  if (c.intent === 'greeting') return answerGreeting(norm);
  if (c.intent === 'thanks') return answerThanks(norm);
  if (c.intent === 'help') return answerHelp();
  if (c.intent === 'count') return answerCount();

  // Data answers need the live context.
  if (!ctx) return answerFallback();

  return answerDataIntent(c.intent, c.slots, ctx, norm) ?? answerFallback();
}
