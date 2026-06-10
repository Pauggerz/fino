/**
 * Standalone terminal test for the short-term conversational memory
 * (`convo/memory.ts` + the `routeMessage` wiring in `convo/brain.ts`). Mirrors
 * the other `scripts/test-*.ts` harnesses.
 *
 * Run from the repo root:
 *   npx tsx scripts/test-memory.ts        (or: npm run test:memory)
 *
 * Two layers are exercised:
 *   1. The pure merge (`mergeWithMemory` / `rememberTurn`) in isolation — does a
 *      follow-up inherit the right intent/category/time window, and only when it
 *      reads as a continuation?
 *   2. The real multi-turn loop through `routeMessage`, threading `reply.memory`
 *      back in exactly as ChatScreen does, asserting the narrated answer reflects
 *      the inherited scope.
 *
 * No Jest, no Expo runtime — imports pure sub-modules directly (never the
 * `@/intelligence` barrel). Exit code 1 on any failure.
 */

import { routeMessage } from '../src/intelligence/convo/brain';
import {
  mergeWithMemory,
  rememberTurn,
  turnFromResolved,
  isContinuation,
  CONVERSATION_MEMORY_MAX,
} from '../src/intelligence/convo/memory';
import { classifyMessage } from '../src/intelligence/convo/brain';
import { normalize } from '../src/intelligence/core/normalize';
import type {
  BrainContext,
  ConversationMemory,
  TxLite,
} from '../src/intelligence/convo/types';

// Fixed clock: Mon 15 Jun 2026, midday. Deterministic for every range test.
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const NOW_ISO = NOW.toISOString();
const NOW_MS = NOW.getTime();

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const tx = (
  id: string,
  amount: number,
  type: TxLite['type'],
  category: string | null,
  date: string
): TxLite => ({
  id,
  amount,
  type,
  category,
  merchant: category,
  name: category,
  date,
  accountId: 'a1',
  accountName: 'Wallet',
});

// A spread of food + transport across this month (Jun) and last month (May).
// NOW is Mon 15 Jun 2026, so "this week" (Mon-start) is Jun 15 onward — tx 7/8
// fall in it; the earlier June rows are this-month-but-earlier-week.
const TRANSACTIONS: TxLite[] = [
  tx('1', 500, 'expense', 'Food', '2026-06-03'),
  tx('2', 300, 'expense', 'Food', '2026-06-10'),
  tx('3', 200, 'expense', 'Transport', '2026-06-05'),
  tx('4', 150, 'expense', 'Transport', '2026-06-12'),
  tx('5', 900, 'expense', 'Food', '2026-05-08'),
  tx('6', 400, 'expense', 'Transport', '2026-05-20'),
  tx('7', 180, 'expense', 'Food', '2026-06-15'),
  tx('8', 120, 'expense', 'Transport', '2026-06-15'),
];

function makeCtx(memory?: ConversationMemory): BrainContext {
  return {
    balance: 10000,
    income: 30000,
    spent: 1150,
    lastMonthSpent: 1300,
    topCategories: [
      { name: 'Food', amount: 800 },
      { name: 'Transport', amount: 350 },
    ],
    dayOfMonth: 15,
    daysInMonth: 30,
    now: NOW_ISO,
    transactions: TRANSACTIONS,
    memory,
  };
}

/** One step of the ChatScreen loop: route, then carry reply.memory forward. */
function turn(
  text: string,
  memory: ConversationMemory | undefined
): { text: string; memory: ConversationMemory | undefined } {
  const reply = routeMessage(text, makeCtx(memory));
  return { text: reply.text, memory: reply.memory };
}

// ─── 1. isContinuation precision ─────────────────────────────────────────────

console.log('Continuation detection\n');
check(
  '"what about last month?" is continuation',
  isContinuation('what about last month')
);
check('"and transport?" is continuation', isContinuation('and transport'));
check(
  '"last month?" (bare fragment) is continuation',
  isContinuation('last month')
);
check(
  '"transport" (bare fragment) is continuation',
  isContinuation('transport')
);
check('"how about food" is continuation', isContinuation('how about food'));
// Self-contained questions must NOT read as continuations.
check(
  '"how much did i spend on food" is NOT continuation',
  !isContinuation('how much did i spend on food')
);
check(
  '"what is my balance" is NOT continuation',
  !isContinuation('what is my balance')
);
check(
  '"show me my transactions" is NOT continuation',
  !isContinuation('show me my transactions')
);

// ─── 2. mergeWithMemory unit behavior ────────────────────────────────────────

console.log('\nSlot/intent inheritance\n');

// Prior turn: spend on food, this month.
const priorSlots = classifyMessage('how much did i spend on food this month', {
  now: NOW,
  categoryNames: ['Food', 'Transport'],
}).slots;
const priorIntent = classifyMessage('how much did i spend on food this month', {
  now: NOW,
}).intent;
const mem0 = rememberTurn(
  undefined,
  turnFromResolved(priorIntent, priorSlots, NOW_ISO)
);

check('prior turn captured a category', priorSlots.category?.label === 'Food');
check(
  'prior turn captured a time range',
  priorSlots.timeRange?.key === 'thisMonth'
);

const confident = (c: ReturnType<typeof classifyMessage>) =>
  c.source === 'rules' && c.ruleMargin >= 1;

