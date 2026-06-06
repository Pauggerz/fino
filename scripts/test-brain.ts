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
  type TxLite,
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
  // V3 intents — rule-silent paraphrases the retrained classifier (P6) catches.
  {
    desc: 'ML transactions paraphrase',
    text: 'walk me through my recent buys',
    intent: 'transactions',
    source: 'classifier',
  },
  {
    desc: 'ML summary paraphrase',
    text: 'give me the rundown of my money this month',
    intent: 'summary',
    source: 'classifier',
  },
  {
    desc: 'ML emergencyFund paraphrase',
    text: 'i want a safety net for emergencies',
    intent: 'emergencyFund',
    source: 'classifier',
  },
  {
    desc: 'ML dowPattern paraphrase',
    text: 'which weekday burns the most cash',
    intent: 'dowPattern',
    source: 'classifier',
  },
  {
    desc: 'ML improveSavings paraphrase',
    text: 'how do i grow my nest egg faster',
    intent: 'improveSavings',
    source: 'classifier',
  },
  {
    desc: 'ML ruleOfThumb paraphrase',
    text: 'whats a sensible way to divvy up my paycheck',
    intent: 'ruleOfThumb',
    source: 'classifier',
  },
  {
    desc: 'ML salaryStatus paraphrase',
    text: 'did my pay land in my account',
    intent: 'salaryStatus',
    source: 'classifier',
  },

  // ── Category 1: transaction info & mapping (V3) ──────────────────────────────
  {
    desc: 'EN last five tx',
    text: 'show me my last five transactions',
    intent: 'transactions',
  },
  {
    desc: 'EN recent tx',
    text: 'show me my recent transactions',
    intent: 'transactions',
  },
  {
    desc: 'EN transaction history',
    text: 'show my transaction history',
    intent: 'transactions',
  },
  {
    desc: 'EN over 5000 this year',
    text: 'list all transactions over 5000 pesos this year',
    intent: 'transactions',
    time: 'thisYear',
  },
  {
    desc: 'EN tagged entertainment',
    text: 'find all transactions tagged entertainment this month',
    intent: 'transactions',
    time: 'thisMonth',
  },
  {
    desc: 'EN highest single expense',
    text: 'show me my highest single expense from yesterday',
    intent: 'transactions',
    time: 'yesterday',
  },
  {
    desc: 'EN 1500 charge tuesday',
    text: 'what was the 1500 charge on tuesday',
    intent: 'transactions',
    time: 'weekday',
  },

  // categoryOf
  {
    desc: 'EN spotify category',
    text: 'which category did my spotify payment fall under',
    intent: 'categoryOf',
  },
  {
    desc: 'EN netflix category',
    text: 'what category was my netflix charge',
    intent: 'categoryOf',
  },

  // salaryStatus
  {
    desc: 'EN salary hit',
    text: 'did my salary hit my account yet',
    intent: 'salaryStatus',
  },
  {
    desc: 'EN did i get paid',
    text: 'did i get paid this month',
    intent: 'salaryStatus',
  },
  { desc: 'TL sweldo na', text: 'sweldo na ba', intent: 'salaryStatus' },

  // billStatus
  {
    desc: 'EN paid internet',
    text: 'did i pay my internet bill yet',
    intent: 'billStatus',
  },
  {
    desc: 'EN subscriptions march',
    text: 'show me all my subscription payments for march',
    intent: 'billStatus',
    time: 'namedMonth',
  },
  {
    desc: 'EN list subs',
    text: 'what subscriptions do i have',
    intent: 'billStatus',
  },

  // ── Category 2: spending pattern analysis (V3) ───────────────────────────────
  {
    desc: 'EN dining vs last month',
    text: 'am i spending more on dining out compared to last month',
    intent: 'compare',
    time: 'lastMonth',
  },
  {
    desc: 'EN day of week',
    text: 'on what day of the week do i usually spend the most',
    intent: 'dowPattern',
  },
  {
    desc: 'EN transport trend',
    text: 'is my transport spending trending up or down',
    intent: 'trend',
    category: 'transport',
  },
  {
    desc: 'EN income share rent',
    text: 'what percentage of my income goes toward rent',
    intent: 'incomeShare',
  },
  {
    desc: 'EN shopping budget',
    text: 'am i on track to stay under my shopping budget',
    intent: 'budgetStatus',
    category: 'shopping',
  },
  {
    desc: 'EN typical coffee',
    text: 'how much do i typically spend on coffee in a month',
    intent: 'typicalSpend',
    category: 'food',
  },
  {
    desc: 'EN needs vs wants',
    text: 'show me a breakdown of my needs versus my wants',
    intent: 'needsVsWants',
  },
  {
    desc: 'EN unusual spikes',
    text: 'identify any unusual spending spikes in the last 30 days',
    intent: 'overspend',
    time: 'last30Days',
  },

  // ── Category 3: summarization (V3) ───────────────────────────────────────────
  {
    desc: 'EN summary q1',
    text: 'give me a quick summary of my spending for q1',
    intent: 'summary',
    time: 'quarter',
  },
  {
    desc: 'EN cash flow week',
    text: 'what does my cash flow look like for this week',
    intent: 'summary',
    time: 'thisWeek',
  },
  {
    desc: 'EN digest today',
    text: 'provide a daily digest of my transactions for today',
    intent: 'summary',
    time: 'today',
  },
  {
    desc: 'EN weekend summary',
    text: 'summarize my weekend spending',
    intent: 'summary',
    time: 'weekend',
  },
  {
    desc: 'EN income vs expense',
    text: 'generate a summary of my total income versus total expenses',
    intent: 'summary',
  },
  {
    desc: 'EN fixed vs variable',
    text: 'break down my fixed vs variable costs for this month',
    intent: 'summary',
    time: 'thisMonth',
  },
  {
    desc: 'EN how did i do',
    text: 'how did i do financially this past month',
    intent: 'summary',
    time: 'lastMonth',
  },

  // ── Category 4: advice & coaching (V3) ───────────────────────────────────────
  {
    desc: 'EN cut subscriptions',
    text: 'how can i cut down on my subscription costs',
    intent: 'subscriptionCut',
  },
  {
    desc: 'EN recurring cancel',
    text: 'are there any recurring expenses i should consider canceling',
    intent: 'subscriptionCut',
  },
  {
    desc: 'EN emergency fund',
    text: 'give me advice on how to build an emergency fund',
    intent: 'emergencyFund',
  },
  {
    desc: 'EN save for laptop',
    text: 'i want to save for a new laptop how should i adjust my spending',
    intent: 'goalPlan',
  },
  {
    desc: 'EN rule of thumb',
    text: 'what is a good rule of thumb for budgeting my salary',
    intent: 'ruleOfThumb',
  },
  {
    desc: 'EN cut 2000',
    text: 'where can i realistically cut 2000 pesos from my budget this month',
    intent: 'cutAmount',
    time: 'thisMonth',
  },
  {
    desc: 'EN year end bonus',
    text: 'what should i do with my year-end bonus',
    intent: 'bonusAdvice',
  },
  {
    desc: 'EN improve savings',
    text: 'how can i improve my savings rate',
    intent: 'improveSavings',
  },
  {
    desc: 'EN impulse tips',
    text: 'provide some tips to avoid impulse buying',
    intent: 'impulseTips',
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

// ─── Category 1: transaction-query cards + status (V3) ───────────────────────
// A tx-bearing context so the record-level answers can be exercised offline.
// June 9 2026 is a Tuesday; "now" is fixed to NOW (Mon 15 Jun 2026).

const TX: TxLite[] = [
  {
    id: 't1',
    amount: 120,
    type: 'expense',
    category: 'Food',
    merchant: 'Jollibee',
    name: 'Jollibee',
    date: '2026-06-15',
    accountId: 'a1',
  },
  {
    id: 't2',
    amount: 5000,
    type: 'expense',
    category: 'Shopping',
    merchant: 'Lazada',
    name: 'Lazada order',
    date: '2026-06-10',
    accountId: 'a1',
  },
  {
    id: 't3',
    amount: 60,
    type: 'expense',
    category: 'Transport',
    merchant: 'Grab',
    name: 'Grab ride',
    date: '2026-06-12',
    accountId: 'a1',
  },
  {
    id: 't4',
    amount: 149,
    type: 'expense',
    category: 'Entertainment',
    merchant: 'Spotify',
    name: 'Spotify Premium',
    date: '2026-06-05',
    accountId: 'a1',
  },
  {
    id: 't5',
    amount: 1500,
    type: 'expense',
    category: 'Bills',
    merchant: 'PLDT Internet',
    name: 'PLDT Internet',
    date: '2026-06-09',
    accountId: 'a1',
  },
  {
    id: 't6',
    amount: 300,
    type: 'expense',
    category: 'Food',
    merchant: 'Starbucks',
    name: 'Starbucks',
    date: '2026-06-02',
    accountId: 'a1',
  },
  {
    id: 't7',
    amount: 12000,
    type: 'expense',
    category: 'Shopping',
    merchant: 'Appliance Store',
    name: 'Fridge',
    date: '2026-02-20',
    accountId: 'a1',
  },
  {
    id: 't8',
    amount: 30000,
    type: 'income',
    category: 'Salary',
    merchant: 'ACME Payroll',
    name: 'Salary',
    date: '2026-06-01',
    accountId: 'a1',
  },
];

const CTX_TX: BrainContext = {
  ...CTX_INS,
  now: NOW.toISOString(),
  transactions: TX,
  accounts: [
    { id: 'a1', name: 'Wallet', balance: 8000 },
    { id: 'a2', name: 'Bank', balance: 4000 },
  ],
  recurringIncome: [{ label: 'Salary', amount: 30000, dayOfMonth: 1 }],
};

{
  // last 5 — no filter, no total, 5 newest rows.
  const r = routeMessage('show me my last five transactions', CTX_TX);
  check(
    r.card?.kind === 'txList' &&
      r.card.data.rows.length === 5 &&
      r.card.data.total === undefined,
    '[card+]  last five → txList of 5, no total',
    `got ${r.card?.kind}, rows ${r.card?.kind === 'txList' ? r.card.data.rows.length : '-'}`
  );

  // over ₱5,000 this year — expense filter with total + match count.
  const over = routeMessage(
    'list all transactions over 5000 pesos this year',
    CTX_TX
  );
  check(
    over.card?.kind === 'txList' &&
      over.card.data.matchCount === 2 &&
      over.card.data.total === 17000,
    '[card+]  over ₱5k this year → 2 matches totaling ₱17,000',
    `got matchCount ${over.card?.kind === 'txList' ? over.card.data.matchCount : '-'}, total ${over.card?.kind === 'txList' ? over.card.data.total : '-'}`
  );

  // specific ₱1,500 charge → finds the PLDT row.
  const charge = routeMessage('what was the 1500 charge', CTX_TX);
  check(
    charge.card?.kind === 'txList' && charge.card.data.rows[0]?.id === 't5',
    '[card+]  ₱1,500 charge → PLDT row',
    `got ${charge.card?.kind === 'txList' ? charge.card.data.rows[0]?.id : '-'}`
  );

  // highest single expense (no time) → the ₱12,000 fridge as a single row.
  const hi = routeMessage('show me my highest single expense', CTX_TX);
  check(
    hi.card?.kind === 'txList' &&
      hi.card.data.rows.length === 1 &&
      hi.card.data.rows[0].id === 't7',
    '[card+]  highest single expense → ₱12,000 fridge',
    `got ${hi.card?.kind === 'txList' ? hi.card.data.rows[0]?.id : '-'}`
  );

  // categoryOf — Spotify → Entertainment.
  const cat = routeMessage(
    'which category did my spotify payment fall under',
    CTX_TX
  );
  check(
    cat.card?.kind === 'txList' &&
      cat.card.data.rows[0]?.category === 'Entertainment' &&
      /entertainment/i.test(cat.text),
    '[card+]  categoryOf spotify → Entertainment',
    `got ${cat.card?.kind === 'txList' ? cat.card.data.rows[0]?.category : '-'}`
  );

  // salaryStatus — income present this month → yes.
  const sal = routeMessage('did my salary hit my account yet', CTX_TX);
  check(
    sal.card?.kind === 'status' && sal.card.data.yes === true,
    '[card+]  salary hit → status yes',
    `got ${sal.card?.kind}, yes ${sal.card?.kind === 'status' ? sal.card.data.yes : '-'}`
  );

  // billStatus — internet paid this month → yes, with the matched tx.
  const bill = routeMessage('did i pay my internet bill yet', CTX_TX);
  check(
    bill.card?.kind === 'status' &&
      bill.card.data.yes === true &&
      bill.card.data.tx?.id === 't5',
    '[card+]  internet bill → status yes (PLDT)',
    `got ${bill.card?.kind}, yes ${bill.card?.kind === 'status' ? bill.card.data.yes : '-'}`
  );

  // per-account balance → text lists accounts + an Open Accounts action.
  const bal = routeMessage("what's my balance", CTX_TX);
  check(
    /accounts/i.test(bal.text) &&
      (bal.actions ?? []).some(
        (a) => a.kind === 'navigate' && a.target === 'accounts'
      ),
    '[card+]  multi-account balance → Open Accounts action',
    `actions ${JSON.stringify(bal.actions)}`
  );

  // salaryStatus negative — no income context → "not yet" with Add income.
  const noSal = routeMessage('did my salary hit yet', {
    ...CTX_TX,
    transactions: [],
  });
  check(
    noSal.card?.kind === 'status' &&
      noSal.card.data.yes === false &&
      (noSal.actions ?? []).some((a) => a.kind === 'navigate'),
    '[card+]  no income → status no + add-income action',
    `got ${noSal.card?.kind}`
  );
}

// ─── Phase 0: temporal spend (snapshot ranges) + time clarify ────────────────
{
  // "this week" → snapshot-sliced spend (only Jollibee ₱120 falls in this week,
  // Mon 15–Sun 21), NOT the Insights punt.
  const wk = routeMessage('how much did i spend this week', CTX_TX);
  check(
    /spent/i.test(wk.text) &&
      /this week/.test(wk.text) &&
      !/Insights/.test(wk.text),
    '[phase0]  spend this week → snapshot total, not Insights punt',
    `text "${wk.text}"`
  );

  // "last 7 days" → rolling window total from the snapshot (Jun 9–15).
  const l7 = routeMessage('how much did i spend in the last 7 days', CTX_TX);
  check(
    /last 7 days/.test(l7.text) && /spent/i.test(l7.text),
    '[phase0]  spend last 7 days → snapshot window total',
    `text "${l7.text}"`
  );

  // Vague temporal ("lately") → a time clarify with chips, not a silent answer.
  const vague = routeMessage('how much did i spend lately', CTX_TX);
  check(
    /time range/i.test(vague.text) && (vague.followUps?.length ?? 0) === 3,
    '[phase0]  vague "lately" → time clarify with chips',
    `text "${vague.text}"`
  );

  // Without a snapshot, a sub-month range degrades honestly (no invented number).
  const noSnap = routeMessage('how much did i spend this week', { ...CTX });
  check(
    /Insights/.test(noSnap.text),
    '[phase0]  spend this week, no snapshot → honest Insights punt',
    `text "${noSnap.text}"`
  );
}

// ─── Categories 2 & 3: pattern / summary / budget / needs-wants cards (V3) ────

const CTX_TX_BUDGET: BrainContext = {
  ...CTX_TX,
  budgets: [
    { category: 'Shopping', limit: 10000 },
    { category: 'Food', limit: 2000 },
  ],
};
const CTX_TREND: BrainContext = {
  ...CTX_TX,
  insights: buildInsights({
    weekDeltas: [
      {
        category: 'Transport',
        currentWeek: 800,
        prevWeek: 500,
        pctChange: 0.6,
      },
    ],
  }),
};

{
  // summary over Q1 → summary card; only the Feb ₱12,000 fridge falls in Q1.
  const q1 = routeMessage(
    'give me a quick summary of my spending for q1',
    CTX_TX
  );
  check(
    q1.card?.kind === 'summary' &&
      q1.card.data.expense === 12000 &&
      q1.card.data.income === 0,
    '[card+]  summary q1 → ₱12,000 out, ₱0 in',
    `got ${q1.card?.kind}, expense ${q1.card?.kind === 'summary' ? q1.card.data.expense : '-'}`
  );

  // day-of-week → pattern card, 7 weekday bars, exactly one highlighted (peak).
  const dow = routeMessage(
    'on what day of the week do i usually spend the most',
    CTX_TX
  );
  check(
    dow.card?.kind === 'pattern' &&
      dow.card.data.bars.length === 7 &&
      dow.card.data.bars.filter((b) => b.highlight).length === 1,
    '[card+]  dow → pattern card, 7 bars, one peak',
    `got ${dow.card?.kind}`
  );

  // needs vs wants → needsWants card; this month wants (Shopping/Entertainment)
  // outweigh needs (Bills/Transport/Food).
  const nw = routeMessage(
    'show me a breakdown of my needs versus my wants',
    CTX_TX
  );
  check(
    nw.card?.kind === 'needsWants' && nw.card.data.want > nw.card.data.need,
    '[card+]  needs vs wants → needsWants card, wants > needs',
    `got ${nw.card?.kind}`
  );

  // budget status (focused) → budget card with the Shopping row, under budget.
  const bud = routeMessage(
    'am i on track to stay under my shopping budget',
    CTX_TX_BUDGET
  );
  check(
    bud.card?.kind === 'budget' &&
      bud.card.data.rows.some(
        (r) => r.label === 'Shopping' && r.status === 'good'
      ),
    '[card+]  shopping budget → budget card, Shopping good',
    `got ${bud.card?.kind}`
  );

  // category trend (week over week) → pattern card trending up.
  const tr = routeMessage(
    'is my transport spending trending up or down',
    CTX_TREND
  );
  check(
    tr.card?.kind === 'pattern' && tr.card.data.direction === 'up',
    '[card+]  transport trend → pattern card, direction up',
    `got ${tr.card?.kind}, dir ${tr.card?.kind === 'pattern' ? tr.card.data.direction : '-'}`
  );

  // range-scoped compare (this vs last month for a category) → compare card.
  const cmp = routeMessage(
    'am i spending more on food compared to last month',
    CTX_TX
  );
  check(
    cmp.card?.kind === 'compare' && cmp.card.data.current === 420,
    '[card+]  food vs last month → compare card, current ₱420',
    `got ${cmp.card?.kind}, current ${cmp.card?.kind === 'compare' ? cmp.card.data.current : '-'}`
  );

  // budgetStatus with no budgets configured → text + "Set a budget" action.
  const noBud = routeMessage('am i within my budget', {
    ...CTX_TX,
    budgets: [],
  });
  check(
    (noBud.actions ?? []).some(
      (a) => a.kind === 'navigate' && a.target === 'categories'
    ),
    '[card+]  no budgets → Set a budget action',
    `actions ${JSON.stringify(noBud.actions)}`
  );
}

// ─── Category 4: advice & coaching cards (V3) ────────────────────────────────
// Advice answers ride the `coach` card kind extended with action buttons.

const CTX_SUBS: BrainContext = {
  ...CTX_INS,
  insights: buildInsights({
    recurring: [
      {
        merchant: 'Netflix',
        category: 'Entertainment',
        amount: 549,
        dayOfMonth: 5,
        monthsObserved: 3,
        nextEstimatedDate: null,
        daysUntilNext: 5,
      },
      {
        merchant: 'Spotify',
        category: 'Entertainment',
        amount: 149,
        dayOfMonth: 5,
        monthsObserved: 3,
        nextEstimatedDate: null,
        daysUntilNext: 5,
      },
    ],
  }),
};

/** A reply's action targets (card-level + reply-level), for assertions. */
function actionTargets(r: ReturnType<typeof routeMessage>): string[] {
  const fromCard =
    r.card?.actions?.map((a) => (a.kind === 'navigate' ? a.target : a.send)) ??
    [];
  const fromReply =
    r.actions?.map((a) => (a.kind === 'navigate' ? a.target : a.send)) ?? [];
  return [...fromCard, ...fromReply];
}

{
  // subscriptionCut → coach card listing recurring + a Review subscriptions CTA.
  const subs = routeMessage(
    'how can i cut down on my subscription costs',
    CTX_SUBS
  );
  check(
    subs.card?.kind === 'coach' &&
      (subs.card.data.reasons?.length ?? 0) >= 1 &&
      actionTargets(subs).includes('recurringBills'),
    '[card+]  subscriptionCut → coach card + Review subscriptions',
    `got ${subs.card?.kind}, targets ${actionTargets(subs).join(',')}`
  );

  // emergencyFund → coach card + Create goal prefilled (name + target).
  const ef = routeMessage(
    'give me advice on how to build an emergency fund',
    CTX_INS
  );
  const efGoal = ef.card?.actions?.find(
    (a) => a.kind === 'navigate' && a.target === 'savingsGoal'
  );
  check(
    ef.card?.kind === 'coach' &&
      efGoal?.kind === 'navigate' &&
      (efGoal.params?.name as string) === 'Emergency Fund' &&
      typeof efGoal.params?.target === 'number',
    '[card+]  emergencyFund → Create goal prefilled (Emergency Fund + target)',
    `goal ${JSON.stringify(efGoal)}`
  );

  // goalPlan with a price → Create goal prefilled with that target.
  const gp = routeMessage('i want to save for a 60000 laptop', CTX_INS);
  const gpGoal = gp.card?.actions?.find(
    (a) => a.kind === 'navigate' && a.target === 'savingsGoal'
  );
  check(
    gp.card?.kind === 'coach' &&
      gpGoal?.kind === 'navigate' &&
      gpGoal.params?.target === 60000,
    '[card+]  goalPlan → Create goal prefilled (target ₱60,000)',
    `goal ${JSON.stringify(gpGoal)}`
  );

  // cutAmount with a target → coach card naming categories to trim.
  const ca = routeMessage(
    'where can i cut 2000 from my budget this month',
    CTX_INS
  );
  check(
    ca.card?.kind === 'coach' && (ca.card.data.reasons?.length ?? 0) >= 1,
    '[card+]  cutAmount → coach card with trim rows',
    `got ${ca.card?.kind}, reasons ${ca.card?.kind === 'coach' ? ca.card.data.reasons?.length : '-'}`
  );

  // ruleOfThumb → coach card with the 50/30/20 split + Set budgets CTA.
  const rot = routeMessage(
    'what is a good rule of thumb for budgeting my salary',
    CTX_INS
  );
  check(
    rot.card?.kind === 'coach' &&
      (rot.card.data.reasons?.length ?? 0) === 3 &&
      actionTargets(rot).includes('categories'),
    '[card+]  ruleOfThumb → 50/30/20 coach card + Set budgets',
    `got ${rot.card?.kind}`
  );

  // impulseTips → static coach card (works without any context data).
  const imp = routeMessage('provide some tips to avoid impulse buying', CTX);
  check(
    imp.card?.kind === 'coach' && (imp.card.data.reasons?.length ?? 0) >= 1,
    '[card+]  impulseTips → static coach card',
    `got ${imp.card?.kind}`
  );
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error('\nSome brain tests failed.');
  process.exit(1);
}
console.log('\nAll tests passed.');
