/**
 * Offline trainer for the Convo Naive-Bayes fallback (FINO_INTELLIGENCE_V2.md
 * §4.1). Run from the repo root:
 *
 *   npx tsx scripts/train-brain.ts        (or: npm run train:brain)
 *
 * Reads the labelled corpus (`scripts/brain-corpus.ts`), fits a TF-IDF-weighted
 * Multinomial Naive Bayes, and writes the parameters to
 * `src/intelligence/convo/classifier/model.json` — the same JSON the on-device
 * `naiveBayes.predict` evaluates. NO model code runs in the app build; this is
 * a dev/CI step, like `test:taxonomy`.
 *
 * Pipeline = sklearn's TfidfVectorizer → MultinomialNB, reproduced in TS:
 *   • features  = word + char(3-4) n-grams (vectorize.featurize)
 *   • weighting = tf · idf, idf = ln((1+N)/(1+df)) + 1   (smooth_idf)
 *   • likelihood= Laplace-smoothed (α=1) multinomial over the tf·idf weights
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { featurize } from '../src/intelligence/convo/classifier/vectorize';
import {
  predict,
  rawClassifierScore,
  type NbLabel,
  type NbModel,
} from '../src/intelligence/convo/classifier/naiveBayes';
import { CORPUS, type CorpusRow } from './brain-corpus';

const ALPHA = 1; // Laplace smoothing
const OUT = join(process.cwd(), 'src/intelligence/convo/classifier/model.json');

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

// ── Model fitting (steps 1–4 of the original pipeline), reusable so the B4
//    cross-validation below can train fold models on corpus subsets ──────────
function fitModel(rows: CorpusRow[]): NbModel {
  // 1. Featurize every doc, collect document frequencies
  type Doc = { label: NbLabel; feats: Map<string, number> };
  const docs: Doc[] = rows.map((row) => ({
    label: row.label,
    feats: featurize(row.text),
  }));

  const N = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const term of d.feats.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }

  // 2. Vocab + IDF (prune one-off char-grams; always keep word unigrams)
  const idf: Record<string, number> = {};
  for (const [term, dfi] of df) {
    const isWord = term.startsWith('w:');
    // keep all word unigrams; drop noisy singleton char-grams
    if (isWord || dfi >= 2) {
      idf[term] = Math.log((1 + N) / (1 + dfi)) + 1;
    }
  }
  const vocab = Object.keys(idf);
  const V = vocab.length;

  // 3. Per-class tf·idf feature sums
  const labels = Array.from(new Set(rows.map((r) => r.label))).sort();
  const classDocCount: Record<string, number> = {};
  const featureSum: Record<string, Record<string, number>> = {};
  for (const l of labels) {
    classDocCount[l] = 0;
    featureSum[l] = {};
  }
  for (const d of docs) {
    classDocCount[d.label] += 1;
    const bucket = featureSum[d.label];
    for (const [term, tf] of d.feats) {
      const w = idf[term];
      if (w !== undefined) {
        // skip pruned terms
        bucket[term] = (bucket[term] ?? 0) + tf * w;
      }
    }
  }

  // 4. Laplace-smoothed multinomial log-likelihoods + priors
  const logPrior: Record<string, number> = {};
  const missingLogLik: Record<string, number> = {};
  const denomLog: Record<string, number> = {};
  for (const l of labels) {
    const classTotal = Object.values(featureSum[l]).reduce((s, x) => s + x, 0);
    const denom = classTotal + ALPHA * V;
    denomLog[l] = Math.log(denom);
    logPrior[l] = round(Math.log(classDocCount[l] / N));
    missingLogLik[l] = round(Math.log(ALPHA) - denomLog[l]);
  }

  // Sparse term → {label → logLik}, stored only where the class actually saw it.
  const logLik: Record<string, Partial<Record<string, number>>> = {};
  for (const term of vocab) {
    const perLabel: Partial<Record<string, number>> = {};
    for (const l of labels) {
      const sum = featureSum[l][term];
      if (sum && sum > 0) {
        perLabel[l] = round(Math.log(sum + ALPHA) - denomLog[l]);
      }
    }
    if (Object.keys(perLabel).length > 0) logLik[term] = perLabel;
  }

  return {
    labels,
    docs: N,
    logPrior,
    idf: Object.fromEntries(Object.entries(idf).map(([k, v]) => [k, round(v)])),
    logLik,
    missingLogLik,
  };
}

const model = fitModel(CORPUS);
const N = model.docs;
const V = Object.keys(model.idf).length;
const classDocCount: Record<string, number> = {};
for (const row of CORPUS)
  classDocCount[row.label] = (classDocCount[row.label] ?? 0) + 1;

// ── Calibrate the open-set gate from a fixed gibberish panel ─────────────────
// The brain trusts an NB label only above a `matched` floor (otherwise gibberish
// that shares a few stray char-grams gets a finance label). That floor used to
// be a hand-bumped constant (3→6 as the vocab grew). Here we MEASURE it: how
// many features does no-signal gibberish actually hit against THIS vocab? Set the
// floor just above that, clamped to a band proven safe (real paraphrases sit at
// matched≈27, far above the ceiling). As vocab grows and gibberish's incidental
// overlap creeps up, the floor auto-rises with it — no more manual tuning.
const GIBBERISH = [
  'qwerty zxcvb asdf',
  'asdfgh jkl qwerty',
  'zxcvbnm mnbvcxz',
  'lkjhgf poiuyt',
  'qqqq wwww eeee rrrr',
  'xyzzy plugh fnord',
  'blargh snarf wibble',
  'flim flam zorp',
  'aaaa bbbb cccc',
  'jjjj kkkk llll',
];
const GATE_FLOOR = 6; // never drop below the last proven-good hand value
const GATE_CEIL = 12; // stay well under the ~27 of real paraphrases
const maxGibberishMatched = Math.max(
  0,
  ...GIBBERISH.map((g) => predict(model, g).matched)
);
const minMatched = Math.min(
  GATE_CEIL,
  Math.max(GATE_FLOOR, maxGibberishMatched + 2)
);
model.gate = { minMatched, minMargin: 1 };

// ── Confidence calibration (INTELLIGENCE_UPGRADE.md B4) ──────────────────────
//
// Replaces the Phase-B1 heuristic confidence with a MEASURED margin→accuracy
// curve: stratified K-fold cross-validation over the corpus collects held-out
// predictions that would pass the runtime gate, each scored by the B1
// composite (`rawClassifierScore` — margin + coverage, now purely a ranking
// signal). The points are quantile-binned over that score and each bin's
// empirical accuracy is pooled to be monotone (PAV / isotonic regression), so
// the shipped confidence means "of held-out gate-passing predictions that
// scored like this, this fraction were right". Held-out `unknown` rows that
// sneak past the gate with a finance label count as WRONG — they are exactly
// the misroutes the LOW band exists to hedge.
const K_FOLDS = 5;

// Deterministic stratified fold assignment (round-robin within each label, in
// corpus order) — no RNG, so retraining an unchanged corpus is byte-stable.
const foldOf = new Array<number>(CORPUS.length);
const seenPerLabel = new Map<NbLabel, number>();
CORPUS.forEach((row, i) => {
  const seen = seenPerLabel.get(row.label) ?? 0;
  foldOf[i] = seen % K_FOLDS;
  seenPerLabel.set(row.label, seen + 1);
});

type CalPoint = { raw: number; correct: boolean };
const points: CalPoint[] = [];
for (let k = 0; k < K_FOLDS; k += 1) {
  const trainRows = CORPUS.filter((_, i) => foldOf[i] !== k);
  const foldModel = fitModel(trainRows);
  CORPUS.forEach((row, i) => {
    if (foldOf[i] !== k) return;
    const p = predict(foldModel, row.text);
    // Mirror the runtime population: the brain only computes a classifier
    // confidence for predictions that clear the open-set gate. (Gate values
    // come from the full model — fold vocabs are ~4/5 the size, close enough.)
    if (p.label === 'unknown') return;
    if (p.matched < minMatched || p.margin < 1) return;
    points.push({ raw: rawClassifierScore(p), correct: p.label === row.label });
  });
}
points.sort((a, b) => a.raw - b.raw);

// Quantile-bin (≈50 points per bin, 4–10 bins), then pool adjacent violators
// so accuracy is non-decreasing in the raw score.
type Bin = { upTo: number; hits: number; count: number };
const binCount = Math.max(4, Math.min(10, Math.floor(points.length / 50)));
const bins: Bin[] = [];
for (let b = 0; b < binCount; b += 1) {
  const lo = Math.floor((b * points.length) / binCount);
  const hi = Math.floor(((b + 1) * points.length) / binCount);
  if (hi > lo) {
    const slice = points.slice(lo, hi);
    bins.push({
      upTo: slice[slice.length - 1].raw,
      hits: slice.filter((p) => p.correct).length,
      count: slice.length,
    });
  }
}
// PAV: merge any bin whose accuracy dips below its predecessor's.
for (let i = 1; i < bins.length; ) {
  const prev = bins[i - 1];
  const cur = bins[i];
  if (cur.hits / cur.count < prev.hits / prev.count) {
    prev.upTo = cur.upTo;
    prev.hits += cur.hits;
    prev.count += cur.count;
    bins.splice(i, 1);
    if (i > 1) i -= 1; // the merge may have created a new violation upstream
  } else {
    i += 1;
  }
}
// The last bin must cover the whole clamped raw range; cap accuracies at the
// rules' own ceiling (0.95) — a 100% CV bin must not ship as certainty — and
// floor at 0.05 so a pathological bin can't zero a turn outright.
if (bins.length > 0) bins[bins.length - 1].upTo = 1;
model.calibration = {
  method: `isotonic-cv${K_FOLDS}`,
  points: points.length,
  bins: bins.map((b) => ({
    upTo: round(b.upTo),
    acc: round(Math.max(0.05, Math.min(0.95, b.hits / b.count))),
  })),
};

// ── Emit model.json ───────────────────────────────────────────────────────────
writeFileSync(OUT, JSON.stringify(model));

// ── Summary ───────────────────────────────────────────────────────────────────
/* eslint-disable no-console */
console.log('Trained Convo Naive-Bayes model:');
console.log(`  docs:    ${N}`);
console.log(`  classes: ${model.labels.length} (${model.labels.join(', ')})`);
console.log(`  vocab:   ${V} terms (after pruning singleton char-grams)`);
console.log(
  `  gate:    minMatched=${minMatched} minMargin=1 ` +
    `(gibberish panel maxed at matched=${maxGibberishMatched})`
);
console.log(
  `  calib:   ${model.calibration.bins.length} isotonic bins from ` +
    `${points.length} held-out cv${K_FOLDS} predictions:`
);
for (const b of model.calibration.bins)
  console.log(`    raw ≤ ${b.upTo.toFixed(3)} → confidence ${b.acc}`);
console.log('  per-class docs:');
for (const l of model.labels)
  console.log(`    ${l.padEnd(12)} ${classDocCount[l] ?? 0}`);
console.log(`\nWrote ${OUT}`);
/* eslint-enable no-console */
