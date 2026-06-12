/**
 * Weighted intent registry — the rules-first half of the brain's hybrid
 * classifier (FINO_INTELLIGENCE_V2.md §4.1).
 *
 * Each intent declares trigger terms (English + Tagalog + Bisaya) with weights.
 * Scoring is a hand-built linear model: `score = Σ weights of matched triggers`,
 * `argmax` wins, and the top-1 − top-2 gap is the confidence `margin`. It's
 * explainable (you can read why an intent won) and extended by adding a row —
 * no retraining. A Naive-Bayes classifier is layered in later (P3) only for the
 * low-margin cases; the rules ship first with zero training data.
 *
 * Matching runs on the CANONICALIZED message, so `<srai>` reductions
 * (canonicalize.ts) already collapsed idioms into canonical keywords like
 * `balance` / `breakdown` / `compare` that the high-weight triggers below pick
 * up directly.
 */

export type IntentId =
  | 'greeting'
  | 'thanks'
  | 'help'
  | 'balance'
  | 'income'
  | 'spend'
  | 'breakdown'
  | 'topCategory'
  | 'compare'
  | 'cut'
  | 'savings'
  | 'count'
  | 'coach'
  | 'overspend'
  | 'transactions'
  | 'categoryOf'
  | 'salaryStatus'
  | 'billStatus'
  | 'summary'
  | 'budgetStatus'
  | 'needsVsWants'
  | 'dowPattern'
  | 'incomeShare'
  | 'trend'
  | 'typicalSpend'
  | 'subscriptionCut'
  | 'emergencyFund'
  | 'goalPlan'
  | 'bonusAdvice'
  | 'improveSavings'
  | 'cutAmount'
  | 'ruleOfThumb'
  | 'impulseTips'
  | 'afford'
  | 'debt'
  | 'safeToSpend'
  | 'reCategorize'
  | 'splitBill'
  | 'runway'
  | 'explainSpend'
  | 'monthPattern'
  | 'upcomingBills'
  | 'setBudget'
  | 'deleteTransaction'
  | 'transfer'
  | 'reminder';

type Trigger = { term: string; weight: number };

type IntentDef = {
  id: IntentId;
  /** One-line capability blurb used by the `help` response. */
  blurb: string;
  triggers: Trigger[];
};

// Convenience builders to keep the table readable.
const t = (term: string, weight = 2): Trigger => ({ term, weight });

