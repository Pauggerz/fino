/**
 * Slot extraction — rule chunking, not CRF (FINO_INTELLIGENCE_V2.md §4.2).
 *
 * We deliberately reuse the categorization engine as the entity recognizer:
 * the same taxonomy that tags "kape → Coffee" when *logging* detects "kape" as
 * a category slot when *asking*. Time ranges come from the `core/time` grammar,
 * amounts from the shared extractor. Everything is dictionary + rule based, so
 * it ships to Hermes with no model weights.
 *
 * Slots are read off the original normalized message (not the canonicalized
 * one), so a category/time/amount the user mentioned is never lost to an
 * intent reduction.
 */

import { analyzeTransactionText } from '../categorize/categorize';
import type { MasterCategory } from '../taxonomy/taxonomy';
import { expandNumberWords } from '../core/normalize';
import { extractAmounts } from '../core/amounts';
import { parseTimeRange, type TimeRange } from '../core/time';

const MASTER_LABELS: Record<MasterCategory, string> = {
  food: 'Food',
  transport: 'Transport',
  bills: 'Bills',
  health: 'Health',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  other: 'Other',
};

export type CategorySlot = {
  /** Master taxonomy bucket the keyword resolved to. */
  master: MasterCategory;
  /** The surface keyword that matched ("coffee", "grab", "meralco"). */
  keyword: string;
  /** Best display label — the user's own category name when known, else the
   *  master label. */
  label: string;
};

export type Slots = {
  /** Parsed time window, or undefined when no temporal phrase was present. */
  timeRange?: TimeRange;
  /** Category the question is scoped to ("how much on food"), if any. */
  category?: CategorySlot;
  /** Any peso/number amounts in the message ("more than 1000"). */
  amounts: number[];
  /** Lower amount bound from "over / more than / at least ₱X". */
  amountMin?: number;
  /** Upper amount bound from "under / less than / up to ₱X". */
  amountMax?: number;
  /** Result count from "last five", "top 3", "show me 10". */
  limit?: number;
  /** Free-text merchant/brand the taxonomy may not know ("Spotify",
   *  "internet bill"), for `query.matchMerchant`. Only set when there's a clear
   *  "my X payment / bill / charge" style phrase. */
  merchant?: string;
  /** A clearly-temporal phrase was present but didn't resolve to a concrete
   *  range ("lately", "the past few days") — the brain should clarify the
   *  window rather than silently defaulting to "this month". */
  timeRangeUnresolved?: boolean;
};

export type SlotOptions = {
  /** Injectable clock for deterministic tests. */
  now?: Date;
  /** The user's active category names, so a matched keyword bubbles up to the
   *  user's own category label (e.g. "Coffee" instead of master "Food"). */
  categoryNames?: string[];
};

const num = (s: string): number => parseFloat(s.replace(/,/g, ''));
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;

const OVER_RE = new RegExp(
  String.raw`\b(?:over|above|more than|greater than|at least|minimum(?: of)?|min(?: of)?|bigger than|exceed(?:ing|s)?|>=?)\s*₱?\s*${NUM}`
);
const UNDER_RE = new RegExp(
  String.raw`\b(?:under|below|less than|lower than|cheaper than|at most|maximum(?: of)?|max(?: of)?|up to|no more than|<=?)\s*₱?\s*${NUM}`
);
const BETWEEN_RE = new RegExp(
  String.raw`\bbetween\s*₱?\s*${NUM}\s*(?:and|to|-|–)\s*₱?\s*${NUM}`
);

/** Clearly-temporal but unparseable phrasing — triggers a time clarify instead
 *  of a silent "this month" default. Tight on purpose: no bare "recent", which
 *  is a recency sort for transactions, not a vague window. */
const VAGUE_TIME_RE =
  /\b(recently|lately|nowadays|these days|the other day|past few|last few|a while (?:ago|back)|some time ago|a few days|a couple of days|couple days|kamakailan)\b/;

const LIMIT_RE =
  /\b(?:last|latest|recent|top|first|previous|show(?: me)?|give me)\s+(\d{1,3})\b/;
const LIMIT_TRAILING_RE =
  /\b(\d{1,3})\s+(?:transactions?|txns?|expenses?|purchases?|entries|items|charges?)\b/;

