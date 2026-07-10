/**
 * Multinomial Naive Bayes inference — pure TS, runs on Hermes from a shipped
 * `model.json` (FINO_INTELLIGENCE_V2.md §4.1). No training toolchain at
 * runtime: the offline `scripts/train-brain.ts` emits the parameters; this file
 * only evaluates `P(class | message) ∝ P(class) · Π P(tₖ | class)`.
 *
 * Features are TF-IDF-weighted n-grams (see `vectorize.ts`): the model ships an
 * `idf` per vocab term, and the per-term log-likelihoods were trained on the
 * same tf·idf weighting, reproducing the sklearn TfidfVectorizer→MultinomialNB
 * pipeline.
 *
 * Open-set rejection: the model carries a synthetic `unknown` class trained on
 * out-of-scope chatter, and `predict` returns `unknown` (or confidence 0 when a
 * message shares no vocab at all) so the brain can fall back instead of forcing
 * an in-domain label onto "what's the weather".
 */

import type { IntentId } from '../intents';
import { featurize } from './vectorize';

/** Classifier labels = the intent ids plus the out-of-scope sentinel. */
export type NbLabel = IntentId | 'unknown';

export type NbModel = {
  /** Label order; also the class set. */
  labels: NbLabel[];
  /** Number of training docs (provenance / debugging). */
  docs: number;
  /** ln P(class). */
  logPrior: Record<string, number>;
  /** Inverse document frequency per vocab term. Terms absent here are OOV. */
  idf: Record<string, number>;
  /** Sparse ln P(term | class), stored only where the trained weight was > 0. */
  logLik: Record<string, Partial<Record<string, number>>>;
  /** ln P(term | class) for an in-vocab term unseen in that class (Laplace floor). */
  missingLogLik: Record<string, number>;
  /** Open-set acceptance gate, calibrated at train time (train-brain.ts) from a
   *  fixed gibberish panel rather than hand-tuned. The brain trusts an NB label
   *  only when `matched >= minMatched && margin >= minMargin`. Optional so older
   *  models still load (the brain falls back to its built-in constants). */
  gate?: {
    /** Minimum in-vocab feature count to trust the prediction at all. */
    minMatched: number;
    /** Minimum top-1 − top-2 log-score separation. */
    minMargin: number;
  };
  /** Confidence calibration (INTELLIGENCE_UPGRADE.md B4), fit at train time by
   *  stratified cross-validation: the raw B1 composite (`rawClassifierScore`)
   *  is only a RANKING signal; each bin maps a raw-score interval to the
   *  empirical held-out accuracy inside it (isotonic — accuracies are
   *  non-decreasing). Optional so older models still load (the brain then
   *  reports the raw composite as before). */
  calibration?: {
    /** How the curve was fit, e.g. 'isotonic-cv5' (provenance / debugging). */
    method: string;
    /** Held-out predictions the curve was fit on (provenance / debugging). */
    points: number;
    /** Ascending by `upTo`; the last bin's `upTo` is 1 (raw is clamped). */
    bins: { upTo: number; acc: number }[];
  };
};

export type Prediction = {
  label: NbLabel;
  /** Softmax probability of the winning label ∈ [0, 1]. */
  confidence: number;
  /** Top-1 − top-2 log-score gap (raw separation signal). */
  margin: number;
  /** How many query features were in-vocabulary (0 → no signal). */
  matched: number;
  /** Total features extracted from the query — `matched / total` is the
   *  coverage ratio the brain's unified confidence score reads. Softmax
   *  saturates on this model; coverage is what actually separates "a real
   *  paraphrase" from "shares a few grams with the corpus by accident". */
  total: number;
};

const UNKNOWN: Prediction = {
  label: 'unknown',
  confidence: 0,
  margin: 0,
  matched: 0,
  total: 0,
};

// ─── Confidence calibration (INTELLIGENCE_UPGRADE.md B4) ────────────────────
//
// The raw composite below was Phase B1's heuristic confidence: NB softmax
// saturates on this model, so it blends the log-score margin with feature
// coverage (matched/total — the signal that actually separates a real
// paraphrase from an accidental gram overlap). Since B4 it is only the
// RANKING signal the calibration curve is indexed by; the number the brain
// reports is the held-out accuracy measured at train time for this score's
// bin. It lives here — next to the model type — so `train-brain.ts` (which
// fits the curve) and `brain.ts` (which reads it) can never disagree on it.

/** Phase-B1 composite score ∈ [0,1] for a classifier prediction. Monotone in
 *  both margin and coverage; NOT a probability — feed it through
 *  `calibratedConfidence` to get one. */
export function rawClassifierScore(p: Prediction): number {
  const ratio = p.total > 0 ? p.matched / p.total : 0;
  const base = Math.min(0.9, 0.45 + 0.02 * p.margin);
  return Math.max(0, Math.min(1, base * (0.55 + 0.45 * ratio)));
}

/** Map a raw composite score through the model's train-time calibration curve
 *  → empirical accuracy ∈ [0,1]. Returns null when the model carries no curve
 *  (older model.json) so the caller can fall back to the raw score. */
export function calibratedConfidence(
  model: NbModel,
  raw: number
): number | null {
  const bins = model.calibration?.bins;
  if (!bins || bins.length === 0) return null;
  for (const bin of bins) if (raw <= bin.upTo) return bin.acc;
  return bins[bins.length - 1].acc;
}

/**
 * Classify a message. Returns `unknown`/confidence 0 when the text shares no
 * vocabulary with the training corpus (e.g. gibberish), letting the caller
 * reject rather than guess.
 */
export function predict(model: NbModel, text: string): Prediction {
  const feats = featurize(text);

  const logScore: Record<string, number> = {};
  for (const label of model.labels)
    logScore[label] = model.logPrior[label] ?? 0;

  let matched = 0;
  for (const [term, tf] of feats) {
    const idf = model.idf[term];
    if (idf !== undefined) {
      // in-vocabulary term — contributes; OOV terms are silently ignored
      matched += 1;
      const weight = tf * idf;
      const perLabel = model.logLik[term];
      for (const label of model.labels) {
        const ll =
          perLabel && perLabel[label] !== undefined
            ? (perLabel[label] as number)
            : model.missingLogLik[label];
        logScore[label] += weight * ll;
      }
    }
  }

  if (matched === 0) return { ...UNKNOWN, total: feats.size };

  // argmax + runner-up for the margin.
  let bestLabel = model.labels[0];
  let best = -Infinity;
  let second = -Infinity;
  for (const label of model.labels) {
    const s = logScore[label];
    if (s > best) {
      second = best;
      best = s;
      bestLabel = label;
    } else if (s > second) {
      second = s;
    }
  }

  // Softmax (max-subtracted for numerical stability) → confidence of the winner.
  let denom = 0;
  for (const label of model.labels) denom += Math.exp(logScore[label] - best);
  const confidence = 1 / denom;

  return {
    label: bestLabel,
    confidence,
    margin: Number.isFinite(second) ? best - second : best,
    matched,
    total: feats.size,
  };
}