const INTENT_DEFS: IntentDef[] = [
  {
    id: 'greeting',
    blurb: '',
    triggers: [
      t('hi', 2),
      t('hello', 2),
      t('hey', 2),
      t('yo', 2),
      t('hiya', 2),
      t('sup', 2),
      t('kumusta', 2),
      t('kamusta', 2),
      t('musta', 2),
      t('good morning', 2),
      t('good afternoon', 2),
      t('good evening', 2),
      t('magandang', 2),
      t('maayong', 2),
    ],
  },
  {
    id: 'thanks',
    blurb: '',
    triggers: [
      t('thanks', 3),
      t('thank', 3),
      t('thank you', 3),
      t('thx', 2),
      t('ty', 2),
      t('salamat', 3),
    ],
  },
  {
    id: 'help',
    blurb: 'ask what I can do',
    triggers: [
      t('help', 3),
      t('what can you do', 4),
      t('features', 2),
      t('commands', 2),
      t('capabilities', 2),
    ],
  },
  {
    id: 'balance',
    blurb: 'check your balance ("how much do I have")',
    triggers: [
      t('balance', 3),
      t('how much do i have', 4),
      t('net worth', 3),
      t('total money', 2),
      t('broke', 3),
      t('rich', 3),
      t('laman ng wallet', 3),
    ],
  },
  {
    id: 'income',
    blurb: 'see your income this month',
    triggers: [
      t('income', 3),
      t('earn', 2),
      t('earned', 2),
      t('earnings', 2),
      t('kita', 2),
      t('kumita', 2),
      t('sweldo', 2),
      t('suweldo', 2),
      t('salary', 2),
      t('sahod', 2),
      t('how much did i make', 3),
    ],
  },
  {
    id: 'spend',
    blurb: 'see what you spent (this or last month)',
    triggers: [
      t('spend', 2),
      t('spent', 2),
      t('spending', 2),
      t('expenses', 2),
      t('expense', 2),
      t('gastos', 2),
      t('gasto', 2),
      t('ginastos', 2),
      t('nagastos', 2),
      t('how much did i spend', 3),
    ],
  },
  {
    id: 'breakdown',
    blurb: 'break your spending down by category',
    triggers: [
      t('breakdown', 4),
      t('break down', 4),
      t('by category', 3),
      t('per category', 3),
      t('categories', 2),
      t('where did', 2),
    ],
  },
  {
    id: 'topCategory',
    blurb: 'find your biggest spending category',
    triggers: [
      t('biggest', 2),
      t('top category', 4),
      t('highest', 2),
      t('pinakamalaki', 3),
      t('labing dako', 3),
      t('spend the most', 4),
      t('spend most on', 4),
      t('biggest expense', 3),
      t('most on', 2),
    ],
  },
  {
    id: 'compare',
    blurb: 'compare this month to last month',
    triggers: [t('compare', 4), t('versus', 3), t('vs', 3), t('kumpara', 3)],
  },
  {
    id: 'cut',
    blurb: 'find where you can cut back',
    triggers: [
      t('cut', 4),
      t('cut back', 4),
      t('reduce', 2),
      t('trim', 2),
      t('tipid', 3),
      t('makatipid', 3),
      t('spend less', 3),
      t('save more', 3),
    ],
  },
  {
    id: 'savings',
    blurb: 'forecast your savings / see if you are on track',
    triggers: [
      t('savings', 3),
      t('forecast', 3),
      t('on track', 3),
      t('on pace', 3),
      t('ipon', 2),
      t('naiipon', 2),
      t('naimpon', 2),
      t('goal', 1),
      t('save', 1),
    ],
  },
  {
    id: 'count',
    blurb: 'count how often you bought something',
    triggers: [
      t('how many times', 4),
      t('how often', 3),
      t('how many', 3),
      t('ilang beses', 4),
      t('pila ka beses', 4),
    ],
  },
  {
    id: 'coach',
    blurb: 'give you a money-coach tip on how you are doing',
    triggers: [
      t('advice', 3),
      t('advise', 3),
      t('what should i do', 4),
      t('how am i doing', 4),
      t('any tips', 3),
      t('tips', 2),
      t('recommend', 2),
      t('coach', 2),
      t('payo', 3),
    ],
  },
  {
    id: 'overspend',
    blurb: 'flag if you are overspending in a category',
    triggers: [
      t('overspend', 4),
      t('overspending', 4),
      t('over budget', 3),
      t('spending too much', 4),
      t('too much', 2),
      t('lampas', 3),
      t('sobra', 2),
    ],
  },
  {
    id: 'transactions',
    blurb: 'list, find, or filter your transactions',
    triggers: [
      t('transactions', 2),
      t('transaction', 2),
      t('transaction history', 4),
      t('recent transactions', 4),
      t('last transactions', 3),
      t('list transactions', 4),
      t('show transactions', 4),
      t('recent activity', 3),
      t('purchases', 2),
      t('my purchases', 3),
      t('what i bought', 4),
      t('what did i buy', 4),
      t('things i bought', 4),
      t('charge', 1),
    ],
  },
  {
    id: 'categoryOf',
    blurb: 'tell you which category a purchase fell under',
    // No bare "which/what category" trigger — that collides with topCategory
    // ("which category drains the most"). The strong signal is "fall under" /
    // "categorized", plus the `category did/was my <X>` canonicalize rule.
    triggers: [
      t('fall under', 4),
      t('falls under', 4),
      t('categorized', 3),
      t('categorized as', 4),
      t('category of', 3),
      t('tagged as', 2),
    ],
  },
  {
    id: 'salaryStatus',
    blurb: 'check if your salary has come in yet',
    triggers: [
      t('did my salary', 5),
      t('salary hit', 4),
      t('salary in', 3),
      t('did i get paid', 5),
      t('got paid', 3),
      t('have i been paid', 5),
      t('paid yet', 3),
      t('sweldo na', 4),
      t('sahod na', 4),
    ],
  },
  {
    id: 'billStatus',
    blurb: 'check if a bill or subscription is paid, and list subscriptions',
    triggers: [
      t('did i pay', 5),
      t('have i paid', 5),
      t('already paid', 3),
      t('bill paid', 3),
      t('paid my', 3),
      t('subscriptions', 4),
      t('subscription', 3),
      t('recurring', 2),
    ],
  },
  {
    id: 'summary',
    blurb: 'summarize your money for a week, month, quarter, or year',
    triggers: [
      t('spending summary', 5), // canonicalize anchor
      t('summary', 3),
      t('summarize', 4),
      t('summarise', 4),
      t('recap', 3),
      t('overview', 3),
      t('digest', 3),
      t('cash flow', 3),
      t('cashflow', 3),
      t('how did i do', 4),
      t('income vs expense', 4),
      t('fixed vs variable', 5),
    ],
  },
  {
    id: 'budgetStatus',
    blurb: 'check how you are tracking against your budgets',
    triggers: [
      t('budget status', 5), // canonicalize anchor (never fires on "over budget")
      t('budget', 2),
      t('budget health', 5),
      t('within budget', 4),
      t('under budget', 3),
      t('stay under', 3),
      t('budget left', 4),
      t('on track to stay', 4),
    ],
  },
  {
    id: 'needsVsWants',
    blurb: 'split your spending into needs vs wants',
    triggers: [
      // Anchor weight clears `compare` even when the phrase reads "needs VERSUS
      // wants" (which also trips the compare canon). The anchor only fires on the
      // needs/(vs|and|or)/wants pattern, so a high weight is safe here.
      t('needs wants', 9), // canonicalize anchor
      t('needs vs wants', 5),
      t('needs versus wants', 5),
      t('necessities', 4),
      t('need or want', 4),
    ],
  },
  {
    id: 'dowPattern',
    blurb: 'find which day of the week you spend the most',
    triggers: [
      t('day of week', 5), // canonicalize anchor
      t('day of the week', 5),
      t('what day', 3),
      t('which day', 3),
      t('busiest day', 4),
    ],
  },
  {
    id: 'incomeShare',
    blurb: 'see what percent of your income a category takes',
    triggers: [
      t('income share', 5), // canonicalize anchor
      t('percentage of my income', 5),
      t('percent of my income', 5),
      t('of my income', 3),
      t('income goes', 4),
    ],
  },
  {
    id: 'trend',
    blurb: 'see if a category is trending up or down',
    triggers: [
      t('spending trend', 5), // canonicalize anchor
      t('trending', 4),
      t('trending up', 4),
      t('trending down', 4),
      t('trend', 3),
      t('going up', 2),
      t('over time', 2),
    ],
  },
  {
    id: 'typicalSpend',
    blurb: 'see what you typically spend on something per month',
    triggers: [
      t('typical spend', 5), // canonicalize anchor
      t('typically spend', 4),
      t('typically', 3),
      t('usually spend', 4),
      t('on average', 3),
      t('how much do i normally', 4),
    ],
  },
  {
    id: 'subscriptionCut',
    blurb: 'help you cut recurring subscription costs',
    triggers: [
      t('cut subscriptions', 6), // canonicalize anchor
      t('cancel subscription', 5),
      t('cancel subscriptions', 5),
      t('subscription costs', 4),
      t('canceling', 2),
      t('cancelling', 2),
    ],
  },
  {
    id: 'emergencyFund',
    blurb: 'plan an emergency fund',
    triggers: [
      t('emergency fund', 6),
      t('emergency savings', 5),
      t('rainy day fund', 5),
      t('rainy day', 3),
    ],
  },
  {
    id: 'goalPlan',
    blurb: 'plan how to save for something you want',
    triggers: [
      t('goal plan', 6), // canonicalize anchor
      t('save for', 4),
      t('saving for', 4),
      t('save up for', 5),
      t('put away for', 4),
      // Tie-breaker: "my goal is to save 50k" also fires the cutAmount canon
      // ("save … 50k"); the literal word keeps goalPlan ahead.
      t('goal', 2),
    ],
  },
  {
    id: 'bonusAdvice',
    blurb: 'suggest what to do with a bonus or windfall',
    triggers: [
      t('bonus advice', 6), // canonicalize anchor
      t('bonus', 5),
      t('13th month', 5),
      t('windfall', 5),
    ],
  },
  {
    id: 'improveSavings',
    blurb: 'help you improve your savings rate',
    triggers: [
      t('improve savings', 6), // canonicalize anchor
      t('boost savings', 5),
      t('better savings rate', 5),
      t('save a bigger', 4),
    ],
  },
  {
    id: 'cutAmount',
    blurb: 'find a specific amount to cut from your budget',
    triggers: [
      t('cut amount', 6), // canonicalize anchor
      t('free up', 3),
    ],
  },
  {
    id: 'ruleOfThumb',
    blurb: 'share a budgeting rule of thumb (50/30/20)',
    triggers: [
      t('rule of thumb', 6), // canonicalize anchor
      t('50 30 20', 5),
      t('how should i budget', 4),
      t('budget my salary', 4),
      t('budget my income', 4),
    ],
  },
  {
    id: 'impulseTips',
    blurb: 'give tips to avoid impulse buying',
    triggers: [
      t('impulse tips', 6), // canonicalize anchor
      t('impulse', 6),
      t('impulse buying', 6),
      t('impulse buy', 6),
    ],
  },
  {
    id: 'afford',
    blurb: 'check if you can afford a purchase',
    triggers: [
      t('can i afford', 5),
      t('can i buy', 4),
      t('can i spend', 3),
      t('able to afford', 4),
      t('afford', 3),
    ],
  },
  {
    id: 'debt',
    blurb: 'see who owes you money (utang owed to you)',
    triggers: [
      t('how much do i owe', 5),
      t('who owes me', 5),
      t('who do i owe', 4),
      t('owes me', 4),
      t('owe me', 4),
      t('owed to me', 4),
      t('owed me', 4),
      t('my debts', 4),
      t('debts', 3),
      t('debt', 2),
      t('utang', 4),
      t('owe', 2),
      t('paid me back', 4),
      // Statement forms ("Paul borrowed 5k", "lent Paul 500") — gated out of
      // the logger by route.ts, answered as a track-it proposal.
      t('borrowed', 4),
      t('lent', 4),
      t('loaned', 4),
    ],
  },
  {
    id: 'safeToSpend',
    blurb: 'tell you how much is safe to spend for the rest of the month',
    triggers: [
      t('safe to spend', 6), // canonicalize anchor
      t('safely spend', 5),
      t('spend safely', 5),
      t('how much can i safely spend', 6),
      t('left to spend', 5),
      t('available to spend', 5),
      t('how much can i spend', 4),
      t('how much can i still spend', 5),
    ],
  },
  {
    id: 'reCategorize',
    blurb: 'recategorize a transaction (e.g. "move my Grab ride to Transport")',
    // The destination ("as|to <category>") is the discriminator vs `categoryOf`
    // (a question). Unambiguous re-tag verbs trigger directly; the softer
    // move/change/mark/put phrasings come in via the `recategorize` canon anchor.
    triggers: [
      t('recategorize', 6), // also the canonicalize anchor token
      t('re-categorize', 6),
      t('recategorise', 6),
      t('reclassify', 6),
      t('retag', 5),
      t('re-tag', 5),
      t('recategorize as', 6),
    ],
  },
  {
    id: 'splitBill',
    blurb: 'split a bill with other people',
    triggers: [
      t('split bill', 6), // canonicalize anchor
      t('split the bill', 6),
      t('split this bill', 6),
      t('split my bill', 5),
      t('split the check', 5),
      t('split the tab', 5),
      t('divide the bill', 5),
      t('go dutch', 4),
      t('split it with', 4),
    ],
  },
  {
    id: 'runway',
    blurb: 'estimate how long your money will last (burn rate)',
    triggers: [
      t('runway', 6), // canonicalize anchor
      t('burn rate', 6),
      t('money last', 4),
      t('how long will my money', 5),
    ],
  },
  {
    id: 'explainSpend',
    blurb: 'explain why your spending is high and what changed',
    triggers: [
      t('explain spending', 6), // canonicalize anchor
      t('what changed', 4),
    ],
  },
  {
    id: 'monthPattern',
    blurb: 'find your cheapest or most expensive month',
    triggers: [
      t('month pattern', 6), // canonicalize anchor
      t('cheapest month', 5),
      t('most expensive month', 5),
      t('month over month', 4),
    ],
  },
  {
    id: 'upcomingBills',
    blurb: 'see which bills are coming up and when the next is due',
    triggers: [
      t('upcoming bills', 6), // canonicalize anchor
      t('next bill', 5),
      t('bills due', 4),
      t('due soon', 4),
    ],
  },
  {
    id: 'setBudget',
    blurb: 'set a category budget ("set a budget of 5000 for food")',
    triggers: [
      t('set budget', 6), // canonicalize anchor
      t('new budget', 4),
    ],
  },
  {
    id: 'deleteTransaction',
    blurb: 'delete a transaction ("delete my last transaction")',
    triggers: [
      t('delete transaction', 6), // canonicalize anchor
      t('delete', 2),
    ],
  },
  {
    id: 'transfer',
    blurb: 'move money between your accounts',
    triggers: [
      t('transfer funds', 7), // canonicalize anchor — outweighs `recategorize`
      t('transfer', 3),
    ],
  },
  {
    id: 'reminder',
    blurb: 'set a bill reminder ("remind me to pay my electric bill")',
    triggers: [
      t('set reminder', 6), // canonicalize anchor
      t('reminder', 4),
      t('remind', 4),
    ],
  },
];