// Follow-up A: "what about last month?" — keep food + spend, swap window. Its
// own weak `compare` guess must defer to the prior `spend` question.
{
  const norm = normalize('what about last month');
  const c = classifyMessage('what about last month', { now: NOW });
  const m = mergeWithMemory(
    norm,
    { intent: c.intent, slots: c.slots, selfIntentConfident: confident(c), intentIsTimeScoped: false },
    mem0,
    NOW_MS
  );
  check('A: inherited', m.inherited);
  check('A: kept food category', m.slots.category?.label === 'Food');
  check('A: swapped to last month', m.slots.timeRange?.key === 'lastMonth');
  check(
    'A: carried spend intent (not compare)',
    m.intent === priorIntent,
    `got ${m.intent}`
  );
}

// Follow-up B: "and transport?" — keep this-month window, swap category.
{
  const norm = normalize('and transport');
  const c = classifyMessage('and transport', {
    now: NOW,
    categoryNames: ['Food', 'Transport'],
  });
  const m = mergeWithMemory(
    norm,
    { intent: c.intent, slots: c.slots, selfIntentConfident: confident(c), intentIsTimeScoped: false },
    mem0,
    NOW_MS
  );
  check('B: inherited', m.inherited);
  check('B: swapped to transport', m.slots.category?.label === 'Transport');
  check('B: kept this-month window', m.slots.timeRange?.key === 'thisMonth');
}

// Self-contained question must NOT inherit a stale category.
{
  const norm = normalize('what is my balance');
  const c = classifyMessage('what is my balance', { now: NOW });
  const m = mergeWithMemory(
    norm,
    { intent: c.intent, slots: c.slots, selfIntentConfident: confident(c), intentIsTimeScoped: false },
    mem0,
    NOW_MS
  );
  check('C: self-contained did not inherit', !m.inherited);
  check('C: no stale category leaked', m.slots.category === undefined);
}

// Stale prior turn (older than the continuation TTL) must NOT be inherited.
{
  const staleMem = rememberTurn(
    undefined,
    turnFromResolved(
      priorIntent,
      priorSlots,
      new Date(NOW_MS - 10 * 60 * 1000).toISOString()
    )
  );
  const norm = normalize('what about last month');
  const c = classifyMessage('what about last month', { now: NOW });
  const m = mergeWithMemory(
    norm,
    { intent: c.intent, slots: c.slots, selfIntentConfident: confident(c), intentIsTimeScoped: false },
    staleMem,
    NOW_MS
  );
  check('D: stale memory not inherited', !m.inherited);
}

// ─── 3. rememberTurn window bound ────────────────────────────────────────────

console.log('\nWindow bound\n');
{
  let m: ConversationMemory | undefined;
  for (let i = 0; i < CONVERSATION_MEMORY_MAX + 4; i += 1) {
    m = rememberTurn(m, turnFromResolved('spend', priorSlots, NOW_ISO));
  }
  check(
    `window capped at ${CONVERSATION_MEMORY_MAX}`,
    (m?.turns.length ?? 0) === CONVERSATION_MEMORY_MAX
  );
}
{
  // A no-signal turn passes the window through unchanged.
  const before = rememberTurn(
    undefined,
    turnFromResolved('spend', priorSlots, NOW_ISO)
  );
  const after = rememberTurn(
    before,
    turnFromResolved(null, { amounts: [] } as never, NOW_ISO)
  );
  check(
    'no-signal turn does not grow the window',
    after.turns.length === before.turns.length
  );
}

// ─── 4. End-to-end through routeMessage (the real ChatScreen loop) ───────────

console.log('\nEnd-to-end multi-turn\n');

// food this month → last month → and transport
{
  const t1 = turn('how much did i spend on food this month', undefined);
  check(
    'E1: food this month answered',
    /food/i.test(t1.text) && t1.memory !== undefined
  );

  const t2 = turn('what about last month', t1.memory);
  check(
    'E2: follow-up references last month',
    /last month/i.test(t2.text),
    `got: ${t2.text}`
  );
  check('E2: still about food', /food/i.test(t2.text), `got: ${t2.text}`);

  const t3 = turn('and transport', t2.memory);
  check(
    'E3: follow-up swaps to transport',
    /transport/i.test(t3.text),
    `got: ${t3.text}`
  );
}

// A fresh, self-contained question after a scoped turn is not polluted.
{
  const t1 = turn('how much did i spend on food this month', undefined);
  const t2 = turn('what is my balance', t1.memory);
  check(
    'F: balance answer not scoped to food',
    /balance|₱|account/i.test(t2.text) && !/on food/i.test(t2.text),
    `got: ${t2.text}`
  );
}

// The screenshot scenario: "this week" → "give me a spending breakdown" must
// break down THIS WEEK, not silently jump back to the month total.
{
  const t1 = turn('how much did i spend this week', undefined);
  check('G1: this-week total answered', /this week/i.test(t1.text), `got: ${t1.text}`);

  const t2 = turn('give me a spending breakdown', t1.memory);
  check('G2: breakdown stays on this week', /this week/i.test(t2.text), `got: ${t2.text}`);
  // This week is Jun 15: Food 180 + Transport 120 = 300, NOT the month total.
  check('G2: breakdown total is the week (300), not the month', /300/.test(t2.text) && !/4,?397/.test(t2.text), `got: ${t2.text}`);
}

// "biggest expense this year" → snapshot-aggregated, not the month aggregate.
{
  const t1 = turn("what's my biggest expense this year", undefined);
  check('H: top category honors this-year window', /this year/i.test(t1.text), `got: ${t1.text}`);
}

// ─── Tally ───────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.error('\nSome memory tests failed.');
  process.exit(1);
}
console.log('\nAll memory tests passed.');
