/**
 * PH-aware temporal parser — a small rule grammar that turns natural phrases
 * ("today", "last week", "ngayong buwan", "kahapon", "noong isang buwan") into
 * a concrete `{ start, end }` range. Pure and `now`-injectable so the brain
 * harness can test it deterministically.
 *
 * This is the Convo brain's time-slot extractor (FINO_INTELLIGENCE_V2.md §4.2).
 * It is dictionary + rule based — no NLP toolchain, ships to Hermes as-is.
 *
 * V3: the brain now queries a real transaction snapshot, so the full grammar
 * (years, quarters, named months, weekdays, weekend, last-30-days) resolves to
 * concrete ranges the query engine filters on — no more "open Insights for
 * sub-month views" deferral. Parameterized ranges (a specific month / weekday /
 * quarter) share a key (`namedMonth` / `weekday` / `quarter`) and carry the
 * specifics in `label` + `start`/`end`.
 */

export type TimeRangeKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear'
  | 'quarter'
  | 'namedMonth'
  | 'weekday'
  | 'weekend'
  | 'last30Days'
  | 'lastNDays'
  | 'daysAgo';

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

/** The six self-contained keys whose range is fully determined by the key. */
type SimpleKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth';

function rangeFor(key: SimpleKey, now: Date): TimeRange {
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

// ─── Parameterized range builders (V3) ───────────────────────────────────────

const startOfMonth = (y: number, m: number): Date =>
  new Date(y, m, 1, 0, 0, 0, 0);
const endOfMonth = (y: number, m: number): Date =>
  new Date(y, m + 1, 0, 23, 59, 59, 999);

const cap = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** offset 0 = this year, -1 = last year. */
function buildYear(now: Date, offset: number): TimeRange {
  const y = now.getFullYear() + offset;
  return {
    key: offset === 0 ? 'thisYear' : 'lastYear',
    label: offset === 0 ? 'this year' : 'last year',
    start: new Date(y, 0, 1, 0, 0, 0, 0),
    end: new Date(y, 11, 31, 23, 59, 59, 999),
  };
}

/** q ∈ 1..4 → its most recent occurrence (this year if it has already begun,
 *  otherwise last year's) — mirrors `buildNamedMonth`, so "Q4" asked in June
 *  never resolves to an empty future range. */
function buildQuarter(now: Date, q: number): TimeRange {
  const startMonth = (q - 1) * 3;
  const y =
    startMonth > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
  return {
    key: 'quarter',
    label: `Q${q}`,
    start: startOfMonth(y, startMonth),
    end: endOfMonth(y, startMonth + 2),
  };
}

/** monthIndex 0..11 → its most recent occurrence (this year if already begun,
 *  otherwise last year). */
function buildNamedMonth(
  now: Date,
  monthIndex: number,
  label: string
): TimeRange {
  const y =
    monthIndex > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
  return {
    key: 'namedMonth',
    label: cap(label),
    start: startOfMonth(y, monthIndex),
    end: endOfMonth(y, monthIndex),
  };
}

/** targetDow uses JS `getDay()` numbering (0 = Sun … 6 = Sat). Resolves to the
 *  most recent occurrence on or before `now`. */
function buildWeekday(now: Date, targetDow: number, label: string): TimeRange {
  const offset = (now.getDay() - targetDow + 7) % 7;
  const day = addDays(now, -offset);
  return {
    key: 'weekday',
    label: cap(label),
    start: startOfDay(day),
    end: endOfDay(day),
  };
}

/** The most recent Saturday–Sunday pair that has already begun. */
function buildWeekend(now: Date): TimeRange {
  // Most recent Saturday on or before today (getDay() 6 = Sat).
  const offsetToSat = (now.getDay() - 6 + 7) % 7;
  const sat = addDays(now, -offsetToSat);
  return {
    key: 'weekend',
    label: 'the weekend',
    start: startOfDay(sat),
    end: endOfDay(addDays(sat, 1)),
  };
}

/** Rolling 30-day window ending today (inclusive). */
function buildLast30(now: Date): TimeRange {
  return {
    key: 'last30Days',
    label: 'the last 30 days',
    start: startOfDay(addDays(now, -29)),
    end: endOfDay(now),
  };
}

const MONTHS_SHORT = [
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
const fmtShortDate = (d: Date): string =>
  `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;

/** Rolling N-day window ending today (inclusive) — generalizes buildLast30. */
function buildLastNDays(now: Date, n: number): TimeRange {
  const days = Math.max(1, n);
  return {
    key: 'lastNDays',
    label: `the last ${days} days`,
    start: startOfDay(addDays(now, -(days - 1))),
    end: endOfDay(now),
  };
}

/** Rolling N-week (N×7-day) window ending today (inclusive). */
function buildLastNWeeks(now: Date, n: number): TimeRange {
  const weeks = Math.max(1, n);
  return {
    key: 'lastNDays',
    label: weeks === 1 ? 'the last week' : `the last ${weeks} weeks`,
    start: startOfDay(addDays(now, -(weeks * 7 - 1))),
    end: endOfDay(now),
  };
}

/** The single calendar day N days before today ("3 days ago"). */
function buildDaysAgo(now: Date, n: number): TimeRange {
  const d = addDays(now, -Math.max(0, n));
  return {
    key: 'daysAgo',
    label: fmtShortDate(d),
    start: startOfDay(d),
    end: endOfDay(d),
  };
}

const MONTH_DEFS: { re: RegExp; index: number; label: string }[] = [
  { re: /\bjan(uary)?\b/, index: 0, label: 'January' },
  { re: /\bfeb(ruary)?\b/, index: 1, label: 'February' },
  { re: /\b(mar(ch)?)\b/, index: 2, label: 'March' },
  { re: /\bapr(il)?\b/, index: 3, label: 'April' },
  // Guard "may" against the modal verb ("may I…", "may be") — only the month.
  { re: /\bmay\b(?!\s+(?:i|we|you|be|not|have|just))/, index: 4, label: 'May' },
  { re: /\bjun(e)?\b/, index: 5, label: 'June' },
  { re: /\bjul(y)?\b/, index: 6, label: 'July' },
  { re: /\baug(ust)?\b/, index: 7, label: 'August' },
  { re: /\bsep(t|tember)?\b/, index: 8, label: 'September' },
  { re: /\boct(ober)?\b/, index: 9, label: 'October' },
  { re: /\bnov(ember)?\b/, index: 10, label: 'November' },
  { re: /\bdec(ember)?\b/, index: 11, label: 'December' },
];

const WEEKDAY_DEFS: { re: RegExp; dow: number; label: string }[] = [
  { re: /\b(mon(day)?)\b/, dow: 1, label: 'Monday' },
  { re: /\b(tue(s|sday)?)\b/, dow: 2, label: 'Tuesday' },
  { re: /\b(wed(nesday)?)\b/, dow: 3, label: 'Wednesday' },
  { re: /\b(thu(r|rs|rsday)?)\b/, dow: 4, label: 'Thursday' },
  { re: /\b(fri(day)?)\b/, dow: 5, label: 'Friday' },
  { re: /\b(sat(urday)?)\b/, dow: 6, label: 'Saturday' },
  { re: /\b(sun(day)?)\b/, dow: 0, label: 'Sunday' },
];

const QUARTER_DEFS: { re: RegExp; q: number }[] = [
  { re: /\b(q1|first quarter|1st quarter|quarter 1)\b/, q: 1 },
  { re: /\b(q2|second quarter|2nd quarter|quarter 2)\b/, q: 2 },
  { re: /\b(q3|third quarter|3rd quarter|quarter 3)\b/, q: 3 },
  { re: /\b(q4|fourth quarter|4th quarter|quarter 4)\b/, q: 4 },
];

// Relative rolling windows + "N days ago". The N is captured and read in
// parseTimeRange; these sit AFTER the fixed "last 30 days" rule so that exact
// phrase keeps its dedicated `last30Days` key.
const LAST_N_DAYS_RE =
  /\b(?:last|past|previous|nakaraang|huling)\s+(\d{1,3})\s+(?:days?|araw)\b/;
const LAST_N_WEEKS_RE =
  /\b(?:last|past|previous|nakaraang|huling)\s+(\d{1,3})\s+(?:weeks?|linggo)\b/;
const N_DAYS_AGO_RE = /\b(\d{1,3})\s+(?:days?|araw)\s+ago\b/;

type Pattern = {
  re: RegExp;
  build: (now: Date, m: RegExpMatchArray) => TimeRange;
};

const simple = (key: SimpleKey, re: RegExp): Pattern => ({
  re,
  build: (now) => rangeFor(key, now),
});

/**
 * Ordered phrase table — most-specific first so "this month" wins before a bare
 * month name, and explicit "today"/"yesterday" win before a weekday name.
 * Patterns match on the already-normalized (lowercased, diacritic-folded)
 * message; word boundaries keep "today" out of "todays".
 */
const PATTERNS: Pattern[] = [
  // Months (most specific keyed phrases first so "last month" beats "month").
  simple(
    'lastMonth',
    /\b(last month|past month|nakaraang buwan|noong isang buwan|nakaraan buwan|miaging bulan|prev month|previous month)\b/
  ),
  simple(
    'thisMonth',
    /\b(this month|ngayong buwan|karong bulan|current month|buwang ito|sa buwan na ito)\b/
  ),
  // Quarters.
  ...QUARTER_DEFS.map(
    ({ re, q }): Pattern => ({ re, build: (now) => buildQuarter(now, q) })
  ),
  // Years.
  {
    re: /\b(last year|past year|previous year|prev year|nakaraang taon|miaging tuig)\b/,
    build: (now) => buildYear(now, -1),
  },
  {
    re: /\b(this year|current year|ngayong taon|karong tuig|year to date|ytd)\b/,
    build: (now) => buildYear(now, 0),
  },
  // Named months ("march", "in april", "for q1" already handled above).
  ...MONTH_DEFS.map(
    ({ re, index, label }): Pattern => ({
      re,
      build: (now) => buildNamedMonth(now, index, label),
    })
  ),
  // Weeks.
  simple(
    'lastWeek',
    /\b(last week|past week|nakaraang linggo|noong isang linggo|miaging semana|prev week|previous week)\b/
  ),
  simple(
    'thisWeek',
    /\b(this week|ngayong linggo|karong semana|current week|linggong ito)\b/
  ),
  // Weekend + rolling 30-day window.
  {
    re: /\b(weekend|katapusan ng linggo)\b/,
    build: (now) => buildWeekend(now),
  },
  {
    re: /\b(last 30 days|past 30 days|last thirty days|nakaraang 30 araw|huling 30 araw|30 days)\b/,
    build: (now) => buildLast30(now),
  },
  // Relative rolling windows ("last 7 days", "past 2 weeks") + "N days ago".
  {
    re: LAST_N_WEEKS_RE,
    build: (now, m) => buildLastNWeeks(now, parseInt(m[1], 10)),
  },
  {
    re: LAST_N_DAYS_RE,
    build: (now, m) => buildLastNDays(now, parseInt(m[1], 10)),
  },
  {
    re: N_DAYS_AGO_RE,
    build: (now, m) => buildDaysAgo(now, parseInt(m[1], 10)),
  },
  // Days (explicit today/yesterday before weekday names).
  simple('yesterday', /\b(yesterday|kahapon|gahapon)\b/),
  simple('today', /\b(today|ngayong araw|karong adlaw|karon|so far today)\b/),
  // Specific weekday ("on tuesday").
  ...WEEKDAY_DEFS.map(
    ({ re, dow, label }): Pattern => ({
      re,
      build: (now) => buildWeekday(now, dow, label),
    })
  ),
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
  for (const { re, build } of PATTERNS) {
    const m = re.exec(text);
    if (m) return build(now, m);
  }
  return null;
}
