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
  type BrainContext,
  type IntentId,
} from '../src/intelligence/convo/brain';
import type { TimeRangeKey } from '../src/intelligence/core/time';
import type { MasterCategory } from '../src/intelligence/taxonomy/taxonomy';

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

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error('\nSome brain tests failed.');
  process.exit(1);
}
console.log('\nAll tests passed.');
