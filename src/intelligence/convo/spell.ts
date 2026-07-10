/**
 * Conservative typo normalization — the shared spell pass in front of the
 * rules/canonicalize/slot layers (INTELLIGENCE_UPGRADE.md, Phase A3).
 *
 * The NB classifier's char n-grams already absorb typos, but everything ELSE
 * in the pipeline is exact-match: the weighted rule triggers, the canonicalize
 * regexes, the route.ts question/command cues, and the slot regexes all go
 * silent on "how mcuh did i spnd". That silently demotes explainable rule wins
 * into classifier guesses (or misses). This pass snaps out-of-vocabulary
 * tokens back to a known word so the deterministic layers fire again.
 *
 * Deliberately conservative — it would rather miss a fix than invent one:
 *   · only OOV tokens are touched (an in-vocab word is NEVER rewritten);
 *   · only tokens of ≥ 4 letters, containing no digits;
 *   · bounded OSA distance (adjacent transposition = 1 edit): tolerance 1 for
 *     4–5 letter tokens, 2 for longer;
 *   · the best candidate must be UNIQUE at its distance — a tie means
 *     ambiguity, and ambiguity means keep the user's word.
 *
 * Vocabulary is everything the system already knows: the NB model's word
 * vocab (the whole training corpus), the taxonomy keywords, the intent trigger
 * terms, and a small function-word list. Pure TS, built once at module load —
 * no model weights, no network, tsx-harness safe.
 */

import modelJson from './classifier/model.json';
import { TRIGGER_TERMS } from './intents';
import { aiMappings } from '../categorize/categorize';
import { osaDistance } from '../core/editDistance';

// Function/aux words that must survive as anchors even if a future corpus drops
// them — cheap insurance, mostly redundant with the corpus vocab.
//
// ⚠️ The second block protects words that appear ONLY inside the route.ts /
// canonicalize.ts cue REGEXES (they aren't intent triggers or corpus words, so
// nothing else puts them in the vocab). Without protection the corrector can
// rewrite them into a near neighbour and silently kill the cue — measured:
// "is 300 a good deal" became "…a good meal", flipping the message from a
// brain question into a ₱300 Food log. If you add cue words to those regexes,
// add any uncommon ones here; `npm run test:typo` + `test:route` guard drift.
// core/time.ts calendar words. Two invariants hang off this list:
//   · a month/weekday must never be "corrected" into a taxonomy merchant
//     ("june" → "tune", "friday" → "fridays" the restaurant), so they live in
//     the vocab as protected anchors;
//   · nothing may ever be corrected INTO one (REVIEW_2026-07-08 P0.1) —
//     calendar words are the nearest vocab neighbours of PEOPLE'S NAMES
//     ("marco" → "march", "frida" → "friday"), and that rewrite makes the
//     brain answer a different question at high confidence. The cost — a
//     typo'd month stays unfixed — is absorbed by the classifier char-grams.
const CALENDAR_WORDS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
  'nov', 'dec',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'sunday', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri',
  'sat', 'sun',
];

/** Correction TARGETS that are forbidden — see CALENDAR_WORDS above. */
const CALENDAR_TARGETS = new Set(CALENDAR_WORDS);

const COMMON_WORDS = [
  'how', 'much', 'many', 'what', 'where', 'which', 'when', 'why', 'who',
  'did', 'does', 'have', 'has', 'was', 'were', 'will', 'would', 'could',
  'should', 'can', 'this', 'that', 'last', 'next', 'yesterday', 'today',
  'tomorrow', 'week', 'month', 'year', 'daily', 'weekly', 'monthly',
  'spend', 'spent', 'spending', 'bought', 'buy', 'paid', 'pay', 'money',
  'cash', 'balance', 'budget', 'income', 'salary', 'savings', 'save',
  'expenses', 'expense', 'transactions', 'transaction', 'account', 'between',
  'over', 'under', 'more', 'less', 'than', 'about', 'show', 'give', 'list',
  'received', 'earned', 'ordered', 'purchased', 'because', 'please',
  // route.ts / canonicalize.ts cue words with no other vocab source:
  'deal', 'worth', 'fair', 'rip', 'ripoff', 'reasonable', 'pricey', 'steep',
  'cheap', 'cheaper', 'expensive', 'above', 'below', 'least', 'most',
  'greater', 'exceed', 'minimum', 'maximum', 'charge', 'charges', 'payment',
  'payments', 'purchase', 'purchases', 'entry', 'entries', 'remind',
  'reminder', 'forget', 'dutch', 'owes', 'owed', 'owe', 'borrowed', 'lent',
  'loaned', 'back', 'goal', 'goals', 'wanna', 'plan', 'planning', 'split',
  'divide', 'move', 'change', 'switch', 'mark', 'file', 'delete', 'remove',
  'erase', 'scrap', 'undo', 'single', 'unusual', 'spikes', 'anomaly',
  'anomalies', 'portion', 'weekend', 'weekends', 'weekday', 'weekdays',
  'soon', 'due', 'bigger', 'lower', 'higher', 'availed', 'anywhere',
  ...CALENDAR_WORDS,
  'quarter', 'tonight', 'morning', 'evening', 'afternoon',
  'ago', 'past', 'since', 'until', 'from', 'earlier', 'later', 'recent',
  'recently', 'lately', 'nowadays',
];

