/**
 * Drift guard for the intent catalog, which is duplicated across four places
 * (REVIEW_2026-07-08 P1.1 — pass 3 found the sync is manual, protected only by
 * a "redeploy me" comment):
 *   • src/intelligence/convo/intents.ts          — the `IntentId` union (truth)
 *   • src/intelligence/convo/assistCatalog.ts    — `ASSIST_INTENTS` whitelist
 *   • supabase/functions/brain-assist/index.ts   — the LLM prompt `CATALOG`
 *   • scripts/brain-corpus.ts                    — training labels (⊆ check)
 *
 * Invariants enforced:
 *   1. ASSIST_INTENTS === IntentId − {greeting, thanks} (chit-chat never
 *      reaches the assist tier — documented in assistCatalog.ts).
 *   2. Edge-fn CATALOG ids === ASSIST_INTENTS, no duplicates ('log'/'none'
 *      are prompt special cases, not catalog lines).
 *   3. Corpus labels ⊆ IntentId ∪ {'unknown'} (the synthetic reject class).
 *
 * Run from the repo root:
 *   npx tsx scripts/check-intents-sync.ts   (or: npm run check:intents-sync)
 *
 * Like check-copy-sync.ts this reads the files as TEXT (no runtime imports —
 * the edge function is Deno, not Node). Exit code 1 on drift so it can gate
 * the Husky pre-commit. When it fires: fix the drifted file, and if the edge
 * catalog changed, redeploy (`supabase functions deploy brain-assist`).
 */

/* eslint-disable no-console */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const INTENTS = join(ROOT, 'src/intelligence/convo/intents.ts');
const ASSIST = join(ROOT, 'src/intelligence/convo/assistCatalog.ts');
const EDGE_FN = join(ROOT, 'supabase/functions/brain-assist/index.ts');
const CORPUS = join(ROOT, 'scripts/brain-corpus.ts');

/** Chit-chat intents deliberately absent from the assist tier. */
const CHIT_CHAT_EXEMPT = new Set(['greeting', 'thanks']);

function fail(msg: string): never {
  console.error(`✗ intent catalog DRIFT: ${msg}`);
  console.error(
    '\n  Keep these in sync: intents.ts (IntentId) ↔ assistCatalog.ts ' +
      '(ASSIST_INTENTS) ↔ brain-assist/index.ts (CATALOG) ↔ brain-corpus.ts.' +
      '\n  If the edge-fn CATALOG changed, redeploy: ' +
      'supabase functions deploy brain-assist'
  );
  process.exit(1);
}

/** Pull every '…' string literal out of a source slice. */
function literals(slice: string): string[] {
  return [...slice.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
}

function extract(file: string, re: RegExp, what: string): string {
  const src = readFileSync(file, 'utf8');
  const m = src.match(re);
  if (!m)
    fail(`could not locate ${what} in ${file} — did it move or get renamed?`);
  return m[1];
}

// 1) The IntentId union — the source of truth.
const intentIds = literals(
  extract(INTENTS, /export type IntentId =([\s\S]*?);/, 'the IntentId union')
);

// 2) The client-side assist whitelist.
const assistIntents = literals(
  extract(
    ASSIST,
    /const ASSIST_INTENTS = new Set<string>\(\[([\s\S]*?)\]\)/,
    'the ASSIST_INTENTS set'
  )
);

// 3) The edge-function prompt catalog — one `id — "example"` line per intent.
const catalogBody = extract(
  EDGE_FN,
  /const CATALOG = `([\s\S]*?)`\.trim\(\)/,
  'the CATALOG template'
);
const catalogIds = [...catalogBody.matchAll(/^\s*([A-Za-z]+) —/gm)].map(
  (m) => m[1]
);

// 4) Corpus labels (subset check only — not every intent needs NB training
//    rows; the rules layer covers several on its own).
const corpusLabels = [
  ...new Set(
    [...readFileSync(CORPUS, 'utf8').matchAll(/label:\s*'([A-Za-z]+)'/g)].map(
      (m) => m[1]
    )
  ),
];

if (intentIds.length === 0) fail('parsed zero IntentId members');
if (assistIntents.length === 0) fail('parsed zero ASSIST_INTENTS members');
if (catalogIds.length === 0) fail('parsed zero CATALOG lines');
if (corpusLabels.length === 0) fail('parsed zero corpus labels');

const intentSet = new Set(intentIds);
const assistSet = new Set(assistIntents);
const catalogSet = new Set(catalogIds);

const diff = (a: string[], b: Set<string>) => a.filter((x) => !b.has(x));

// Invariant 1 — ASSIST_INTENTS === IntentId − chit-chat.
const expectedAssist = intentIds.filter((id) => !CHIT_CHAT_EXEMPT.has(id));
{
  const missing = diff(expectedAssist, assistSet);
  const extra = diff(assistIntents, new Set(expectedAssist));
  if (missing.length || extra.length) {
    fail(
      `assistCatalog.ts ASSIST_INTENTS ≠ IntentId − {greeting, thanks}.${
        missing.length ? `\n  missing: ${missing.join(', ')}` : ''
      }${extra.length ? `\n  extra:   ${extra.join(', ')}` : ''}`
    );
  }
}

// Invariant 2 — edge-fn CATALOG === ASSIST_INTENTS, no duplicate lines.
{
  if (catalogIds.length !== catalogSet.size) {
    const seen = new Set<string>();
    const dupes = catalogIds.filter((id) => seen.has(id) || !seen.add(id));
    fail(`brain-assist CATALOG has duplicate lines: ${dupes.join(', ')}`);
  }
  const missing = diff(assistIntents, catalogSet);
  const extra = diff(catalogIds, assistSet);
  if (missing.length || extra.length) {
    fail(
      `brain-assist CATALOG ≠ ASSIST_INTENTS.${
        missing.length ? `\n  missing from catalog: ${missing.join(', ')}` : ''
      }${extra.length ? `\n  extra in catalog:     ${extra.join(', ')}` : ''}`
    );
  }
}

// Invariant 3 — corpus labels are real intents (or the synthetic 'unknown').
{
  const bogus = corpusLabels.filter(
    (l) => l !== 'unknown' && !intentSet.has(l)
  );
  if (bogus.length) {
    fail(
      `brain-corpus.ts labels are not IntentId members: ${bogus.join(', ')}`
    );
  }
}

console.log(
  `✓ intent catalog in sync — ${intentIds.length} intents, ` +
    `${assistIntents.length} assist-eligible, ${catalogIds.length} catalog ` +
    `lines, ${corpusLabels.length} corpus labels`
);