/** "my Spotify payment", "the internet bill", "that grab charge" → the noun.
 *  Generic nouns (expense / purchase / transaction) are deliberately NOT
 *  trailing tokens here, so "my highest single expense" isn't read as a merchant
 *  named "highest single". */
const MERCHANT_RE =
  /\b(?:my|the|a|that|paid|on my|for my)\s+([a-z][a-z0-9&'.\- ]{1,24}?)\s+(?:payment|bill|charge|subscription|subscriptions|sub|fee|membership|invoice)\b/;
/** "which category did my Spotify fall under" — captures before fall/go/under. */
const MERCHANT_CAT_RE =
  /\bcategory\s+(?:did|was|for|of|is|does)\s+(?:my|the|a)?\s*([a-z][a-z0-9&'.\- ]{1,24}?)\s+(?:payment|fall|fell|go|went|come|land|get)\b/;

/** Command / listing verbs that the logging taxonomy maps to a category but
 *  which are never the category subject in a question. */
const COMMAND_STOPWORDS = new Set([
  'show',
  'list',
  'find',
  'give',
  'see',
  'view',
  'get',
  'display',
  'pull',
  'single',
  'latest',
]);

/** Determiners/fillers to strip from a captured merchant phrase. */
const MERCHANT_STOP = new Set([
  'my',
  'the',
  'a',
  'that',
  'this',
  'last',
  'recent',
  'latest',
]);

function extractMerchant(normalized: string): string | undefined {
  const m = MERCHANT_RE.exec(normalized) ?? MERCHANT_CAT_RE.exec(normalized);
  if (!m) return undefined;
  const words = m[1]
    .trim()
    .split(/\s+/)
    .filter((w) => !MERCHANT_STOP.has(w));
  const term = words.join(' ').trim();
  // Need at least 3 chars of signal so a stray "a"/"my" doesn't become a query.
  return term.length >= 3 ? term : undefined;
}

/**
 * Extract structured slots from a normalized question. Pure and synchronous.
 *
 * The category slot only fires on a HIGH-confidence taxonomy match — in a
 * question we want solid signals ("on coffee", "for grab") and would rather
 * miss a fuzzy guess than scope an answer to the wrong category.
 */
export function extractSlots(
  normalized: string,
  opts: SlotOptions = {}
): Slots {
  const slots: Slots = { amounts: [] };
  const expanded = expandNumberWords(normalized);

  const timeRange = parseTimeRange(normalized, opts.now);
  if (timeRange) slots.timeRange = timeRange;
  else if (VAGUE_TIME_RE.test(normalized)) slots.timeRangeUnresolved = true;

  slots.amounts = extractAmounts(expanded);

  // Amount bounds: "between A and B" wins, else over/under comparators.
  const between = BETWEEN_RE.exec(expanded);
  if (between) {
    const a = num(between[1]);
    const b = num(between[2]);
    slots.amountMin = Math.min(a, b);
    slots.amountMax = Math.max(a, b);
  } else {
    const over = OVER_RE.exec(expanded);
    if (over) slots.amountMin = num(over[1]);
    const under = UNDER_RE.exec(expanded);
    if (under) slots.amountMax = num(under[1]);
  }

  // Result limit: "last five", "top 3", "10 transactions" (capped).
  const lim = LIMIT_RE.exec(expanded) ?? LIMIT_TRAILING_RE.exec(expanded);
  if (lim) {
    const n = parseInt(lim[1], 10);
    if (Number.isFinite(n) && n > 0) slots.limit = Math.min(n, 100);
  }

  const merchant = extractMerchant(normalized);
  if (merchant) slots.merchant = merchant;

  const analysis = analyzeTransactionText(normalized, opts.categoryNames);
  if (
    analysis.matchedKeyword &&
    analysis.suggestedCategory &&
    analysis.confidence === 'high' &&
    analysis.matchedKeyword.length >= 3 &&
    // In a QUESTION, command/listing verbs are never the category subject. The
    // logging taxonomy maps e.g. "show" → Entertainment ("watched a show") and
    // "single" → music; suppress those so "show me my transactions" isn't
    // scoped to Entertainment.
    !COMMAND_STOPWORDS.has(analysis.matchedKeyword.toLowerCase())
  ) {
    slots.category = {
      master: analysis.suggestedCategory,
      keyword: analysis.matchedKeyword,
      label:
        analysis.resolvedCategory ?? MASTER_LABELS[analysis.suggestedCategory],
    };
  }

  return slots;
}