function buildVocab(): Set<string> {
  const vocab = new Set<string>();
  const add = (term: string): void => {
    for (const w of term.toLowerCase().split(/[^a-z']+/)) {
      if (w.length >= 2) vocab.add(w);
    }
  };
  // 1) The classifier's word vocabulary — the entire training corpus.
  const idf = (modelJson as { idf: Record<string, number> }).idf;
  for (const key of Object.keys(idf)) {
    if (key.startsWith('w:')) add(key.slice(2));
  }
  // 2) Taxonomy keywords/aliases (flattened dict — includes multi-word keys).
  for (const key of Object.keys(aiMappings)) add(key);
  // 3) Intent trigger terms.
  for (const term of TRIGGER_TERMS) add(term);
  // 4) Function words.
  for (const w of COMMON_WORDS) add(w);
  return vocab;
}

const VOCAB = buildVocab();

// Length-bucketed candidate lists so a correction only scans plausible words.
const BUCKETS = new Map<number, string[]>();
for (const w of VOCAB) {
  const arr = BUCKETS.get(w.length);
  if (arr) arr.push(w);
  else BUCKETS.set(w.length, [w]);
}

/**
 * Fold the user's own words — account and category names — into the vocab at
 * runtime (INTELLIGENCE_UPGRADE.md A3; wired per REVIEW_2026-07-08 P0.1).
 * An in-vocab word is never rewritten, so "Wallet"/"Groceries"/a custom
 * "Marco fund" survive the corrector, and a typo'd account name can snap TO
 * the real one. Idempotent and cheap — callers pass names on every message.
 */
export function extendSpellVocab(
  terms: readonly (string | null | undefined)[] | undefined
): void {
  if (!terms || terms.length === 0) return;
  for (const term of terms) {
    if (!term) continue;
    for (const w of term.toLowerCase().split(/[^a-z']+/)) {
      if (w.length < 2 || VOCAB.has(w)) continue;
      VOCAB.add(w);
      const arr = BUCKETS.get(w.length);
      if (arr) arr.push(w);
      else BUCKETS.set(w.length, [w]);
    }
  }
}

const toleranceFor = (len: number): number => (len <= 5 ? 1 : 2);

/**
 * Correct one lowercase token, or return null to keep it. Exported for the
 * typo harness; app code goes through {@link spellNormalize}.
 */
export function correctToken(lower: string): string | null {
  if (lower.length < 4) return null;
  if (VOCAB.has(lower)) return null;
  const tol = toleranceFor(lower.length);

  let best: string | null = null;
  let bestDist = tol + 1;
  let bestCount = 0;
  for (let len = lower.length - tol; len <= lower.length + tol; len++) {
    const bucket = BUCKETS.get(len);
    if (!bucket) continue;
    for (const cand of bucket) {
      // Never correct a token INTO a calendar word (REVIEW_2026-07-08 P0.1):
      // months/weekdays are the nearest vocab neighbours of people's names
      // ("marco" → "march", "frida" → "friday"), and that rewrite makes the
      // brain answer a different question at high confidence. Calendar words
      // still live in VOCAB (a correctly-spelled month returns null early), so
      // this only forbids them as correction TARGETS.
      if (CALENDAR_TARGETS.has(cand)) continue;
      const d = osaDistance(lower, cand, tol);
      if (d < bestDist) {
        bestDist = d;
        best = cand;
        bestCount = 1;
      } else if (d === bestDist && cand !== best) {
        bestCount += 1;
      }
    }
  }
  // Unique best within tolerance, or nothing. A tie means two known words are
  // equally close — guessing between them is exactly the failure mode this
  // module exists to avoid.
  if (best !== null && bestDist <= tol && bestCount === 1) return best;
  return null;
}

// Tokens are letter runs (with in-word apostrophes/hyphens); digits and mixed
// alphanumerics ("crwam20" pre-split, "5k") are never touched here.
const TOKEN_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]/g;

/**
 * True when the token at `offset` opens a sentence — nothing but whitespace
 * precedes it, or the last non-space character was a sentence terminator. Used
 * to tell a leading Capital (normal casing) from a mid-sentence Capital (likely
 * a proper noun) so the corrector leaves people/brand names alone.
 */
function isSentenceStart(text: string, offset: number): boolean {
  for (let i = offset - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') continue;
    return ch === '.' || ch === '!' || ch === '?';
  }
  return true;
}

/**
 * Return `text` with out-of-vocabulary tokens snapped to their unique nearest
 * known word ("how mcuh did i spnd" → "how much did i spend"). Corrections
 * come out lowercase; untouched tokens keep the user's casing. Idempotent —
 * corrected output passes through unchanged.
 *
 * Stateless on purpose (REVIEW_2026-07-08 P1.5 — a module-global memo used to
 * live here, thrashing on interleaved inputs). Re-correcting the same short
 * message a few times per send is cheap: in-vocab tokens are one Set lookup,
 * and `correctToken` only scans buckets for OOV tokens of ≥ 4 letters.
 */
export function spellNormalize(text: string): string {
  if (!text) return text;
  return text.replace(TOKEN_RE, (w, offset: number) => {
    if (w.length < 4 || w.includes("'")) return w;
    // A capitalized token mid-sentence is almost always a proper noun (a
    // person or brand — "…did i pay Marco"); "correcting" it into a vocab word
    // makes the brain answer a different question (REVIEW_2026-07-08 P0.1).
    // A leading Capital (normal casing) is not a signal, so only skip when the
    // token isn't at a sentence start.
    if (/^[A-Z]/.test(w) && !isSentenceStart(text, offset)) return w;
    return correctToken(w.toLowerCase()) ?? w;
  });
}
