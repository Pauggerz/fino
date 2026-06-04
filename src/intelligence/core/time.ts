/**
 * PH-aware temporal parser — a small rule grammar that turns natural phrases
 * ("today", "last week", "ngayong buwan", "kahapon", "noong isang buwan") into
 * a concrete `{ start, end }` range. Pure and `now`-injectable so the brain
 * harness can test it deterministically.
 *
 * This is the Convo brain's time-slot extractor (FINO_INTELLIGENCE_V2.md §4.2).
 * It is dictionary + rule based — no NLP toolchain, ships to Hermes as-is.
 *
 * Scope note: the live `BrainContext` only carries this-month and last-month
 * aggregates, so today/week ranges parse correctly but the bridge will tell the
 * user to open Insights for sub-month views. Parsing the full grammar now keeps
 * the slot layer honest and ready for richer data sources later.
 */

export type TimeRangeKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth';

export type TimeRange = {
  key: TimeRangeKey;
  /** Human label for narration, e.g. "last month". */
  label: string;
  /** Inclusive start (local midnight). */
  start: Date;
  /** Inclusive end (local 23:59:59.999). */
  end: Date;
};

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

/** Monday-start week index: 0 = Mon … 6 = Sun. */
const mondayOffset = (d: Date): number => (d.getDay() + 6) % 7;

function rangeFor(key: TimeRangeKey, now: Date): TimeRange {
  switch (key) {
    case 'today':
      return {
        key,
        label: 'today',
        start: startOfDay(now),
        end: endOfDay(now),
      };
    case 'yesterday': {
      const y = addDays(now, -1);
      return {
        key,
        label: 'yesterday',
        start: startOfDay(y),
        end: endOfDay(y),
      };
    }
    case 'thisWeek': {
      const monday = addDays(now, -mondayOffset(now));
      return {
        key,
        label: 'this week',
        start: startOfDay(monday),
        end: endOfDay(addDays(monday, 6)),
      };
    }
    case 'lastWeek': {
      const monday = addDays(now, -mondayOffset(now) - 7);
      return {
        key,
        label: 'last week',
        start: startOfDay(monday),
        end: endOfDay(addDays(monday, 6)),
      };
    }
    case 'thisMonth':
      return {
        key,
        label: 'this month',
        start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        end: new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        ),
      };
    case 'lastMonth':
      return {
        key,
        label: 'last month',
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    default: {
      const exhaustiveCheck: never = key;
      return exhaustiveCheck;
    }
  }
}

/**
 * Ordered phrase table — most-specific first so "this month" wins before the
 * bare "month", and "ngayong buwan" (this month) before "ngayon" (today).
 * Patterns match on the already-normalized (lowercased, diacritic-folded)
 * message; word boundaries keep "today" out of "todays".
 */
const PATTERNS: { key: TimeRangeKey; re: RegExp }[] = [
  {
    key: 'lastMonth',
    re: /\b(last month|past month|nakaraang buwan|noong isang buwan|nakaraan buwan|miaging bulan|prev month|previous month)\b/,
  },
  {
    key: 'thisMonth',
    re: /\b(this month|ngayong buwan|karong bulan|current month|buwang ito|sa buwan na ito)\b/,
  },
  {
    key: 'lastWeek',
    re: /\b(last week|past week|nakaraang linggo|noong isang linggo|miaging semana|prev week|previous week)\b/,
  },
  {
    key: 'thisWeek',
    re: /\b(this week|ngayong linggo|karong semana|current week|linggong ito)\b/,
  },
  { key: 'yesterday', re: /\b(yesterday|kahapon|gahapon)\b/ },
  {
    key: 'today',
    re: /\b(today|ngayong araw|karong adlaw|karon|so far today)\b/,
  },
];

/**
 * Parse the first temporal phrase in `text` into a concrete range, or `null`
 * when no time expression is present (caller defaults to "this month").
 * `now` is injectable for deterministic tests.
 */
export function parseTimeRange(
  text: string,
  now: Date = new Date()
): TimeRange | null {
  if (!text) return null;
  for (const { key, re } of PATTERNS) {
    if (re.test(text)) return rangeFor(key, now);
  }
  return null;
}
