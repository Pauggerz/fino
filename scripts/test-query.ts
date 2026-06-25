/**
 * Standalone terminal test runner for the V3 transaction-query foundation
 * (`convo/query.ts`, the extended `core/time.ts` grammar, and the new
 * `convo/slots.ts` amount/limit/merchant slots). Mirrors `scripts/test-brain.ts`.
 *
 * Run from the repo root:
 *   npx tsx scripts/test-query.ts
 *
 * No Jest, no Expo runtime — imports the pure modules directly from their
 * sub-paths (never the `@/intelligence` barrel, which pulls in the RN-coupled
 * OCR clients). Exit code is 0 on all-pass, 1 on any failure.
 */

import {
  selectTx,
  sortByDateDesc,
  take,
  sumAmount,
  groupByCategory,
  groupByDayOfWeek,
  groupByMonth,
  maxBy,
  matchMerchant,
  inRange,
} from '../src/intelligence/convo/query';
import type { TxLite } from '../src/intelligence/convo/types';
import { parseTimeRange } from '../src/intelligence/core/time';
import { extractSlots } from '../src/intelligence/convo/slots';
import { normalize } from '../src/intelligence/core/normalize';
import {
  classifyNeedWant,
  summarizeNeedsWants,
} from '../src/intelligence/convo/needsWants';

// Fixed clock: Mon 15 Jun 2026, midday. Deterministic for every range test.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

let passed = 0;
let failed = 0;
function check(desc: string, cond: boolean, extra = ''): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${desc}${extra ? ` — ${extra}` : ''}`);
  }
}
function eq<T>(desc: string, actual: T, expected: T): void {
  check(
    desc,
    actual === expected,
    `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const tx = (
  id: string,
  amount: number,
  type: TxLite['type'],
  category: string | null,
  merchant: string | null,
  date: string
): TxLite => ({
  id,
  amount,
  type,
  category,
  merchant,
  name: merchant,
  date,
  accountId: 'acc1',
});

const TXNS: TxLite[] = [
  tx('a', 100, 'expense', 'Food', 'Jollibee', '2026-06-15'), // today (Mon)
  tx('f', 50, 'transfer', 'Transfer', 'Move to Savings', '2026-06-12'),
  tx('b', 5000, 'expense', 'Shopping', 'Lazada', '2026-06-10'),
  tx('c', 1500, 'expense', 'Bills', 'Meralco Electric', '2026-06-09'), // Tue
  tx('e', 30000, 'income', 'Salary', 'ACME Payroll', '2026-06-01'),
  tx('d', 200, 'expense', 'Food', 'Starbucks Coffee', '2026-05-20'),
  tx('g', 8000, 'expense', 'Shopping', 'Spotify Premium', '2026-03-15'), // March
  tx('h', 6000, 'expense', 'Bills', 'PLDT Internet', '2025-12-20'), // Dec 2025
  tx('x', 9000, 'expense', 'Shopping', 'Old TV', '2024-11-01'), // out of window
];

// ─── Query engine ────────────────────────────────────────────────────────────

console.log('Query engine');
{
  // Default selectTx drops transfer-type + adjustment rows.
  const spend = selectTx(TXNS, { type: 'expense' });
  check(
    'expense filter excludes transfer/income',
    spend.every((t) => t.type === 'expense')
  );
  eq('expense count', spend.length, 7); // a,b,c,d,g,h,x

  // amountMin
  const big = selectTx(TXNS, { type: 'expense', amountMin: 5000 });
  eq('amountMin>=5000 count', big.length, 4); // b,g,h,x
  eq('amountMin>=5000 sum', sumAmount(big), 28000);

  // amountMax
  const small = selectTx(TXNS, { type: 'expense', amountMax: 200 });
  eq('amountMax<=200 count', small.length, 2); // a,d

  // category any-of (case-insensitive)
  const shop = selectTx(TXNS, { type: 'expense', categories: ['shopping'] });
  eq('shopping count', shop.length, 3); // b,g,x

  // merchant substring
  const spot = selectTx(TXNS, { merchant: 'spotify' });
  eq('merchant spotify via selectTx', spot.length, 1);
  eq('merchant spotify id', spot[0]?.id, 'g');

  // includeNonSpending keeps transfers
  const all = selectTx(TXNS, { includeNonSpending: true });
  eq('includeNonSpending keeps all', all.length, TXNS.length);

  // range filter (this year via grammar)
  const yr = parseTimeRange('this year', NOW)!;
  const thisYear = selectTx(TXNS, { type: 'expense', range: yr });
  eq('this-year expense count', thisYear.length, 5); // a,b,c,d,g (not h=2025, x=2024)
}

