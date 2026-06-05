/**
 * Standalone terminal test runner for the offline Convo brain
 * (`src/intelligence/convo/`). Mirrors `scripts/test-taxonomy.ts`.
 *
 * Run from the repo root:
 *   npx tsx scripts/test-brain.ts        (or: npm run test:brain)
 *
 * No Jest, no Expo runtime. Imports the classifier + router directly. Exit code
 * is 0 on all-pass, 1 on any failure — safe for CI. The same labelled fixtures
 * double as the seed corpus for the P3 Naive-Bayes trainer.
 *
 * Each case gives an utterance (EN / Tagalog / Bisaya) and the intent it should
 * resolve to; some also assert an extracted time-range or category slot. Add
 * new cases at the bottom of `cases`.
 */

// Import from the convo/core/taxonomy sub-paths rather than the `@/intelligence`
// barrel: the barrel now also re-exports the OCR clients, which pull in
// `expo-file-system` + the RN supabase client and can't be transformed by tsx
// under Node. The app still imports everything through the barrel.
import {
  classifyMessage,
  routeMessage,
  selectProactiveCoach,
  type BrainContext,
  type IntentId,
  type ChatCard,
} from '../src/intelligence/convo/brain';
import type { TimeRangeKey } from '../src/intelligence/core/time';
import type { MasterCategory } from '../src/intelligence/taxonomy/taxonomy';
// Type-only — erased by tsx, never eval-loads IntelligenceEngine (RN-coupled).
import type { Insights, Sentiment } from '../src/services/IntelligenceEngine';

// ─── Fixtures ────────────────────────────────────────────────────────────────

type Case = {
  desc: string;
  text: string;
  intent: IntentId;
  time?: TimeRangeKey;
  category?: MasterCategory;
  /** Assert which layer decided — used to prove the classifier fallback fires
   *  on rule-silent paraphrases. */
  source?: 'rules' | 'classifier';
};

// Fixed clock so time-range slots are deterministic (mid-month, mid-week).
const NOW = new Date(2026, 5, 15, 12, 0, 0);

const CATEGORY_NAMES = ['Food', 'Coffee', 'Transport', 'Bills', 'Shopping'];