/** Capability blurbs for the `help` response (skips no-blurb chit-chat intents). */
export const CAPABILITY_BLURBS: string[] = INTENT_DEFS.filter(
  (d) => d.blurb
).map((d) => d.blurb);

// Precompile each trigger into a word-boundary regex once at module load.
const escapeRe = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CompiledIntent = {
  id: IntentId;
  matchers: { re: RegExp; weight: number }[];
};

const COMPILED: CompiledIntent[] = INTENT_DEFS.map((def) => ({
  id: def.id,
  matchers: def.triggers.map((tr) => ({
    // (^|non-word) term (non-word|$) — keeps "vs" out of "vsync", "hi" out of "this".
    re: new RegExp(`(?:^|[^a-z0-9])${escapeRe(tr.term)}(?:[^a-z0-9]|$)`, 'i'),
    weight: tr.weight,
  })),
}));

export type IntentScore = { id: IntentId; score: number };

/**
 * Score every intent against the canonicalized message. Returns the full list
 * sorted high → low; `[0]` is the winner and `[0].score - [1].score` is the
 * confidence margin the brain uses to decide whether to clarify.
 */
export function scoreIntents(canonical: string): IntentScore[] {
  const scores: IntentScore[] = COMPILED.map(({ id, matchers }) => {
    let score = 0;
    for (const m of matchers) {
      if (m.re.test(canonical)) score += m.weight;
    }
    return { id, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores;
}