console.log('Sort / take / aggregate');
{
  const sorted = sortByDateDesc(TXNS);
  eq('newest first', sorted[0].id, 'a');
  const top3 = take(sorted, 3);
  eq('take 3 length', top3.length, 3);
  eq('take 3 ids', top3.map((t) => t.id).join(','), 'a,f,b');

  const groups = groupByCategory(selectTx(TXNS, { type: 'expense' }));
  eq('top category is Shopping', groups[0].name, 'Shopping');
  eq('Shopping total', groups[0].amount, 22000); // 5000+8000+9000

  const maxExp = maxBy(selectTx(TXNS, { type: 'expense' }), (t) => t.amount);
  eq('max expense is x (9000)', maxExp?.id, 'x');

  const dow = groupByDayOfWeek(selectTx(TXNS, { type: 'expense' }));
  eq('dow has 7 buckets', dow.length, 7);
  eq('dow Monday label', dow[0].label, 'Mon');

  // A malformed date must be skipped, not crash (NaN day-of-week → no bucket).
  const bad = tx('bad', 999, 'expense', 'Food', 'Mystery', 'not-a-date');
  const dowBad = groupByDayOfWeek([...selectTx(TXNS, { type: 'expense' }), bad]);
  eq('dow tolerates bad date (7 buckets)', dowBad.length, 7);
  eq(
    'dow excludes the bad-date amount',
    dowBad.reduce((s, b) => s + b.amount, 0),
    dow.reduce((s, b) => s + b.amount, 0)
  );

  eq('matchMerchant internet', matchMerchant(TXNS, 'internet')[0]?.id, 'h');
  eq('matchMerchant none', matchMerchant(TXNS, 'netflix').length, 0);

  const yr = parseTimeRange('this year', NOW)!;
  check('inRange today within this year', inRange('2026-06-15', yr));
  check('inRange 2025 outside this year', !inRange('2025-12-20', yr));
}

// ─── Time grammar ────────────────────────────────────────────────────────────

console.log('Time grammar (V3 additions)');
{
  const t = (s: string) => parseTimeRange(s, NOW);

  eq('this year key', t('summary for this year')?.key, 'thisYear');
  eq('this year start month', t('this year')?.start.getMonth(), 0);
  eq('this year year', t('this year')?.start.getFullYear(), 2026);

  eq('last year key', t('last year')?.key, 'lastYear');
  eq('last year year', t('last year')?.start.getFullYear(), 2025);

  eq('q1 key', t('summarize q1')?.key, 'quarter');
  eq('q1 label', t('q1')?.label, 'Q1');
  eq('first quarter label', t('first quarter')?.label, 'Q1');
  eq('q1 end month', t('q1')?.end.getMonth(), 2);
  eq('q4 label', t('q4 spending')?.label, 'Q4');

  eq('march key', t('spending in march')?.key, 'namedMonth');
  eq('march label', t('march')?.label, 'March');
  eq('march this year', t('march')?.start.getFullYear(), 2026); // Mar <= Jun
  eq('december last year', t('december')?.start.getFullYear(), 2025); // Dec > Jun
  eq('december label', t('december')?.label, 'December');

  eq('weekend key', t('my weekend spending')?.key, 'weekend');
  eq('last 30 days key', t('last 30 days')?.key, 'last30Days');

  eq('weekday key', t('the charge on tuesday')?.key, 'weekday');
  eq('tuesday label', t('on tuesday')?.label, 'Tuesday');
  eq('tuesday is a tuesday', t('on tuesday')?.start.getDay(), 2);

  // "may" guarded against the modal verb.
  check('may modal not a month', t('how may i save more') === null);
  eq('may month still parses', t('my may spending')?.label, 'May');

  // Regression: original keys unchanged.
  eq('today still works', t('today')?.key, 'today');
  eq('last month still works', t('last month')?.key, 'lastMonth');
  eq('this week still works', t('this week')?.key, 'thisWeek');
}

