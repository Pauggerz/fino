/**
 * Pure transaction-query engine (FINO_CHATBOT V3 §"core lever").
 *
 * The brain stays synchronous and offline-pure: ChatScreen injects a bounded
 * snapshot of `TxLite` rows into `BrainContext.transactions`, and these pure
 * functions filter / aggregate over that in-memory array. No DB, no async, no
 * React Native — so this loads in the `tsx` test harness and is covered by
 * `scripts/test-query.ts`.
 *
 * Spending vs. non-spending: like the rest of the app (IntelligenceEngine,
 * useMonthlyTotals), transfer-type rows and `adjustment`-category rows are not
 * real spending behaviour, so they are dropped by default. Pass
 * `includeNonSpending: true` to keep them (e.g. a raw "all transactions" list).
 */

import { normalize } from '../core/normalize';
import type { TxLite } from './types';

export type DateRange = { start: Date; end: Date };

export type TxFilter = {
  /** Inclusive date window (on `tx.date`). */
  range?: DateRange;
  /** Any-of category names, matched case-insensitively against `tx.category`. */
  categories?: string[];
  /** Restrict to one transaction type. */
  type?: TxLite['type'];
  /** Free-text merchant/name substring (normalized) — e.g. "spotify". */
  merchant?: string;
  /** Inclusive amount bounds. */
  amountMin?: number;
  amountMax?: number;
  /** Keep transfer-type + adjustment-category rows (default: drop them). */
  includeNonSpending?: boolean;
};

const isAdjustment = (t: TxLite): boolean =>
  (t.category ?? '').trim().toLowerCase() === 'adjustment';

const isTransferRow = (t: TxLite): boolean =>
  t.type === 'transfer' ||
  (t.category ?? '').trim().toLowerCase() === 'transfer';

/** True when `iso` falls within the inclusive range. */
export function inRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/** Filter a snapshot by any combination of dimensions. Returns a new array. */
export function selectTx(txns: TxLite[], filter: TxFilter = {}): TxLite[] {
  const {
    range,
    categories,
    type,
    merchant,
    amountMin,
    amountMax,
    includeNonSpending = false,
  } = filter;

  const cats = categories?.map((c) => c.trim().toLowerCase()).filter(Boolean);
  const merch = merchant ? normalize(merchant) : null;

  return txns.filter((t) => {
    if (!includeNonSpending && (isTransferRow(t) || isAdjustment(t)))
      return false;
    if (type && t.type !== type) return false;
    if (range && !inRange(t.date, range)) return false;
    if (cats && cats.length) {
      const c = (t.category ?? '').trim().toLowerCase();
      if (!cats.includes(c)) return false;
    }
    if (merch) {
      const hay = normalize(`${t.merchant ?? ''} ${t.name ?? ''}`);
      if (!hay.includes(merch)) return false;
    }
    if (amountMin != null && t.amount < amountMin) return false;
    if (amountMax != null && t.amount > amountMax) return false;
    return true;
  });
}

/** Newest-first by `date`. Returns a new array (does not mutate). */
export function sortByDateDesc(txns: TxLite[]): TxLite[] {
  return [...txns].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function take<T>(items: T[], n: number): T[] {
  return n >= 0 ? items.slice(0, n) : items.slice();
}

export function sumAmount(txns: TxLite[]): number {
  return txns.reduce((s, t) => s + t.amount, 0);
}

export type CategoryBucket = { name: string; amount: number; count: number };

/** Group by category name (preserving the first-seen display casing), sorted
 *  high → low by amount. */
export function groupByCategory(txns: TxLite[]): CategoryBucket[] {
  const map = new Map<string, CategoryBucket>();
  for (const t of txns) {
    const display = t.category?.trim() || 'Other';
    const key = display.toLowerCase();
    const cur = map.get(key);
    if (cur) {
      cur.amount += t.amount;
      cur.count += 1;
    } else {
      map.set(key, { name: display, amount: t.amount, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export type DowBucket = {
  index: number;
  label: string;
  amount: number;
  count: number;
};

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Group by Monday-start day-of-week (0 = Mon … 6 = Sun). Always returns 7
 *  buckets so the renderer can draw a full week even with zeros. */
export function groupByDayOfWeek(txns: TxLite[]): DowBucket[] {
  const buckets: DowBucket[] = DOW_LABELS.map((label, index) => ({
    index,
    label,
    amount: 0,
    count: 0,
  }));
  for (const t of txns) {
    const d = new Date(t.date);
    // Skip malformed dates (NaN → no bucket).
    if (!Number.isNaN(d.getTime())) {
      const dow = (d.getDay() + 6) % 7; // 0 = Mon
      buckets[dow].amount += t.amount;
      buckets[dow].count += 1;
    }
  }
  return buckets;
}

export type MonthBucket = {
  year: number;
  /** 0-based month index. */
  month: number;
  /** Short label, e.g. "Jan" / "Jan '25" when the set spans years. */
  label: string;
  amount: number;
  count: number;
};

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Group by calendar month, sorted chronologically. Only months that actually
 *  have rows appear (no zero-fill — a missing month usually means no data, and
 *  calling it the "cheapest" would be wrong). Labels carry the year ("Jan '25")
 *  when the buckets span more than one. */
export function groupByMonth(txns: TxLite[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const t of txns) {
    const d = new Date(t.date);
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${month}`;
      const cur = map.get(key);
      if (cur) {
        cur.amount += t.amount;
        cur.count += 1;
      } else {
        map.set(key, {
          year,
          month,
          label: MONTH_LABELS[month],
          amount: t.amount,
          count: 1,
        });
      }
    }
  }
  const buckets = [...map.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
  const years = new Set(buckets.map((b) => b.year));
  if (years.size > 1) {
    for (const b of buckets) {
      b.label = `${MONTH_LABELS[b.month]} '${String(b.year % 100).padStart(2, '0')}`;
    }
  }
  return buckets;
}

/** The element with the maximum `fn(el)`, or null when empty. */
export function maxBy<T>(items: T[], fn: (el: T) => number): T | null {
  let best: T | null = null;
  let bestVal = -Infinity;
  for (const el of items) {
    const v = fn(el);
    if (v > bestVal) {
      bestVal = v;
      best = el;
    }
  }
  return best;
}

/** Transactions whose merchant/name contains `term` (normalized substring). */
export function matchMerchant(txns: TxLite[], term: string): TxLite[] {
  const needle = normalize(term);
  if (!needle) return [];
  return txns.filter((t) =>
    normalize(`${t.merchant ?? ''} ${t.name ?? ''}`).includes(needle)
  );
}