const cases: Case[] = [
  // greeting
  { desc: 'EN hi', text: 'hi', intent: 'greeting' },
  { desc: 'EN hello there', text: 'hello there', intent: 'greeting' },
  { desc: 'TL kumusta', text: 'kumusta', intent: 'greeting' },
  { desc: 'BIS maayong buntag', text: 'maayong buntag', intent: 'greeting' },

  // thanks
  { desc: 'EN thanks', text: 'thanks!', intent: 'thanks' },
  { desc: 'EN thank you so much', text: 'thank you so much', intent: 'thanks' },
  { desc: 'TL salamat', text: 'salamat po', intent: 'thanks' },

  // help
  { desc: 'EN what can you do', text: 'what can you do?', intent: 'help' },
  { desc: 'EN help', text: 'help', intent: 'help' },
  { desc: 'TL ano kaya mo', text: 'ano ang kaya mo', intent: 'help' },
  { desc: 'EN features', text: 'what are your features', intent: 'help' },

  // balance
  { desc: 'EN balance', text: "what's my balance", intent: 'balance' },
  {
    desc: 'EN how much do i have',
    text: 'how much money do i have',
    intent: 'balance',
  },
  { desc: 'TL magkano pera', text: 'magkano ang pera ko', intent: 'balance' },
  { desc: 'TL natitira', text: 'magkano natitira sakin', intent: 'balance' },

  // income
  { desc: 'EN earn', text: 'how much did i earn', intent: 'income' },
  { desc: 'EN income this month', text: 'income this month', intent: 'income' },
  { desc: 'TL kita', text: 'magkano kita ko', intent: 'income' },
  { desc: 'TL sweldo', text: 'magkano sweldo ko', intent: 'income' },

  // spend
  {
    desc: 'EN how much did i spend',
    text: 'how much did i spend',
    intent: 'spend',
  },
  {
    desc: 'EN spent this month',
    text: 'how much have i spent this month',
    intent: 'spend',
    time: 'thisMonth',
  },
  { desc: 'TL gastos', text: 'magkano nagastos ko', intent: 'spend' },
  {
    desc: 'EN spend last month',
    text: 'how much did i spend last month',
    intent: 'spend',
    time: 'lastMonth',
  },
  {
    desc: 'EN how much on food',
    text: 'how much on food',
    intent: 'spend',
    category: 'food',
  },
  {
    desc: 'EN spent on coffee',
    text: 'how much did i spend on coffee this month',
    intent: 'spend',
    category: 'food',
    time: 'thisMonth',
  },
  {
    desc: 'TL magkano sa pagkain',
    text: 'magkano sa pagkain',
    intent: 'spend',
    category: 'food',
  },

  // breakdown
  {
    desc: 'EN breakdown',
    text: 'give me a spending breakdown',
    intent: 'breakdown',
  },
  {
    desc: 'EN where did my money go',
    text: 'where did my money go',
    intent: 'breakdown',
  },
  { desc: 'TL san napunta', text: 'san napunta pera ko', intent: 'breakdown' },
  {
    desc: 'EN by category',
    text: 'show my spending by category',
    intent: 'breakdown',
  },

  // topCategory
  {
    desc: 'EN biggest expense',
    text: "what's my biggest expense",
    intent: 'topCategory',
  },
  {
    desc: 'EN spend the most',
    text: 'where do i spend the most',
    intent: 'topCategory',
  },
  {
    desc: 'TL pinakamalaki',
    text: 'saan ako pinakamalaki gumastos',
    intent: 'topCategory',
  },

  // compare
  { desc: 'EN compare', text: 'compare to last month', intent: 'compare' },
  {
    desc: 'EN vs last month',
    text: 'this month versus last month',
    intent: 'compare',
  },
  { desc: 'TL kumpara', text: 'kumpara sa nakaraang buwan', intent: 'compare' },

  // cut
  { desc: 'EN cut back', text: 'where can i cut back', intent: 'cut' },
  { desc: 'EN save money', text: 'how can i save money', intent: 'cut' },
  { desc: 'TL makatipid', text: 'paano ako makakatipid', intent: 'cut' },

  // savings
  { desc: 'EN on track', text: 'am i on track to save', intent: 'savings' },
  {
    desc: 'EN savings forecast',
    text: 'show my savings forecast',
    intent: 'savings',
  },
  {
    desc: 'EN how much saving',
    text: 'how much am i saving',
    intent: 'savings',
  },
  { desc: 'TL naiipon', text: 'magkano naiipon ko', intent: 'savings' },

  // count (recognized → graceful deferral)
  {
    desc: 'EN how many times',
    text: 'how many times did i buy coffee',
    intent: 'count',
    category: 'food',
  },
  { desc: 'EN how often', text: 'how often do i eat out', intent: 'count' },
  {
    desc: 'TL ilang beses',
    text: 'ilang beses ako kumain sa labas',
    intent: 'count',
  },

  // coach (money-coach tip)
  {
    desc: 'EN how am i doing',
    text: 'how am i doing this month',
    intent: 'coach',
  },
  { desc: 'EN any advice', text: 'any advice for me', intent: 'coach' },
  { desc: 'EN what should i do', text: 'what should i do', intent: 'coach' },
  { desc: 'TL payo', text: 'may payo ka ba', intent: 'coach' },

  // overspend (anomaly)
  { desc: 'EN overspending', text: 'am i overspending', intent: 'overspend' },
  {
    desc: 'EN spending too much',
    text: 'am i spending too much',
    intent: 'overspend',
  },
  {
    desc: 'EN overspend on food',
    text: 'am i overspending on food',
    intent: 'overspend',
    category: 'food',
  },
  { desc: 'TL lampas', text: 'lampas na ba ako', intent: 'overspend' },

  // ── Classifier fallback (rule-silent paraphrases) ──────────────────────────
  // These deliberately miss every weighted trigger / canonical reduction, so a
  // pass proves the Naive-Bayes layer resolved them. Kept OUT of the training
  // corpus (scripts/brain-corpus.ts) so there's no train/test leakage.
  {
    desc: 'ML balance paraphrase',
    text: 'do i still have money',
    intent: 'balance',
    source: 'classifier',
  },
  {
    desc: 'ML breakdown paraphrase',
    text: 'where has my cash been going',
    intent: 'breakdown',
    source: 'classifier',
  },
  {
    desc: 'ML topCategory paraphrase',
    text: 'which category drains my wallet the most',
    intent: 'topCategory',
    source: 'classifier',
  },
  {
    desc: 'ML income paraphrase',
    text: 'did i receive my pay',
    intent: 'income',
    source: 'classifier',
  },
  {
    desc: 'ML savings paraphrase',
    text: 'by month end will i have saved anything',
    intent: 'savings',
    source: 'classifier',
  },
  {
    desc: 'ML count paraphrase',
    text: 'how regularly am i buying coffee',
    intent: 'count',
    source: 'classifier',
  },
];