// ─── Time grammar: explicit calendar dates + N-weeks/months ago ───────────────

console.log('Time grammar (calendar dates + relative ago)');
{
  const t = (s: string) => parseTimeRange(s, NOW);

  // Month + day, both orders → a single calendar day.
  eq('june 3 key', t('what did i spend on june 3')?.key, 'calendarDate');
  eq('june 3 label', t('june 3')?.label, 'Jun 3');
  eq('june 3 day', t('june 3')?.start.getDate(), 3);
  eq('june 3 month', t('june 3')?.start.getMonth(), 5);
  eq('june 3 year (this year)', t('june 3')?.start.getFullYear(), 2026);
  eq('3 june (day-first) label', t('3 june')?.label, 'Jun 3');
  eq('jun 3rd (abbrev+ordinal) label', t('jun 3rd')?.label, 'Jun 3');
  eq('15 march label', t('15 march')?.label, 'Mar 15');

  // A future-in-this-year date rolls back to last year's occurrence.
  eq('june 20 rolls to last year', t('june 20')?.start.getFullYear(), 2025);
  eq('june 20 label', t('june 20')?.label, 'Jun 20');
  // A month already past this year stays this year; a later month is last year.
  eq('march 15 this year', t('march 15')?.start.getFullYear(), 2026);
  eq('december 25 last year', t('december 25')?.start.getFullYear(), 2025);

  // Out-of-range day → falls through to the bare month, never a bogus range.
  eq('june 45 falls through to month', t('june 45')?.key, 'namedMonth');
  eq('june 45 → June', t('june 45')?.label, 'June');

  // Bare day-of-month ("the 15th") → most recent occurrence on/before today.
  eq('the 15th key', t('the 15th')?.key, 'calendarDate');
  eq('the 15th is today', t('the 15th')?.label, 'Jun 15');
  eq('the 20th rolls to last month', t('the 20th')?.label, 'May 20');
  eq('on the 1st label', t('on the 1st')?.label, 'Jun 1');

  // "N weeks ago" → the Mon–Sun week N weeks back.
  eq('2 weeks ago key', t('2 weeks ago')?.key, 'weeksAgo');
  eq('2 weeks ago label', t('2 weeks ago')?.label, 'the week of Jun 1');
  eq('2 weeks ago starts Monday', t('2 weeks ago')?.start.getDay(), 1);
  eq('3 weeks ago label', t('3 weeks ago')?.label, 'the week of May 25');

  // "N months ago" → that calendar month (reuses namedMonth).
  eq('2 months ago key', t('2 months ago')?.key, 'namedMonth');
  eq('2 months ago label', t('2 months ago')?.label, 'April');
  eq('2 months ago year', t('2 months ago')?.start.getFullYear(), 2026);
  eq('13 months ago crosses year', t('13 months ago')?.start.getFullYear(), 2025);
  eq('13 months ago label', t('13 months ago')?.label, 'May');

  // Regression: bare month / N-days-ago grammar unchanged by the new rules.
  eq('bare june still namedMonth', t('june')?.key, 'namedMonth');
  eq('3 days ago still daysAgo', t('3 days ago')?.key, 'daysAgo');
  eq('last 2 weeks still rolling window', t('last 2 weeks')?.key, 'lastNDays');

  // A calendar date resolves as a slot (not flagged unresolved).
  const sd = extractSlots(normalize('what did i spend on june 3'), { now: NOW });
  eq('calendar date populates slot', sd.timeRange?.key, 'calendarDate');
  check('calendar date is not unresolved', !sd.timeRangeUnresolved);
}

