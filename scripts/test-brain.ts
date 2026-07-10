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
import modelJson from '../src/intelligence/convo/classifier/model.json';
import type { NbModel } from '../src/intelligence/convo/classifier/naiveBayes';
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
  /** Assert that NO category slot was extracted (guards alias leaks like the
   *  bare-"fast" → Food bug). */
  noCategory?: boolean;
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
  // Goal statements (gated out of the logger by route.ts).
  {
    desc: 'EN goal buy iphone 17',
    text: 'goal this month to buy iphone 17',
    intent: 'goalPlan',
  },
  {
    desc: 'EN my goal is to save 50k',
    text: 'my goal is to save 50k',
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

  // ── afford + misroute regressions (English sweep, 2026-06-08) ────────────────
  {
    desc: 'EN afford w/ price',
    text: 'can i afford a 2000 dinner',
    intent: 'afford',
  },
  { desc: 'EN can i buy X', text: 'can i buy a phone', intent: 'afford' },
  {
    desc: 'EN afford big',
    text: 'can i afford a 50000 laptop',
    intent: 'afford',
  },
  { desc: 'EN broke → balance', text: 'am i broke', intent: 'balance' },
  { desc: 'EN rich → balance', text: 'am i rich', intent: 'balance' },
  {
    desc: 'EN what i bought today → transactions',
    text: 'show me what i bought today',
    intent: 'transactions',
    time: 'today',
  },

  // ── debt (receivables — money owed TO the user) ──────────────────────────────
  { desc: 'EN how much do i owe', text: 'how much do i owe', intent: 'debt' },
  { desc: 'EN who owes me', text: 'who owes me money', intent: 'debt' },
  { desc: 'EN what are my debts', text: 'what are my debts', intent: 'debt' },
  { desc: 'EN who do i owe', text: 'who do i owe money to', intent: 'debt' },
  // Statement forms (gated out of the logger by route.ts) — must land on debt
  // so the brain can propose tracking in the Utang Tracker.
  { desc: 'EN owed me stmt', text: 'paul owed me 5k', intent: 'debt' },
  { desc: 'EN owes me stmt', text: 'paul owes me 500', intent: 'debt' },
  { desc: 'EN borrowed stmt', text: 'paul borrowed 5k', intent: 'debt' },
  { desc: 'EN lent stmt', text: 'i lent paul 2000', intent: 'debt' },
  { desc: 'EN loaned-to stmt', text: 'loaned 500 to maria', intent: 'debt' },

  // ── safeToSpend (chat-mutations plan, Phase 1) ───────────────────────────────
  {
    desc: 'EN safe to spend',
    text: 'how much is safe to spend',
    intent: 'safeToSpend',
  },
  {
    desc: 'EN how much can i safely spend',
    text: 'how much can i safely spend this month',
    intent: 'safeToSpend',
  },
  {
    desc: 'EN left to spend',
    text: 'how much do i have left to spend',
    intent: 'safeToSpend',
  },

  // ── reCategorize command (Phase 3) ───────────────────────────────────────────
  {
    desc: 'EN recategorize as',
    text: 'recategorize my spotify charge as food',
    intent: 'reCategorize',
  },
  {
    desc: 'EN move to',
    text: 'move my grab ride to transport',
    intent: 'reCategorize',
  },
  {
    desc: 'EN reclassify',
    text: 'reclassify my last transaction as bills',
    intent: 'reCategorize',
  },

  // ── splitBill (Phase 4) ──────────────────────────────────────────────────────
  { desc: 'EN split the bill', text: 'split the bill', intent: 'splitBill' },
  {
    desc: 'EN split dinner with',
    text: 'split the dinner bill with my friends',
    intent: 'splitBill',
  },

  // ── Meerkat plan, pack A: data questions ─────────────────────────────────────
  { desc: 'EN runway', text: 'how long will my money last', intent: 'runway' },
  { desc: 'EN burn rate', text: 'whats my burn rate', intent: 'runway' },
  {
    desc: 'EN why so high',
    text: 'why is my spending so high this month',
    intent: 'explainSpend',
    time: 'thisMonth',
  },
  {
    desc: 'EN what changed',
    text: 'what changed since last month',
    intent: 'explainSpend',
    time: 'lastMonth',
  },
  {
    desc: 'EN cheapest month',
    text: 'whats the cheapest month i had this year',
    intent: 'monthPattern',
    time: 'thisYear',
  },
  {
    desc: 'EN priciest month',
    text: 'which month did i spend the most',
    intent: 'monthPattern',
  },
  {
    desc: 'EN cat vs cat compare',
    text: 'compare my food spending to my transport spending',
    intent: 'compare',
    category: 'food',
  },
  {
    desc: 'EN food or transport',
    text: 'did i spend more on food or transport',
    intent: 'spend',
    category: 'food',
  },
  {
    desc: 'EN weekend vs weekday',
    text: 'did i spend more on weekends or weekdays',
    intent: 'dowPattern',
  },
  {
    desc: 'EN saved so far this year',
    text: 'how much have i saved so far this year',
    intent: 'savings',
    time: 'thisYear',
  },
  {
    desc: 'EN average daily spend',
    text: 'whats my average daily spend',
    intent: 'typicalSpend',
  },

  // ── Meerkat plan, pack B: bills + commands ───────────────────────────────────
  {
    desc: 'EN next bill due',
    text: 'when is my next bill due',
    intent: 'upcomingBills',
  },
  {
    desc: 'EN bills this week',
    text: 'what bills are coming up this week',
    intent: 'upcomingBills',
    time: 'thisWeek',
  },
  {
    desc: 'EN set budget',
    text: 'set a budget of 5000 for food',
    intent: 'setBudget',
    category: 'food',
  },
  {
    desc: 'EN bare budget command',
    text: 'budget 3000 for transport',
    intent: 'setBudget',
    category: 'transport',
  },
  {
    desc: 'EN delete last tx',
    text: 'delete my last transaction',
    intent: 'deleteTransaction',
  },
  {
    desc: 'EN remove 500 charge',
    text: 'remove the 500 charge',
    intent: 'deleteTransaction',
  },
  {
    desc: 'EN transfer between accounts',
    text: 'transfer 500 from gcash to bpi',
    intent: 'transfer',
  },
  {
    desc: 'EN move to savings (B5)',
    text: 'move 500 to savings',
    intent: 'transfer',
  },
  {
    desc: 'EN remind electric bill',
    text: 'remind me to pay my electric bill 2000',
    intent: 'reminder',
  },
  {
    desc: 'EN set a reminder',
    text: 'set a reminder for my internet bill',
    intent: 'reminder',
  },
  {
    desc: 'EN want to buy (B1)',
    text: 'i want to buy a phone for 25000',
    intent: 'afford',
  },

  // ── Human-like probe review misroutes (2026-07-08) ───────────────────────────
  // "remind me <interrogative>" is a RECALL question, not a reminder to stage.
  {
    desc: 'EN remind-recall lent',
    text: 'remind me who i lent money to',
    intent: 'debt',
  },
  {
    desc: 'EN remind-recall owe',
    text: 'remind me how much i owe',
    intent: 'debt',
  },
  // A WHEN question about pay landing → salaryStatus (its answer carries the
  // date); a plain income total would not answer the "when".
  {
    desc: 'EN when last paid',
    text: 'when did i last get paid',
    intent: 'salaryStatus',
  },
  // A WHY about money draining → explain, not a balance listing ("am i broke"
  // stays balance — asserted above).
  {
    desc: 'EN why always broke',
    text: 'why am i always broke',
    intent: 'explainSpend',
  },
  // Self-assessment → coach.
  {
    desc: 'EN bad with money',
    text: 'am i bad with money',
    intent: 'coach',
  },
  // Budget-SIZING guidance → ruleOfThumb, not the status of budgets they
  // haven't set.
  {
    desc: 'EN what should budget be',
    text: 'what should my monthly budget be',
    intent: 'ruleOfThumb',
  },
  // "what's in my bank account" is a balance question, not a transfer (the
  // corpus over-associates "bank account" with transfers).
  {
    desc: 'EN whats in bank account',
    text: 'whats in my bank account',
    intent: 'balance',
  },
  // Bare "fast" must NOT tag Food (it was a fast_food alias) — "spending too
  // fast" is an overall pacing question, not a Food-scoped one.
  {
    desc: 'EN spending too fast (no Food tag)',
    text: 'am i spending too fast',
    intent: 'spend',
    noCategory: true,
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
  // Abuse / hostility / chit-chat must reject, never answer as a finance query.
  { desc: 'OOS profanity', text: 'suck my dick' },
  { desc: 'OOS insult', text: 'fuck you' },
  { desc: 'OOS hostile', text: 'i hate this app' },
  { desc: 'OOS identity', text: 'are you human' },
  { desc: 'OOS offtopic', text: 'order me a pizza' },
  { desc: 'OOS terminator', text: 'stop' },
  { desc: 'OOS distrust', text: 'you lied' },
  // Anchor-gate regressions (2026-07-08): grammatical off-topic English used to
  // leak into finance answers because the char-gram NB over-matches function
  // words. The finance domain-anchor gate must reject all of these.
  { desc: 'OOS trivia everest', text: 'how tall is mount everest' },
  { desc: 'OOS trivia president', text: 'who is the president' },
  { desc: 'OOS cooking', text: 'how do i cook adobo' },
  { desc: 'OOS health', text: 'my head hurts' },
  { desc: 'OOS alarm', text: 'set an alarm for 7am' },
  { desc: 'OOS movie', text: 'recommend me a movie' },
  { desc: 'OOS tired', text: 'i am tired' },
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
  if (c.noCategory) {
    check(
      cls.slots.category === undefined,
      `[nocat]  ${c.desc}`,
      `"${c.text}" → unexpectedly tagged ${cls.slots.category?.master}`
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

// ─── Overspend narration: runaway % against a tiny baseline is reframed ──────
// ₱50 usual vs ₱3,192 this month is a real anomaly, but "6283% over" is noise —
// the reply must lead with absolute pesos and quote no percentage.
{
  const tiny = buildInsights({
    anomalies: [
      {
        category: 'health',
        current: 3192,
        baseline: 50,
        pctOver: (3192 - 50) / 50,
      },
    ],
  });
  const r = routeMessage('am i overspending', { ...CTX, insights: tiny });
  check(
    !/%/.test(r.text) && /3,192/.test(r.text) && /₱50\b/.test(r.text),
    '[overspend] tiny baseline → absolute framing, no runaway %',
    `text "${r.text}"`
  );

  // A material baseline keeps the readable percentage framing.
  const material = buildInsights({
    anomalies: [
      {
        category: 'food',
        current: 8000,
        baseline: 5000,
        pctOver: (8000 - 5000) / 5000,
      },
    ],
  });
  const r2 = routeMessage('am i overspending', { ...CTX, insights: material });
  check(
    /60%/.test(r2.text),
    '[overspend] material baseline → keeps % framing (60%)',
    `text "${r2.text}"`
  );
}

// ─── Debt = receivables (money owed TO the user), 2026-06-08 ─────────────────
// The Utang table stores who owes the user; answers are always worded as money
// owed *to* them, and a payable-shaped question gets a clarification first.
{
  const CTX_DEBT: BrainContext = {
    ...CTX,
    debts: [
      { debtor: 'Ana', total: 5000, paid: 2000, remaining: 3000 },
      { debtor: 'Ben', total: 2000, paid: 0, remaining: 2000 },
    ],
  };
  // Payable phrasing → clarify direction, then answer with the total owed to you.
  const owe = routeMessage('how much do i owe', CTX_DEBT);
  check(
    /track money owed/i.test(owe.text) &&
      /5,000/.test(owe.text) &&
      owe.card?.kind === 'coach',
    '[debt] "how much do i owe" → clarifies direction + ₱5,000 owed to you',
    `text "${owe.text}"`
  );

  // Receivable phrasing → no clarification needed, same total.
  const who = routeMessage('who owes me money', CTX_DEBT);
  check(
    /5,000/.test(who.text) &&
      (who.card?.actions ?? []).some(
        (a) => a.kind === 'navigate' && a.target === 'utangTracker'
      ),
    '[debt] "who owes me" → ₱5,000 + Open Utang Tracker',
    `text "${who.text}"`
  );

  // No debts tracked → honest empty state, never a fabricated number.
  const none = routeMessage('how much do i owe', { ...CTX, debts: [] });
  check(
    /not tracking any utang/i.test(none.text) &&
      (none.actions ?? []).some((a) => a.kind === 'navigate'),
    '[debt] no debts → empty state + Utang action',
    `text "${none.text}"`
  );

  // NEW-receivable statements ("Paul owed me 5k") propose tracking it —
  // prefilled Utang Tracker action with debtor + amount, never an expense log
  // and never just the existing-debts listing.
  const stmt = routeMessage('paul owed me 5k', CTX_DEBT);
  const stmtAction = (stmt.card?.actions ?? []).find(
    (a) => a.kind === 'navigate' && a.target === 'utangTracker'
  );
  check(
    /paul/i.test(stmt.text) &&
      /5,000/.test(stmt.text) &&
      stmtAction?.kind === 'navigate' &&
      stmtAction.params?.debtorName === 'Paul' &&
      stmtAction.params?.amount === 5000,
    '[debt] "paul owed me 5k" → track-it card prefilled (Paul, ₱5,000)',
    `text "${stmt.text}"`
  );

  const borrowed = routeMessage('paul borrowed 5k', CTX_DEBT);
  check(
    /paul/i.test(borrowed.text) &&
      /5,000/.test(borrowed.text) &&
      (borrowed.card?.actions ?? []).some(
        (a) => a.kind === 'navigate' && a.target === 'utangTracker'
      ),
    '[debt] "paul borrowed 5k" → track-it card, not a log/listing',
    `text "${borrowed.text}"`
  );

  const lent = routeMessage('i lent maria 2000', CTX_DEBT);
  const lentAction = (lent.card?.actions ?? []).find(
    (a) => a.kind === 'navigate' && a.target === 'utangTracker'
  );
  check(
    lentAction?.kind === 'navigate' &&
      lentAction.params?.debtorName === 'Maria' &&
      lentAction.params?.amount === 2000,
    '[debt] "i lent maria 2000" → track-it prefilled (Maria, ₱2,000)',
    `text "${lent.text}"`
  );

  // Question forms must NOT be mistaken for statements ("who owes me" has no
  // debtor to stage) — they keep the listing answer.
  const q = routeMessage('who owes me money', CTX_DEBT);
  check(
    q.card?.kind === 'coach' &&
      q.card.data.title !== 'Track this utang?' &&
      /5,000/.test(q.text),
    '[debt] "who owes me money" still lists, never stages "Who"',
    `text "${q.text}"`
  );

  // "i borrowed…" is the user's own payable — direction clarified, not staged.
  const payable = routeMessage('i borrowed 5000 from paul', CTX_DEBT);
  check(
    /owed \*to\* you/i.test(payable.text) ||
      /track money owed/i.test(payable.text),
    '[debt] "i borrowed 5000 from paul" → direction clarified, not staged',
    `text "${payable.text}"`
  );
}

// ─── Affordability cards (English sweep, 2026-06-08) ─────────────────────────
// CTX balance = ₱12,000. Price-bearing asks get a yes/no status card; a too-big
// purchase gets a "no" + a pre-filled savings-goal action; no price → ask first.
{
  const yes = routeMessage('can i afford a 2000 dinner', CTX);
  check(
    yes.card?.kind === 'status' && yes.card.data.yes === true,
    '[afford] ₱2,000 vs ₱12,000 → status yes',
    `got ${yes.card?.kind}`
  );

  const no = routeMessage('can i afford a 50000 laptop', CTX);
  check(
    no.card?.kind === 'status' &&
      no.card.data.yes === false &&
      (no.card.actions ?? []).some(
        (a) => a.kind === 'navigate' && a.target === 'savingsGoal'
      ),
    '[afford] ₱50,000 → status no + Create-goal action',
    `got ${no.card?.kind}`
  );

  const noPrice = routeMessage('can i buy a phone', CTX);
  check(
    noPrice.card?.kind === 'coach' && /price/i.test(noPrice.text),
    '[afford] no price → asks for the price (coach card)',
    `got ${noPrice.card?.kind}, text "${noPrice.text.slice(0, 60)}"`
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

  // Explicit calendar date → snapshot-sliced spend for that single day (only the
  // ₱5,000 Lazada order lands on Jun 10), narrated "on Jun 10" — not a clarify.
  const day = routeMessage('how much did i spend on june 10', CTX_TX);
  check(
    /spent/i.test(day.text) &&
      /Jun 10/.test(day.text) &&
      /5,000/.test(day.text) &&
      !/Insights/.test(day.text),
    '[grammar] spend on june 10 → ₱5,000 on Jun 10',
    `text "${day.text}"`
  );

  // "N weeks ago" → the Mon–Sun week (Jun 1–7); only Starbucks ₱300 + Spotify
  // ₱149 = ₱449 fall in it, narrated "the week of Jun 1".
  const wa = routeMessage('how much did i spend 2 weeks ago', CTX_TX);
  check(
    /spent/i.test(wa.text) &&
      /week of Jun 1/.test(wa.text) &&
      /449/.test(wa.text),
    '[grammar] spend 2 weeks ago → ₱449 the week of Jun 1',
    `text "${wa.text}"`
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

  // Goal statement with a model number ("iPhone 17") — the 17 is part of the
  // name, NEVER a ₱17 target; with no real price the brain asks for one and
  // still stages the prefilled goal.
  const gm = routeMessage('goal this month to buy iphone 17', CTX_INS);
  const gmGoal = gm.card?.actions?.find(
    (a) => a.kind === 'navigate' && a.target === 'savingsGoal'
  );
  check(
    gm.card?.kind === 'coach' &&
      gmGoal?.kind === 'navigate' &&
      /iphone 17/i.test((gmGoal.params?.name as string) ?? '') &&
      gmGoal.params?.target === undefined &&
      /price/i.test(gm.text),
    '[card+]  goal stmt "buy iphone 17" → named goal, no ₱17 target',
    `goal ${JSON.stringify(gmGoal)} text "${gm.text}"`
  );

  // Goal statement with a real price → target picked up, model-number rule
  // doesn't eat legitimate amounts.
  const gs = routeMessage('my goal is to save 50000 for a car', CTX_INS);
  const gsGoal = gs.card?.actions?.find(
    (a) => a.kind === 'navigate' && a.target === 'savingsGoal'
  );
  check(
    gsGoal?.kind === 'navigate' && gsGoal.params?.target === 50000,
    '[card+]  goal stmt "save 50000 for a car" → target ₱50,000',
    `goal ${JSON.stringify(gsGoal)}`
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

// ─── Chat-mutations plan: safe-to-spend, re-categorize, split ────────────────
// Safe-to-spend narrates; re-categorize PROPOSES a mutation (no silent writes —
// only emits `mutation` when both the row and destination resolve); split
// navigates to the BillSplitter (no in-chat write).
{
  // safe to spend → coach card. CTX: income 30k − spend 18k, clamped to balance.
  const sts = routeMessage('how much is safe to spend', CTX);
  check(
    sts.card?.kind === 'coach' && /safe to spend/i.test(sts.text),
    '[mutate]  safe to spend → coach card',
    `got ${sts.card?.kind}, text "${sts.text.slice(0, 60)}"`
  );

  // re-categorize → a recategorize mutation proposal (Spotify t4 Ent → Food).
  const rc = routeMessage('recategorize my spotify charge as food', CTX_TX);
  check(
    rc.mutation?.kind === 'recategorize' &&
      rc.mutation.txId === 't4' &&
      rc.mutation.fromCategory === 'Entertainment' &&
      rc.mutation.toCategory === 'Food' &&
      rc.card?.kind === 'coach',
    '[mutate]  recategorize spotify → Food mutation proposal',
    `mutation ${JSON.stringify(rc.mutation)}`
  );

  // missing destination → asks, never a mutation (no wrong/silent write).
  const rcNo = routeMessage('recategorize my spotify charge', CTX_TX);
  check(
    rcNo.mutation === undefined && /category/i.test(rcNo.text),
    '[mutate]  recategorize w/o destination → asks, no mutation',
    `mutation ${JSON.stringify(rcNo.mutation)}`
  );

  // destination === current category → no-op, no mutation (Grab is Transport).
  const rcSame = routeMessage('move my grab ride to transport', CTX_TX);
  check(
    rcSame.mutation === undefined && /already tagged/i.test(rcSame.text),
    '[mutate]  recategorize to same category → no-op, no mutation',
    `text "${rcSame.text}"`
  );

  // split bill → coach card + Open Bill Splitter navigate action (no mutation).
  const sp = routeMessage('split the bill', CTX);
  check(
    sp.card?.kind === 'coach' &&
      sp.mutation === undefined &&
      (sp.card.actions ?? []).some(
        (a) => a.kind === 'navigate' && a.target === 'billSplitter'
      ),
    '[mutate]  split bill → coach card + billSplitter action',
    `got ${sp.card?.kind}`
  );
}

// ─── Meerkat plan: bug fixes + capability pack (Phases 1–3) ──────────────────
// A richer fixture: multi-month history, named accounts, budgets, recurring
// bills, and an explicit snapshotStart so the honest-coverage caveat (B2) and
// the new handlers can all be exercised offline.

const PLAN_TX: TxLite[] = [
  ...TX,
  {
    id: 't9',
    amount: 2000,
    type: 'expense',
    category: 'Food',
    merchant: 'Grocery',
    name: 'Groceries',
    date: '2026-04-10',
    accountId: 'a1',
  },
  {
    id: 't10',
    amount: 900,
    type: 'expense',
    category: 'Food',
    merchant: 'SM',
    name: 'Weekend market',
    date: '2026-06-13', // Saturday
    accountId: 'a1',
  },
];

const CTX_PLAN: BrainContext = {
  ...CTX_INS,
  now: NOW.toISOString(),
  transactions: PLAN_TX,
  snapshotStart: '2025-05-01',
  accounts: [
    { id: 'a1', name: 'GCash', balance: 8000 },
    { id: 'a2', name: 'BPI', balance: 4000 },
  ],
  budgets: [{ category: 'Food', limit: 10000 }],
  recurringIncome: [{ label: 'Salary', amount: 30000, dayOfMonth: 1 }],
  recurringBills: [
    {
      label: 'internet',
      amount: 1500,
      cadence: 'monthly',
      nextDueAt: '2026-06-18',
    },
    {
      label: 'rent',
      amount: 8000,
      cadence: 'monthly',
      nextDueAt: '2026-07-01',
    },
    {
      label: 'netflix',
      amount: 549,
      cadence: 'monthly',
      nextDueAt: '2026-06-20',
    },
  ],
};

// Runway: no insights → baseline is last month's ₱20,000 → ₱12,000 lasts ~18 days.
{
  const rw = routeMessage('how long will my money last', CTX);
  check(
    rw.card?.kind === 'coach' &&
      /18 days/.test(rw.text) &&
      /no new income/.test(rw.text),
    '[plan]   runway → ~18 days + assumes-no-income caveat',
    `text "${rw.text}"`
  );

  // Zero balance → honest no-runway answer, never a division artifact.
  const broke = routeMessage('whats my burn rate', { ...CTX, balance: 0 });
  check(
    /no runway/i.test(broke.text),
    '[plan]   runway at ₱0 balance → honest empty state',
    `text "${broke.text}"`
  );
}

// explainSpend: month-over-month delta + the top category drivers.
{
  const better = routeMessage(
    'why is my spending so high this month',
    CTX_PLAN
  );
  check(
    /trending better/i.test(better.text) &&
      better.card?.kind === 'coach' &&
      (better.card.data.reasons?.length ?? 0) === 3,
    '[plan]   explainSpend (down month) → honest "trending better" + 3 drivers',
    `text "${better.text.slice(0, 90)}"`
  );

  const worse = routeMessage('what changed since last month', {
    ...CTX_PLAN,
    spent: 25000,
  });
  check(
    /more than last month/i.test(worse.text) && /25%/.test(worse.text),
    '[plan]   explainSpend (up month) → +₱5,000 (25%) vs last month',
    `text "${worse.text.slice(0, 90)}"`
  );
}

// monthPattern: Feb ₱12,000 vs Apr ₱2,000; current month never crowned.
{
  const cheap = routeMessage(
    'whats the cheapest month i had this year',
    CTX_PLAN
  );
  check(
    /cheapest month was Apr at ₱2,000/.test(cheap.text) &&
      /Feb at ₱12,000/.test(cheap.text) &&
      cheap.card?.kind === 'pattern',
    '[plan]   cheapest month → Apr ₱2,000 (priciest Feb ₱12,000) + pattern card',
    `text "${cheap.text}"`
  );

  const pricey = routeMessage('which month did i spend the most', CTX_PLAN);
  check(
    /most expensive month was Feb/.test(pricey.text) &&
      /counting since May 1, 2025/.test(pricey.text),
    '[plan]   priciest month → Feb + names the data span',
    `text "${pricey.text}"`
  );

  // Too little history → asks for time, never a misleading crown.
  const thin = routeMessage('whats my most expensive month', {
    ...CTX_PLAN,
    transactions: TX.filter((t) => t.date.startsWith('2026-06')),
  });
  check(
    /enough full months/i.test(thin.text),
    '[plan]   monthPattern w/ 1 full month → honest insufficiency',
    `text "${thin.text}"`
  );
}

// Snapshot-coverage caveat (B2): a range older than the snapshot says so.
{
  const ly = routeMessage('how much did i spend last year', CTX_PLAN);
  check(
    /only see back to May 1, 2025/.test(ly.text),
    '[plan]   spend last year → honest coverage caveat (B2)',
    `text "${ly.text}"`
  );

  // A fully-covered range carries no caveat noise.
  const tm = routeMessage('how much did i spend this month', CTX_PLAN);
  check(
    !/only see back/.test(tm.text),
    '[plan]   spend this month → no caveat when fully covered',
    `text "${tm.text}"`
  );
}

// Category-vs-category compare: both categories over the same window.
{
  const cvc = routeMessage(
    'compare my food spending to my transport spending',
    CTX_PLAN
  );
  check(
    cvc.card?.kind === 'compare' &&
      cvc.card.data.current === 1320 &&
      cvc.card.data.previous === 60 &&
      /Food wins/.test(cvc.text),
    '[plan]   food vs transport → compare card ₱1,320 vs ₱60',
    `text "${cvc.text}", card ${JSON.stringify(cvc.card?.kind === 'compare' ? cvc.card.data : null)}`
  );
}

// Weekend-vs-weekday: per-day averages decide, not raw totals.
{
  const wknd = routeMessage(
    'did i spend more on weekends or weekdays',
    CTX_PLAN
  );
  check(
    /more on weekdays/.test(wknd.text) &&
      wknd.card?.kind === 'pattern' &&
      wknd.card.data.bars.length === 2,
    '[plan]   weekends vs weekdays → per-day verdict + 2-bar pattern card',
    `text "${wknd.text}"`
  );
}

// Saved-so-far honors the range: income − expense over this year.
{
  const saved = routeMessage(
    'how much have i saved so far this year',
    CTX_PLAN
  );
  check(
    /7,971/.test(saved.text) &&
      /30,000/.test(saved.text) &&
      /22,029/.test(saved.text),
    '[plan]   saved this year → ₱7,971 (₱30,000 in − ₱22,029 out)',
    `text "${saved.text}"`
  );
}

// Average-daily mode: month-to-date total ÷ days elapsed.
{
  const avg = routeMessage('whats my average daily spend', CTX_PLAN);
  check(
    /1,200\/day/.test(avg.text) && /18,000 over 15 days/.test(avg.text),
    '[plan]   average daily spend → ₱1,200/day (₱18,000 ÷ 15)',
    `text "${avg.text}"`
  );
}

// upcomingBills: next 3 by due date, windowed by an explicit range.
{
  const next = routeMessage('when is my next bill due', CTX_PLAN);
  check(
    /Internet — ₱1,500/.test(next.text) &&
      /Jun 18/.test(next.text) &&
      /10,049/.test(next.text) &&
      next.card?.kind === 'coach' &&
      (next.card.data.reasons?.length ?? 0) === 3,
    '[plan]   next bill due → Internet ₱1,500 Jun 18, 3 bills ₱10,049',
    `text "${next.text}"`
  );

  const week = routeMessage('what bills are coming up this week', CTX_PLAN);
  check(
    /2 bills/.test(week.text) && /2,049/.test(week.text),
    '[plan]   bills this week → 2 bills ₱2,049 (rent excluded)',
    `text "${week.text}"`
  );

  const none = routeMessage('when is my next bill due', {
    ...CTX_PLAN,
    recurringBills: [],
  });
  check(
    /haven't set up any recurring bills/i.test(none.text) &&
      (none.actions ?? []).some(
        (a) => a.kind === 'navigate' && a.target === 'recurringBills'
      ),
    '[plan]   no recurring bills → setup nudge + navigate action',
    `text "${none.text}"`
  );
}

// setBudget: proposes a mutation; the write happens only after ChatScreen confirm.
{
  const upd = routeMessage('set a budget of 5000 for food', CTX_PLAN);
  check(
    upd.mutation?.kind === 'setBudget' &&
      upd.mutation.category === 'Food' &&
      upd.mutation.limit === 5000 &&
      /from ₱10,000 to ₱5,000/.test(upd.text),
    '[plan]   set budget (existing) → setBudget mutation + old-limit copy',
    `mutation ${JSON.stringify(upd.mutation)}, text "${upd.text}"`
  );

  const fresh = routeMessage('budget 3000 for transport', CTX_PLAN);
  check(
    fresh.mutation?.kind === 'setBudget' &&
      fresh.mutation.category === 'Transport' &&
      fresh.mutation.limit === 3000,
    '[plan]   bare budget command → setBudget mutation (Transport ₱3,000)',
    `mutation ${JSON.stringify(fresh.mutation)}`
  );

  const noAmt = routeMessage('set a budget for food', CTX_PLAN);
  check(
    noAmt.mutation === undefined && /monthly cap/i.test(noAmt.text),
    '[plan]   budget w/o amount → asks for the cap, no mutation',
    `text "${noAmt.text}"`
  );
}

// deleteTransaction: explicit row resolution; an unmatched amount asks, never
// proposes a different row (destructive precision over recall).
{
  const last = routeMessage('delete my last transaction', CTX_PLAN);
  check(
    last.mutation?.kind === 'delete' &&
      last.mutation.txId === 't1' &&
      /Delete Jollibee/.test(last.text) &&
      /sure/.test(last.text),
    '[plan]   delete last tx → delete mutation for the newest row',
    `mutation ${JSON.stringify(last.mutation)}`
  );

  const byAmt = routeMessage('delete the 1500 charge', CTX_PLAN);
  check(
    byAmt.mutation?.kind === 'delete' && byAmt.mutation.txId === 't5',
    '[plan]   delete the ₱1,500 charge → PLDT row',
    `mutation ${JSON.stringify(byAmt.mutation)}`
  );

  const miss = routeMessage('remove the 500 charge', CTX_PLAN);
  check(
    miss.mutation === undefined && /which transaction/i.test(miss.text),
    '[plan]   delete w/ unmatched amount → asks, never a wrong-row proposal',
    `mutation ${JSON.stringify(miss.mutation)}, text "${miss.text}"`
  );
}

// transfer: both accounts must resolve; partial resolution clarifies (B5).
{
  const full = routeMessage('transfer 500 from gcash to bpi', CTX_PLAN);
  check(
    full.mutation?.kind === 'transfer' &&
      full.mutation.amount === 500 &&
      full.mutation.fromLabel === 'GCash' &&
      full.mutation.toLabel === 'BPI' &&
      full.mutation.fromAccountId !== full.mutation.toAccountId,
    '[plan]   transfer gcash → bpi → transfer mutation proposal',
    `mutation ${JSON.stringify(full.mutation)}`
  );

  // Source omitted with exactly one other account → it's unambiguous.
  const implied = routeMessage('transfer 500 to bpi', CTX_PLAN);
  check(
    implied.mutation?.kind === 'transfer' &&
      implied.mutation.fromLabel === 'GCash',
    '[plan]   transfer w/o source, 2 accounts → source implied (GCash)',
    `mutation ${JSON.stringify(implied.mutation)}`
  );

  // B5: "move 500 to savings" — no savings account → sane clarify, no hijack,
  // no log, no write.
  const hijack = routeMessage('move 500 to savings', CTX_PLAN);
  check(
    hijack.mutation === undefined && hijack.text.length > 0,
    '[plan]   move 500 to savings → clarify, never a hijack or write (B5)',
    `mutation ${JSON.stringify(hijack.mutation)}, text "${hijack.text}"`
  );

  const oneAcct = routeMessage('transfer 500 from gcash to bpi', {
    ...CTX_PLAN,
    accounts: [{ id: 'a1', name: 'GCash', balance: 8000 }],
  });
  check(
    oneAcct.mutation === undefined &&
      /at least two accounts/i.test(oneAcct.text),
    '[plan]   transfer w/ one account → explains, no mutation',
    `text "${oneAcct.text}"`
  );
}

// reminder: navigate-prefill to Recurring Bills — no write, ever.
{
  const rem = routeMessage('remind me to pay my electric bill 2000', CTX_PLAN);
  const nav = rem.card?.actions?.find(
    (a) => a.kind === 'navigate' && a.target === 'recurringBills'
  );
  check(
    rem.mutation === undefined &&
      nav?.kind === 'navigate' &&
      nav.params?.title === 'Electric' &&
      nav.params?.amount === 2000,
    '[plan]   remind electric 2000 → recurringBills prefill (Electric, ₱2,000), no write',
    `nav ${JSON.stringify(nav)}`
  );
}

// ─── count: frequency tally over the snapshot (was a flat "can't count") ─────
{
  // CTX_TX has two Food rows this month (Jollibee ₱120, Starbucks ₱300) and one
  // Grab ride (₱60). "how many times did i buy food this month" → 2 × ₱420.
  const food = routeMessage('how many times did i buy food this month', CTX_TX);
  check(
    food.card?.kind === 'txList' &&
      food.card.data.matchCount === 2 &&
      food.card.data.total === 420 &&
      /\b2 Food purchases\b/.test(food.text),
    '[count]  how many times … food → 2 purchases, ₱420',
    `text "${food.text}"`
  );
  // Merchant-text path: "how often do i grab" → the single Grab ride.
  const grab = routeMessage('how many times did i grab this month', CTX_TX);
  check(
    grab.card?.kind === 'txList' && grab.card.data.matchCount === 1,
    '[count]  how many times … grab → 1 ride',
    `matchCount ${grab.card?.kind === 'txList' ? grab.card.data.matchCount : '-'}`
  );
  // No subject → asks what to count, never a bogus tally.
  const bare = routeMessage('how many times', CTX_TX);
  check(
    bare.card === undefined && /tally|count/i.test(bare.text),
    '[count]  bare "how many times" → asks for a subject',
    `text "${bare.text}"`
  );
}

// ─── Category-scoped slice broadens a bare master bucket to its siblings ──────
// The user tags granular Groceries / Dining (both map to the food master) but
// has no literal "Food" category, so "how much on food this week" must sum BOTH,
// not silently return ₱0.
{
  const granTx: TxLite[] = [
    {
      id: 'gr1',
      amount: 1000,
      type: 'expense',
      category: 'Groceries',
      merchant: 'Puregold',
      name: 'Puregold',
      date: '2026-06-15',
      accountId: 'a1',
    },
    {
      id: 'gr2',
      amount: 500,
      type: 'expense',
      category: 'Dining',
      merchant: 'Mang Inasal',
      name: 'Mang Inasal',
      date: '2026-06-15',
      accountId: 'a1',
    },
    {
      id: 'gr3',
      amount: 200,
      type: 'expense',
      category: 'Transport',
      merchant: 'Grab',
      name: 'Grab ride',
      date: '2026-06-15',
      accountId: 'a1',
    },
  ];
  const CTX_GRAN: BrainContext = {
    ...CTX,
    now: NOW.toISOString(),
    topCategories: [
      { name: 'Groceries', amount: 1000 },
      { name: 'Dining', amount: 500 },
      { name: 'Transport', amount: 200 },
    ],
    transactions: granTx,
  };
  const food = routeMessage('how much did i spend on food this week', CTX_GRAN);
  check(
    /1,500/.test(food.text),
    '[cat]    "food this week" sums granular Groceries+Dining (master expansion)',
    `text "${food.text}"`
  );
}

// ─── declined meta: abusive / empty input is marked, not logged as a miss ─────
{
  const abusive = routeMessage('fuck you', CTX);
  check(
    abusive.meta?.source === 'declined' && abusive.meta?.intent === null,
    '[meta]   abusive input → declined meta (kept out of the miss corpus)',
    `meta ${JSON.stringify(abusive.meta)}`
  );
  const clean = routeMessage('how much did i spend', CTX);
  check(
    clean.meta?.source !== 'declined',
    '[meta]   a real question is never marked declined',
    `meta ${JSON.stringify(clean.meta)}`
  );
}

// ─── reminder amount hygiene: a date day-number never becomes the amount ──────
{
  const rem = routeMessage(
    'remind me to pay my electric bill on the 3rd 2000',
    CTX_PLAN
  );
  const nav = rem.card?.actions?.find(
    (a) => a.kind === 'navigate' && a.target === 'recurringBills'
  );
  check(
    nav?.kind === 'navigate' && nav.params?.amount === 2000,
    '[hygiene] reminder w/ a date → amount is ₱2,000, not the day-number',
    `nav ${JSON.stringify(nav)}`
  );
}

// ─── B4: train-time confidence calibration shipped in model.json ─────────────
// The classifier's reported confidence must come from the isotonic
// margin→accuracy curve `train-brain.ts` emits, not the old B1 heuristic. Guard
// the curve's invariants (a broken retrain should fail HERE, not in the app)
// and that `routeMessage` actually reads it.
{
  const cal = (modelJson as unknown as NbModel).calibration;
  check(
    cal !== undefined && cal.bins.length >= 2,
    '[B4]     model.json carries a calibration curve (≥ 2 bins)',
    `calibration ${JSON.stringify(cal?.method)} bins ${cal?.bins.length ?? 0}`
  );
  if (cal) {
    const upTos = cal.bins.map((b) => b.upTo);
    const accs = cal.bins.map((b) => b.acc);
    check(
      upTos.every((u, i) => i === 0 || u > upTos[i - 1]) &&
        upTos[upTos.length - 1] === 1,
      '[B4]     bins ascend in raw score and cover the full [0,1] range',
      `upTos ${JSON.stringify(upTos)}`
    );
    check(
      accs.every(
        (a, i) => (i === 0 || a >= accs[i - 1]) && a >= 0.05 && a <= 0.95
      ),
      '[B4]     accuracies are isotonic and inside the [0.05, 0.95] clamp',
      `accs ${JSON.stringify(accs)}`
    );
    // A live classifier-sourced turn reports a bin accuracy, not the heuristic.
    const turn = routeMessage('do i still have money', CTX);
    check(
      turn.meta?.source === 'classifier' && accs.includes(turn.meta.confidence),
      '[B4]     classifier-sourced confidence comes off the calibration curve',
      `meta ${JSON.stringify(turn.meta)}`
    );
  }
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error('\nSome brain tests failed.');
  process.exit(1);
}
console.log('\nAll tests passed.');