// Out-of-scope utterances: the classifier's `unknown` class must reject them
// (intent resolves to null) and routeMessage must return the gentle fallback
// rather than guess. These are NOT in the training corpus verbatim.
const FALLBACK_CASES: { desc: string; text: string }[] = [
  { desc: 'OOS weather', text: 'is it going to be sunny later' },
  { desc: 'OOS joke', text: 'tell me something funny' },
  { desc: 'OOS random', text: 'qwerty zxcvb asdf' },
  { desc: 'OOS sports', text: 'what was the score of the game' },
];

// ─── Sample context for routeMessage smoke test ──────────────────────────────

const CTX: BrainContext = {
  balance: 12000,
  income: 30000,
  spent: 18000,
  lastMonthSpent: 20000,
  topCategories: [
    { name: 'Food', amount: 8000 },
    { name: 'Transport', amount: 4000 },
    { name: 'Bills', amount: 3000 },
    { name: 'Shopping', amount: 3000 },
  ],
  dayOfMonth: 15,
  daysInMonth: 30,
};

// Minimal-but-valid Insights fixture so the forecast / coach card builders and
// the proactive selector can be exercised offline (FINO_CHATBOT_CARDS.md §2).
const okGate = { ok: true, current: 30, needed: 1, reason: '' };
function buildInsights(overrides: Partial<Insights> = {}): Insights {
  return {
    headline: 'Pacing a touch hot',
    whereChip: 'Food',
    whenChip: 'this month',
    anomalies: [
      { category: 'Food', current: 8000, baseline: 5000, pctOver: 0.6 },
    ],
    trajectory: {
      projected: 26000,
      spent: 18000,
      dailyAvg: 1200,
      daysElapsed: 15,
      daysRemaining: 15,
      rolling3MoAvg: 22000,
      pacingOver: true,
      usedDowWeighting: false,
      ciLow: 24000,
      ciHigh: 28000,
      ciUsedT: true,
    },
    habits: [],
    weekDeltas: [],
    recurring: [],
    coach: {
      sentiment: 'cautious',
      message: "You're pacing a bit hot — easing off Food would help.",
    },
    trendSlope: null,
    sufficiency: {
      sankey: okGate,
      trajectory: okGate,
      composition: okGate,
      dowPattern: okGate,
      todPattern: okGate,
      trendSlope: okGate,
    },
    ...overrides,
  };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('Running brain tests...\n');

for (const c of cases) {
  const cls = classifyMessage(c.text, {
    now: NOW,
    categoryNames: CATEGORY_NAMES,
  });
  check(
    cls.intent === c.intent,
    `[intent] ${c.desc}`,
    `"${c.text}" → got ${cls.intent} (rule ${cls.ruleScore}, ${cls.source}), expected ${c.intent}`
  );
  if (c.source) {
    check(
      cls.source === c.source,
      `[source] ${c.desc}`,
      `"${c.text}" → decided by ${cls.source}, expected ${c.source}`
    );
  }
  if (c.time) {
    check(
      cls.slots.timeRange?.key === c.time,
      `[time]   ${c.desc}`,
      `"${c.text}" → got ${cls.slots.timeRange?.key ?? 'none'}, expected ${c.time}`
    );
  }
  if (c.category) {
    check(
      cls.slots.category?.master === c.category,
      `[cat]    ${c.desc}`,
      `"${c.text}" → got ${cls.slots.category?.master ?? 'none'}, expected ${c.category}`
    );
  }
  // Smoke: every fixture must produce a non-empty reply without throwing.
  const reply = routeMessage(c.text, CTX);
  check(
    typeof reply.text === 'string' && reply.text.length > 0,
    `[reply]  ${c.desc}`,
    `"${c.text}" produced an empty reply`
  );
}

for (const c of FALLBACK_CASES) {
  const cls = classifyMessage(c.text, {
    now: NOW,
    categoryNames: CATEGORY_NAMES,
  });
  check(
    cls.intent === null,
    `[oos]    ${c.desc}`,
    `"${c.text}" → unexpectedly matched ${cls.intent} (ml ${cls.ml.label}, rule ${cls.ruleScore})`
  );
  const reply = routeMessage(c.text, CTX);
  check(
    /didn't quite catch/.test(reply.text),
    `[oos-reply] ${c.desc}`,
    `"${c.text}" → did not return the fallback reply`
  );
}

// ─── Card payloads (FINO_CHATBOT_CARDS.md P3) ────────────────────────────────
// Assert the DATA the brain emits (kind + key fields), not pixels (§9).

const INSIGHTS = buildInsights();
const CTX_INS: BrainContext = { ...CTX, insights: INSIGHTS };

type CardCase = {
  desc: string;
  text: string;
  kind: ChatCard['kind'];
  /** Extra field-level assertion on the emitted card. */
  check?: (card: ChatCard) => boolean;
};

const cardCases: CardCase[] = [
  {
    desc: 'breakdown card',
    text: 'give me a spending breakdown',
    kind: 'breakdown',
  },
  { desc: 'compare card', text: 'compare to last month', kind: 'compare' },
  {
    desc: 'forecast card',
    text: 'am i on track to save',
    kind: 'forecast',
    check: (c) =>
      c.kind === 'forecast' &&
      c.data.projected === 26000 &&
      c.data.status === 'watch',
  },
  { desc: 'coach card', text: 'how am i doing this month', kind: 'coach' },
  {
    desc: 'overspend card',
    text: 'am i overspending',
    kind: 'coach',
    check: (c) => c.kind === 'coach' && (c.data.reasons?.length ?? 0) > 0,
  },
];

for (const cc of cardCases) {
  const reply = routeMessage(cc.text, CTX_INS);
  check(
    reply.card?.kind === cc.kind,
    `[card]   ${cc.desc}`,
    `"${cc.text}" → got ${reply.card?.kind ?? 'none'}, expected ${cc.kind}`
  );
  if (cc.check && reply.card) {
    check(
      cc.check(reply.card),
      `[card+]  ${cc.desc}`,
      `"${cc.text}" → field assertion failed`
    );
  }
}

// Breakdown card without last-month data carries no delta chip; with it, does.
{
  const noLast = routeMessage('give me a spending breakdown', {
    ...CTX_INS,
    lastMonthSpent: 0,
  });
  const ok =
    noLast.card?.kind === 'breakdown' && noLast.card.data.delta === undefined;
  check(
    ok,
    '[card+]  breakdown no-delta without last month',
    'expected breakdown card with no delta'
  );
  const withLast = routeMessage('give me a spending breakdown', CTX_INS);
  const ok2 =
    withLast.card?.kind === 'breakdown' &&
    withLast.card.data.delta !== undefined;
  check(
    ok2,
    '[card+]  breakdown has delta with last month',
    'expected breakdown card with a delta'
  );
}

// Cards degrade gracefully to text-only when no insights are present.
{
  const noIns = routeMessage('am i on track to save', CTX);
  check(
    noIns.card === undefined && noIns.text.length > 0,
    '[card+]  forecast degrades without insights',
    'expected text-only reply'
  );
}

// Proactive selector: non-neutral → coach card; neutral → null (no noise).
{
  const pro = selectProactiveCoach(INSIGHTS);
  check(
    pro?.kind === 'coach',
    '[proactive] non-neutral → coach card',
    `got ${pro?.kind ?? 'null'}`
  );
  const neutral = selectProactiveCoach(
    buildInsights({
      anomalies: [],
      coach: { sentiment: 'neutral' as Sentiment, message: 'All steady.' },
    })
  );
  check(
    neutral === null,
    '[proactive] neutral → null',
    `got ${neutral?.kind ?? 'null'}`
  );
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error('\nSome brain tests failed.');
  process.exit(1);
}
console.log('\nAll tests passed.');