// ─── Slots (amount / limit / merchant) ───────────────────────────────────────

console.log('Slots (V3 additions)');
{
  const s = (raw: string) => extractSlots(normalize(raw), { now: NOW });

  eq('over 5000 → amountMin', s('transactions over 5000').amountMin, 5000);
  eq('more than 1,000 → amountMin', s('more than 1,000 pesos').amountMin, 1000);
  eq('over 5k → amountMin', s('over 5k this year').amountMin, 5000);
  eq('over 5k → thisYear', s('over 5k this year').timeRange?.key, 'thisYear');
  eq('under 500 → amountMax', s('under 500').amountMax, 500);
  eq('between → min', s('between 100 and 500').amountMin, 100);
  eq('between → max', s('between 100 and 500').amountMax, 500);

  eq('last five → limit 5', s('show me my last five transactions').limit, 5);
  eq('top 3 → limit 3', s('top 3 expenses').limit, 3);
  eq('last 10 → limit 10', s('last 10 transactions').limit, 10);

  eq(
    'spotify merchant',
    s('which category did my spotify payment fall under').merchant,
    'spotify'
  );
  eq('internet merchant', s('did i pay my internet bill').merchant, 'internet');
  check(
    'no merchant when none',
    s('how much did i spend').merchant === undefined
  );
}

// ─── Needs vs wants heuristic (V3, Category 2) ───────────────────────────────

console.log('Needs vs wants (V3 additions)');
{
  eq('Bills → need', classifyNeedWant('Bills'), 'need');
  eq('Rent → need', classifyNeedWant('Rent'), 'need');
  eq('Groceries → need', classifyNeedWant('Groceries'), 'need');
  eq('Transport → need', classifyNeedWant('Transport'), 'need');
  eq('Shopping → want', classifyNeedWant('Shopping'), 'want');
  eq('Entertainment → want', classifyNeedWant('Entertainment'), 'want');
  eq(
    'Coffee → want (overrides food master)',
    classifyNeedWant('Coffee'),
    'want'
  );
  eq('empty → unknown', classifyNeedWant(''), 'unknown');

  const split = summarizeNeedsWants([
    { name: 'Bills', amount: 3000 },
    { name: 'Transport', amount: 1000 },
    { name: 'Shopping', amount: 5000 },
    { name: 'Coffee', amount: 800 },
  ]);
  eq('need total', split.need, 4000); // Bills + Transport
  eq('want total', split.want, 5800); // Shopping + Coffee
  eq('classified total', split.classified, 9800);
  check('needCats sorted desc', split.needCats[0].name === 'Bills');
}

// ─── Relative windows + vague time (Phase 0) ─────────────────────────────────
// NOW = Mon 15 Jun 2026, so a rolling N-day window ends on the 15th.

console.log('Relative windows + vague time (Phase 0)');
{
  const t = (s: string) => parseTimeRange(s, NOW);

  // last/past N days → rolling window ending today.
  eq('last 7 days key', t('last 7 days')?.key, 'lastNDays');
  eq(
    'last 7 days start day',
    t('spending in the last 7 days')?.start.getDate(),
    9
  );
  eq('last 7 days end day', t('last 7 days')?.end.getDate(), 15);
  eq('past 3 days start day', t('past 3 days')?.start.getDate(), 13);

  // last/past N weeks → rolling N×7-day window.
  eq('last 2 weeks key', t('last 2 weeks')?.key, 'lastNDays');
  eq('last 2 weeks start day', t('last 2 weeks')?.start.getDate(), 2);
  eq('last 2 weeks label', t('last 2 weeks')?.label, 'the last 2 weeks');

  // "N days ago" → that single calendar day.
  eq('3 days ago key', t('3 days ago')?.key, 'daysAgo');
  eq(
    '3 days ago start day',
    t('what did i spend 3 days ago')?.start.getDate(),
    12
  );
  eq('3 days ago end same day', t('3 days ago')?.end.getDate(), 12);

  // Back-compat: the fixed "last 30 days" rule keeps its dedicated key.
  eq('last 30 days still last30Days', t('last 30 days')?.key, 'last30Days');

  // Vague temporal → unresolved flag (clarify), never a silent range.
  const s = (raw: string) => extractSlots(normalize(raw), { now: NOW });
  check(
    'lately → no range',
    s('how much did i spend lately').timeRange === undefined
  );
  check(
    'lately → unresolved',
    s('how much did i spend lately').timeRangeUnresolved === true
  );
  check(
    'past few days → unresolved',
    s('what did i spend in the past few days').timeRangeUnresolved === true
  );
  check(
    'plain spend → not flagged',
    s('how much did i spend').timeRangeUnresolved === undefined
  );
  check(
    'recent transactions → not vague',
    s('show me my recent transactions').timeRangeUnresolved === undefined
  );
}

