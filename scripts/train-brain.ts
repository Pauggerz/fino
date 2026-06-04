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
import type {
  NbLabel,
  NbModel,
} from '../src/intelligence/convo/classifier/naiveBayes';
import { CORPUS } from './brain-corpus';

const ALPHA = 1; // Laplace smoothing
const OUT = join(process.cwd(), 'src/intelligence/convo/classifier/model.json');

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

// ── 1. Featurize every doc, collect document frequencies ─────────────────────
type Doc = { label: NbLabel; feats: Map<string, number> };
const docs: Doc[] = CORPUS.map((row) => ({
  label: row.label,
  feats: featurize(row.text),
}));

const N = docs.length;
const df = new Map<string, number>();
for (const d of docs) {
  for (const term of d.feats.keys()) df.set(term, (df.get(term) ?? 0) + 1);
}

// ── 2. Vocab + IDF (prune one-off char-grams; always keep word unigrams) ─────
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

// ── 3. Per-class tf·idf feature sums ─────────────────────────────────────────
const labels = Array.from(new Set(CORPUS.map((r) => r.label))).sort();
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

// ── 4. Laplace-smoothed multinomial log-likelihoods + priors ─────────────────
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

// ── 5. Emit model.json ───────────────────────────────────────────────────────
const model: NbModel = {
  labels,
  docs: N,
  logPrior,
  idf: Object.fromEntries(Object.entries(idf).map(([k, v]) => [k, round(v)])),
  logLik,
  missingLogLik,
};

writeFileSync(OUT, JSON.stringify(model));

// ── 6. Summary ───────────────────────────────────────────────────────────────
/* eslint-disable no-console */
console.log('Trained Convo Naive-Bayes model:');
console.log(`  docs:    ${N}`);
console.log(`  classes: ${labels.length} (${labels.join(', ')})`);
console.log(`  vocab:   ${V} terms (after pruning singleton char-grams)`);
console.log('  per-class docs:');
for (const l of labels) console.log(`    ${l.padEnd(12)} ${classDocCount[l]}`);
console.log(`\nWrote ${OUT}`);
/* eslint-enable no-console */
