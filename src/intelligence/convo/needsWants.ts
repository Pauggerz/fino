/**
 * Needs-vs-Wants heuristic (FINO_CHATBOT V3, Category 2 — `needsVsWants`).
 *
 * A deliberately ROUGH, documented split. It maps a transaction's category name
 * to `need` | `want` | `unknown`; the brain always surfaces the result as "a
 * rough split", never as ground truth (a gym membership is a need for one
 * person and a want for another). Pure & synchronous — it reuses the shared
 * taxonomy the same way `slots.ts` does, so it loads in the `tsx` harness.
 *
 * Resolution order (first match wins):
 *   1. Explicit category-name hints (normalized substring). These OVERRIDE the
 *      master lean so "dining out" (food master) reads as a want and
 *      "groceries" (also food) reads as a need. When a name matches both a need
 *      and a want hint, the ambiguity falls through to the master lean.
 *   2. Master-category lean via the shared taxonomy (`analyzeTransactionText`).
 *   3. `unknown` when nothing resolves — kept out of the ratio, surfaced as
 *      "uncategorized" so the split stays honest.
 */

import { analyzeTransactionText } from '../categorize/categorize';
import type { MasterCategory } from '../taxonomy/taxonomy';
import { normalize } from '../core/normalize';

export type NeedWant = 'need' | 'want' | 'unknown';

/** Default lean per master bucket. Daily food skews need (dining is pulled out
 *  by the want hints); shopping / entertainment skew want; `other` is unknown. */
const MASTER_LEAN: Record<MasterCategory, NeedWant> = {
  bills: 'need',
  health: 'need',
  transport: 'need',
  food: 'need',
  shopping: 'want',
  entertainment: 'want',
  other: 'unknown',
};

/** Substrings that pin a category name to a need regardless of its master. */
const NEED_HINTS = [
  'rent',
  'mortgage',
  'amortization',
  'housing',
  'grocery',
  'groceries',
  'utilit',
  'electric',
  'meralco',
  'water',
  'maynilad',
  'internet',
  'wifi',
  'fiber',
  'load',
  'tuition',
  'school',
  'education',
  'insurance',
  'medic',
  'medicine',
  'meds',
  'health',
  'hospital',
  'pharmacy',
  'clinic',
  'dental',
  'fare',
  'jeep',
  'bus',
  'mrt',
  'lrt',
  'commute',
  'fuel',
  'gasoline',
  'loan',
  'debt',
  'utang',
  'childcare',
  'daycare',
  'tax',
  'rice',
  'baon',
];

/** Substrings that pin a category name to a want regardless of its master. */
const WANT_HINTS = [
  'dining',
  'restaurant',
  'eat out',
  'fast food',
  'fastfood',
  'snack',
  'coffee',
  'cafe',
  'milk tea',
  'milktea',
  'boba',
  'dessert',
  'entertain',
  'movie',
  'cinema',
  'game',
  'gaming',
  'steam',
  'subscription',
  'netflix',
  'spotify',
  'youtube',
  'shopping',
  'clothes',
  'clothing',
  'apparel',
  'fashion',
  'shoes',
  'gadget',
  'travel',
  'vacation',
  'trip',
  'hotel',
  'hobby',
  'alcohol',
  'beer',
  'liquor',
  'bar',
  'gift',
  'beauty',
  'salon',
  'spa',
  'makeup',
  'cosmetics',
  'lazada',
  'shopee',
];

const hasAny = (hay: string, needles: string[]): boolean =>
  needles.some((n) => hay.includes(n));

/**
 * Classify a single category name as a need, a want, or unknown. `unknown` is
 * returned for empty / unrecognized names so the caller can exclude it.
 */
export function classifyNeedWant(
  categoryName: string | null | undefined
): NeedWant {
  const name = normalize(categoryName ?? '');
  if (!name) return 'unknown';

  const needHit = hasAny(name, NEED_HINTS);
  const wantHit = hasAny(name, WANT_HINTS);
  if (needHit && !wantHit) return 'need';
  if (wantHit && !needHit) return 'want';
  // Both or neither → fall back to the master lean.

  const master = analyzeTransactionText(categoryName ?? '').suggestedCategory;
  return master ? MASTER_LEAN[master] : 'unknown';
}

export type NeedsWantsSplit = {
  need: number;
  want: number;
  unknown: number;
  /** The classified spend total (need + want; excludes unknown). */
  classified: number;
  /** Categories that landed in each bucket, sorted high → low. */
  needCats: { name: string; amount: number }[];
  wantCats: { name: string; amount: number }[];
};

/**
 * Aggregate a by-category breakdown into a needs / wants / unknown split.
 * Classifies each DISTINCT category once (cheap), so it stays O(categories).
 */
export function summarizeNeedsWants(
  buckets: { name: string; amount: number }[]
): NeedsWantsSplit {
  const split: NeedsWantsSplit = {
    need: 0,
    want: 0,
    unknown: 0,
    classified: 0,
    needCats: [],
    wantCats: [],
  };
  for (const b of buckets) {
    const verdict = classifyNeedWant(b.name);
    if (verdict === 'need') {
      split.need += b.amount;
      split.needCats.push(b);
    } else if (verdict === 'want') {
      split.want += b.amount;
      split.wantCats.push(b);
    } else {
      split.unknown += b.amount;
    }
  }
  split.classified = split.need + split.want;
  split.needCats.sort((a, b) => b.amount - a.amount);
  split.wantCats.sort((a, b) => b.amount - a.amount);
  return split;
}