// ─── groupByMonth + quarter fix + category pair (meerkat plan) ───────────────

console.log('groupByMonth (monthPattern capability)');
{
  const buckets = groupByMonth(selectTx(TXNS, { type: 'expense' }));
  // Expenses span Nov 2024 (x), Dec 2025 (h), Mar 2026 (g), May 2026 (d), Jun 2026 (a,b,c).
  eq('bucket count', buckets.length, 5);
  eq('chronological first', buckets[0].label, "Nov '24");
  eq('chronological last', buckets[4].label, "Jun '26");
  eq('cross-year labels carry the year', buckets[1].label, "Dec '25");
  eq('June total', buckets[4].amount, 6600); // 100 + 5000 + 1500
  eq('June count', buckets[4].count, 3);
  eq('March total', buckets[2].amount, 8000);

  // Single-year input keeps the short label.
  const oneYear = groupByMonth(
    selectTx(TXNS, { type: 'expense', range: parseTimeRange('this year', NOW)! })
  );
  eq('single-year label is short', oneYear[0].label, 'Mar');

  // A malformed date is skipped, never a NaN bucket.
  const bad = { ...TXNS[0], id: 'bad', date: 'not-a-date' };
  eq(
    'bad date skipped',
    groupByMonth([...selectTx(TXNS, { type: 'expense' }), bad]).length,
    5
  );
}

console.log('Quarter resolves to most recent occurrence (B3)');
{
  const t = (s: string) => parseTimeRange(s, NOW); // NOW = 15 Jun 2026
  eq('q1 (already begun) → this year', t('q1')?.start.getFullYear(), 2026);
  eq('q2 (already begun) → this year', t('q2')?.start.getFullYear(), 2026);
  eq('q3 (future) → last year', t('q3')?.start.getFullYear(), 2025);
  eq('q4 (future) → last year', t('q4')?.start.getFullYear(), 2025);
  eq('q4 still Oct–Dec', t('q4')?.start.getMonth(), 9);
  eq('q4 end month', t('q4')?.end.getMonth(), 11);
}

console.log('Category pair slot (A vs B compare)');
{
  const s = (raw: string) => extractSlots(normalize(raw), { now: NOW });

  const vs = s('food vs transport');
  eq('vs → left master', vs.category?.master, 'food');
  eq('vs → right master', vs.categoryB?.master, 'transport');

  const cmp = s('compare my food spending to my transport spending');
  eq('compare…to → left', cmp.category?.master, 'food');
  eq('compare…to → right', cmp.categoryB?.master, 'transport');

  const or = s('did i spend more on food or transport');
  eq('more…or → left', or.category?.master, 'food');
  eq('more…or → right', or.categoryB?.master, 'transport');

  // Both sides one bucket → no pair (it's a single-category question).
  check(
    'same-bucket pair rejected',
    s('groceries vs food').categoryB === undefined
  );
  // No comparison framing → soft connectives are not split on.
  check(
    'plain compare keeps no pair',
    s('compare to last month').categoryB === undefined
  );
  check(
    'plain spend keeps no pair',
    s('how much did i spend on food').categoryB === undefined
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}\nFailed: ${failed}`);
if (failed > 0) {
  console.error('\nSome query tests failed.');
  process.exit(1);
}
console.log('\nAll query tests passed.');
