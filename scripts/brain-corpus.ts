/**
 * Training corpus for the Convo Naive-Bayes fallback (FINO_INTELLIGENCE_V2.md
 * §4.1, §10 decision: "author a dedicated corpus now").
 *
 * This is the TRAIN set — deliberately kept separate from the eval fixtures in
 * `scripts/test-brain.ts` so reported accuracy has no train/test leakage. Each
 * line is a labelled utterance (English / Tagalog / Bisaya). The rules layer
 * already covers the obvious phrasings; this corpus targets the PARAPHRASES the
 * rules miss, which is where the classifier earns its keep.
 *
 * The `unknown` class is a synthetic out-of-scope set so the model can REJECT
 * non-finance chatter instead of forcing an intent label onto it.
 *
 * Consumed by `scripts/train-brain.ts` → emits
 * `src/intelligence/convo/classifier/model.json`. Re-run `npm run train:brain`
 * after editing this file.
 */

import type { NbLabel } from '../src/intelligence/convo/classifier/naiveBayes';

export type CorpusRow = { text: string; label: NbLabel };

export const CORPUS: CorpusRow[] = [
  // ── greeting ───────────────────────────────────────────────────────────────
  { text: 'hi there', label: 'greeting' },
  { text: 'hello fino', label: 'greeting' },
  { text: 'hey', label: 'greeting' },
  { text: 'good morning', label: 'greeting' },
  { text: 'good evening', label: 'greeting' },
  { text: 'yo whats up', label: 'greeting' },
  { text: 'kumusta ka', label: 'greeting' },
  { text: 'kamusta', label: 'greeting' },
  { text: 'musta na', label: 'greeting' },
  { text: 'magandang araw', label: 'greeting' },
  { text: 'magandang umaga', label: 'greeting' },
  { text: 'maayong buntag', label: 'greeting' },
  { text: 'maayong hapon', label: 'greeting' },
  { text: 'uy hello', label: 'greeting' },

  // ── thanks ─────────────────────────────────────────────────────────────────
  { text: 'thank you', label: 'thanks' },
  { text: 'thanks a lot', label: 'thanks' },
  { text: 'thanks fino', label: 'thanks' },
  { text: 'thank you so much', label: 'thanks' },
  { text: 'appreciate it', label: 'thanks' },
  { text: 'much appreciated', label: 'thanks' },
  { text: 'salamat', label: 'thanks' },
  { text: 'salamat po', label: 'thanks' },
  { text: 'maraming salamat', label: 'thanks' },
  { text: 'daghang salamat', label: 'thanks' },
  { text: 'salamat kaayo', label: 'thanks' },
  { text: 'thank u', label: 'thanks' },

  // ── help ───────────────────────────────────────────────────────────────────
  { text: 'what can you do', label: 'help' },
  { text: 'what can you help me with', label: 'help' },
  { text: 'how can you help', label: 'help' },
  { text: 'what are you capable of', label: 'help' },
  { text: 'show me what you can do', label: 'help' },
  { text: 'what features do you have', label: 'help' },
  { text: 'what commands can i use', label: 'help' },
  { text: 'how do i use you', label: 'help' },
  { text: 'ano ang kaya mong gawin', label: 'help' },
  { text: 'ano ang magagawa mo', label: 'help' },
  { text: 'paano kita gamitin', label: 'help' },
  { text: 'unsa imong mahimo', label: 'help' },
  { text: 'tabang', label: 'help' },
  { text: 'help me', label: 'help' },

  // ── balance ────────────────────────────────────────────────────────────────
  { text: 'what is my balance', label: 'balance' },
  { text: 'how much money do i have', label: 'balance' },
  { text: 'how much do i have right now', label: 'balance' },
  { text: 'how much money is left', label: 'balance' },
  { text: 'do i have money left', label: 'balance' },
  { text: 'do i still have cash', label: 'balance' },
  { text: 'is there money in my account', label: 'balance' },
  { text: "what's my total balance", label: 'balance' },
  { text: 'how much is in my wallet', label: 'balance' },
  { text: 'am i broke', label: 'balance' },
  { text: 'am i rich', label: 'balance' },
  { text: 'how rich am i', label: 'balance' },
  { text: 'do i have enough money', label: 'balance' },
  { text: 'magkano pera ko', label: 'balance' },
  { text: 'magkano natitira sa akin', label: 'balance' },
  { text: 'magkano laman ng wallet ko', label: 'balance' },
  { text: 'may pera pa ba ako', label: 'balance' },
  { text: 'pila akong kwarta', label: 'balance' },
  { text: 'pila pa akong pera', label: 'balance' },
  { text: 'tagpila akong kwarta', label: 'balance' },

  // ── income ─────────────────────────────────────────────────────────────────
  { text: 'how much did i earn', label: 'income' },
  { text: 'how much did i earn this month', label: 'income' },
  { text: 'what is my income', label: 'income' },
  { text: 'how much money did i make', label: 'income' },
  { text: 'did i get paid', label: 'income' },
  { text: 'did i get paid this month', label: 'income' },
  { text: 'have i been paid yet', label: 'income' },
  { text: 'did my salary come in', label: 'income' },
  { text: 'did i receive my salary this month', label: 'income' },
  { text: 'how much have i earned so far', label: 'income' },
  { text: 'magkano kita ko', label: 'income' },
  { text: 'magkano sweldo ko', label: 'income' },
  { text: 'magkano sahod ko this month', label: 'income' },
  { text: 'pumasok na ba sweldo ko', label: 'income' },
  { text: 'nakatanggap na ba ako ng sweldo', label: 'income' },
  { text: 'pila akong kita', label: 'income' },

  // ── spend ──────────────────────────────────────────────────────────────────
  { text: 'how much did i spend', label: 'spend' },
  { text: 'how much have i spent', label: 'spend' },
  { text: 'how much did i spend this month', label: 'spend' },
  { text: 'what did i spend', label: 'spend' },
  { text: 'how much money did i spend', label: 'spend' },
  { text: 'how much have i spent so far', label: 'spend' },
  { text: 'total expenses this month', label: 'spend' },
  { text: 'what are my expenses', label: 'spend' },
  { text: 'magkano nagastos ko', label: 'spend' },
  { text: 'magkano ang gastos ko', label: 'spend' },
  { text: 'magkano na ang nagastos ko this month', label: 'spend' },
  { text: 'pila akong nagasto', label: 'spend' },
  { text: 'pila akong gasto karon', label: 'spend' },
  { text: 'how much did i spend last month', label: 'spend' },
  { text: 'how much on food', label: 'spend' },
  { text: 'how much did i spend on transport', label: 'spend' },

  // ── breakdown ──────────────────────────────────────────────────────────────
  { text: 'give me a spending breakdown', label: 'breakdown' },
  { text: 'break down my spending', label: 'breakdown' },
  { text: 'where did my money go', label: 'breakdown' },
  { text: 'where is my money going', label: 'breakdown' },
  { text: 'where did it all go', label: 'breakdown' },
  { text: 'what am i spending on', label: 'breakdown' },
  { text: 'what did i spend it on', label: 'breakdown' },
  { text: 'break it down by category', label: 'breakdown' },
  { text: 'show my spending by category', label: 'breakdown' },
  { text: 'san napunta pera ko', label: 'breakdown' },
  { text: 'saan napunta ang pera ko', label: 'breakdown' },
  { text: 'saan ko ginastos ang pera ko', label: 'breakdown' },
  { text: 'asa nagkadto akong kwarta', label: 'breakdown' },
  { text: 'breakdown ng gastos ko', label: 'breakdown' },
  { text: 'saan napupunta ang gastos ko', label: 'breakdown' },

  // ── topCategory ────────────────────────────────────────────────────────────
  { text: 'what is my biggest expense', label: 'topCategory' },
  { text: "what's my biggest spending category", label: 'topCategory' },
  { text: 'where do i spend the most', label: 'topCategory' },
  { text: 'what do i spend the most on', label: 'topCategory' },
  { text: 'what do i waste the most money on', label: 'topCategory' },
  { text: 'what eats up most of my money', label: 'topCategory' },
  { text: 'which category costs me the most', label: 'topCategory' },
  { text: 'my top spending category', label: 'topCategory' },
  { text: 'what is my largest expense', label: 'topCategory' },
  { text: 'saan ako pinakamalaki gumastos', label: 'topCategory' },
  { text: 'ano ang pinakamalaking gastos ko', label: 'topCategory' },
  { text: 'anong pinakamalaking gastusin ko', label: 'topCategory' },
  { text: 'asa ko labing magasto', label: 'topCategory' },
  { text: 'unsa akong labing dako nga gasto', label: 'topCategory' },
  { text: 'alin ang pinakamalaki kong ginagastusan', label: 'topCategory' },

  // ── compare ────────────────────────────────────────────────────────────────
  { text: 'compare this month to last month', label: 'compare' },
  { text: 'compare to last month', label: 'compare' },
  { text: 'how does this month compare', label: 'compare' },
  { text: 'am i spending more than last month', label: 'compare' },
  { text: 'is this month worse than last month', label: 'compare' },
  { text: 'this month versus last month', label: 'compare' },
  { text: 'did i spend more or less than last month', label: 'compare' },
  { text: 'kumpara sa nakaraang buwan', label: 'compare' },
  {
    text: 'mas malaki ba gastos ko ngayon kaysa noong nakaraan',
    label: 'compare',
  },
  { text: 'mas mataas ba ngayon kaysa last month', label: 'compare' },
  { text: 'compare ko this month sa last month', label: 'compare' },
  { text: 'how do my months compare', label: 'compare' },
  { text: 'is my spending up or down from last month', label: 'compare' },

  // ── cut ────────────────────────────────────────────────────────────────────
  { text: 'where can i cut back', label: 'cut' },
  { text: 'how can i save money', label: 'cut' },
  { text: 'where can i save money', label: 'cut' },
  { text: 'how do i spend less', label: 'cut' },
  { text: 'help me cut expenses', label: 'cut' },
  { text: 'where should i reduce spending', label: 'cut' },
  { text: 'how can i trim my budget', label: 'cut' },
  { text: 'saan ako pwedeng magtipid', label: 'cut' },
  { text: 'paano ako makakatipid', label: 'cut' },
  { text: 'paano ko mababawasan ang gastos ko', label: 'cut' },
  { text: 'saan ko pwede bawasan gastos', label: 'cut' },
  { text: 'asa ko makatipid', label: 'cut' },
  { text: 'unsaon nako pagtipid', label: 'cut' },
  { text: 'tips para makatipid', label: 'cut' },

  // ── savings ────────────────────────────────────────────────────────────────
  { text: 'am i on track to save', label: 'savings' },
  { text: 'am i saving enough', label: 'savings' },
  { text: 'how much am i saving', label: 'savings' },
  { text: 'what is my savings rate', label: 'savings' },
  { text: 'show my savings forecast', label: 'savings' },
  { text: 'will i hit my savings goal', label: 'savings' },
  { text: 'am i on pace to save', label: 'savings' },
  {
    text: 'will i have anything left at the end of the month',
    label: 'savings',
  },
  { text: 'how much will i have saved by month end', label: 'savings' },
  { text: 'how much can i save this month', label: 'savings' },
  { text: 'magkano naiipon ko', label: 'savings' },
  { text: 'magkano matitira sa akin pagtapos ng buwan', label: 'savings' },
  { text: 'nakakaipon ba ako', label: 'savings' },
  { text: 'abot ba ako sa savings goal ko', label: 'savings' },
  { text: 'makaipon ba ko this month', label: 'savings' },

  // ── count ──────────────────────────────────────────────────────────────────
  { text: 'how many times did i buy coffee', label: 'count' },
  { text: 'how many times did i eat out', label: 'count' },
  { text: 'how often do i buy coffee', label: 'count' },
  { text: 'how often do i eat out', label: 'count' },
  { text: 'how frequently do i buy coffee', label: 'count' },
  { text: 'how regularly do i eat out', label: 'count' },
  { text: 'how many coffees did i buy', label: 'count' },
  { text: 'how many times did i order food', label: 'count' },
  { text: 'ilang beses ako bumili ng kape', label: 'count' },
  { text: 'ilang beses ako kumain sa labas', label: 'count' },
  { text: 'gaano kadalas ako kumain sa labas', label: 'count' },
  { text: 'gaano kadalas ako bumili ng kape', label: 'count' },
  { text: 'pila ka beses ko mipalit og kape', label: 'count' },
  { text: 'how many times did i shop', label: 'count' },

  // ── transactions (V3 — list / find / filter) ────────────────────────────────
  { text: 'show me my last five transactions', label: 'transactions' },
  { text: 'list my recent transactions', label: 'transactions' },
  { text: 'what are my latest purchases', label: 'transactions' },
  { text: 'pull up my transaction history', label: 'transactions' },
  { text: 'show my recent activity', label: 'transactions' },
  { text: 'what did i buy recently', label: 'transactions' },
  { text: 'display my last ten expenses', label: 'transactions' },
  { text: 'find all transactions over 5000 this year', label: 'transactions' },
  { text: 'what was the 1500 charge on tuesday', label: 'transactions' },
  { text: 'show my biggest single expense yesterday', label: 'transactions' },
  { text: 'ipakita ang huling mga transaksyon ko', label: 'transactions' },
  { text: 'ano ang mga binili ko kamakailan', label: 'transactions' },
  { text: 'unsa akong bag-ong mga transaksyon', label: 'transactions' },

  // ── categoryOf (V3) ──────────────────────────────────────────────────────────
  {
    text: 'which category did my spotify payment fall under',
    label: 'categoryOf',
  },
  { text: 'what category was my netflix charge', label: 'categoryOf' },
  { text: 'where did my grab ride get categorized', label: 'categoryOf' },
  { text: 'what category is my lazada purchase under', label: 'categoryOf' },
  { text: 'which bucket did that payment land in', label: 'categoryOf' },
  { text: 'anong kategorya ng bayad ko sa spotify', label: 'categoryOf' },
  { text: 'asa nga kategorya ang akong netflix', label: 'categoryOf' },

  // ── salaryStatus (V3) ────────────────────────────────────────────────────────
  { text: 'did my salary hit my account yet', label: 'salaryStatus' },
  { text: 'have i been paid this month', label: 'salaryStatus' },
  { text: 'did i get my paycheck', label: 'salaryStatus' },
  { text: 'is my salary in yet', label: 'salaryStatus' },
  { text: 'did payroll come through', label: 'salaryStatus' },
  { text: 'pumasok na ba ang sweldo ko', label: 'salaryStatus' },
  { text: 'sahod na ba ako', label: 'salaryStatus' },
  { text: 'na credit na ba ang suweldo ko', label: 'salaryStatus' },

  // ── billStatus (V3) ──────────────────────────────────────────────────────────
  { text: 'did i pay my internet bill yet', label: 'billStatus' },
  { text: 'have i paid the electricity bill', label: 'billStatus' },
  { text: 'is my rent paid this month', label: 'billStatus' },
  { text: 'show me my subscription payments for march', label: 'billStatus' },
  { text: 'what subscriptions am i paying for', label: 'billStatus' },
  { text: 'did i settle my water bill', label: 'billStatus' },
  { text: 'bayad na ba ako sa kuryente', label: 'billStatus' },
  { text: 'nabayran na ba nako ang internet', label: 'billStatus' },

  // ── summary (V3) ─────────────────────────────────────────────────────────────
  { text: 'give me a summary of my spending this month', label: 'summary' },
  { text: 'summarize my finances for the quarter', label: 'summary' },
  { text: 'recap my spending for q1', label: 'summary' },
  { text: 'how did i do financially last month', label: 'summary' },
  { text: 'what does my cash flow look like this week', label: 'summary' },
  { text: 'give me an overview of income versus expenses', label: 'summary' },
  { text: 'break down my fixed and variable costs', label: 'summary' },
  { text: 'daily digest of my spending today', label: 'summary' },
  { text: 'buod ng gastos ko ngayong buwan', label: 'summary' },

  // ── budgetStatus (V3) ────────────────────────────────────────────────────────
  { text: 'am i on track to stay under my budget', label: 'budgetStatus' },
  { text: 'how am i doing against my budget', label: 'budgetStatus' },
  { text: 'how much budget do i have left', label: 'budgetStatus' },
  { text: 'am i within my shopping budget', label: 'budgetStatus' },
  { text: 'is my food budget okay', label: 'budgetStatus' },
  { text: 'budget health check', label: 'budgetStatus' },
  { text: 'magkano pa natitira sa budget ko', label: 'budgetStatus' },

  // ── needsVsWants (V3) ────────────────────────────────────────────────────────
  { text: 'show me my needs versus wants', label: 'needsVsWants' },
  { text: 'how much goes to needs and wants', label: 'needsVsWants' },
  { text: 'split my spending into needs and wants', label: 'needsVsWants' },
  { text: 'how much of my spending is necessities', label: 'needsVsWants' },
  { text: 'whats my needs to wants ratio', label: 'needsVsWants' },

  // ── dowPattern (V3) ──────────────────────────────────────────────────────────
  { text: 'what day of the week do i spend the most', label: 'dowPattern' },
  { text: 'which day do i usually spend most', label: 'dowPattern' },
  { text: 'when during the week do i spend more', label: 'dowPattern' },
  { text: 'what is my heaviest spending day', label: 'dowPattern' },
  { text: 'anong araw ako pinakamalaki gumastos', label: 'dowPattern' },

  // ── incomeShare (V3) ─────────────────────────────────────────────────────────
  { text: 'what percentage of my income goes to rent', label: 'incomeShare' },
  { text: 'how much of my income goes to food', label: 'incomeShare' },
  { text: 'what share of my salary goes to bills', label: 'incomeShare' },
  { text: 'what portion of my income is rent', label: 'incomeShare' },

  // ── trend (V3) ───────────────────────────────────────────────────────────────
  { text: 'is my transport spending trending up or down', label: 'trend' },
  { text: 'is my food spending going up over time', label: 'trend' },
  { text: 'whats the trend in my spending', label: 'trend' },
  { text: 'is my dining spending increasing lately', label: 'trend' },
  { text: 'pataas ba o pababa ang gastos ko', label: 'trend' },

  // ── typicalSpend (V3) ────────────────────────────────────────────────────────
  { text: 'how much do i typically spend on coffee', label: 'typicalSpend' },
  { text: 'whats my average monthly spend on food', label: 'typicalSpend' },
  { text: 'how much do i usually spend on groceries', label: 'typicalSpend' },
  { text: 'what do i normally spend on transport', label: 'typicalSpend' },

  // ── subscriptionCut (V3 — Category 4) ────────────────────────────────────────
  { text: 'how can i cut down on my subscriptions', label: 'subscriptionCut' },
  { text: 'help me reduce my subscription costs', label: 'subscriptionCut' },
  { text: 'which subscriptions should i cancel', label: 'subscriptionCut' },
  {
    text: 'are there recurring expenses i should cancel',
    label: 'subscriptionCut',
  },

  // ── emergencyFund (V3) ───────────────────────────────────────────────────────
  { text: 'how do i build an emergency fund', label: 'emergencyFund' },
  { text: 'help me start an emergency fund', label: 'emergencyFund' },
  { text: 'how big should my emergency fund be', label: 'emergencyFund' },
  { text: 'advice on a rainy day fund', label: 'emergencyFund' },

  // ── goalPlan (V3) ────────────────────────────────────────────────────────────
  { text: 'i want to save for a new laptop', label: 'goalPlan' },
  { text: 'how do i save up for a vacation', label: 'goalPlan' },
  { text: 'help me save for a phone', label: 'goalPlan' },
  { text: 'i need to save for a car', label: 'goalPlan' },
  { text: 'gusto kong mag ipon para sa laptop', label: 'goalPlan' },

  // ── bonusAdvice (V3) ─────────────────────────────────────────────────────────
  { text: 'what should i do with my bonus', label: 'bonusAdvice' },
  { text: 'how should i spend my year end bonus', label: 'bonusAdvice' },
  { text: 'what to do with my 13th month pay', label: 'bonusAdvice' },
  { text: 'i got a windfall what now', label: 'bonusAdvice' },

  // ── improveSavings (V3) ──────────────────────────────────────────────────────
  { text: 'how can i improve my savings rate', label: 'improveSavings' },
  { text: 'help me boost my savings', label: 'improveSavings' },
  { text: 'how to grow my savings faster', label: 'improveSavings' },
  { text: 'how do i get a better savings rate', label: 'improveSavings' },

  // ── cutAmount (V3) ───────────────────────────────────────────────────────────
  { text: 'where can i cut 2000 from my budget', label: 'cutAmount' },
  { text: 'how do i trim 1000 from my spending', label: 'cutAmount' },
  { text: 'i need to free up 3000 this month', label: 'cutAmount' },
  { text: 'help me cut 5000 pesos this month', label: 'cutAmount' },

  // ── ruleOfThumb (V3) ─────────────────────────────────────────────────────────
  { text: 'whats a good rule of thumb for budgeting', label: 'ruleOfThumb' },
  { text: 'how should i budget my salary', label: 'ruleOfThumb' },
  { text: 'whats the 50 30 20 rule', label: 'ruleOfThumb' },
  { text: 'how should i divide up my income', label: 'ruleOfThumb' },

  // ── impulseTips (V3) ─────────────────────────────────────────────────────────
  { text: 'how do i avoid impulse buying', label: 'impulseTips' },
  { text: 'tips to curb impulse purchases', label: 'impulseTips' },
  { text: 'help me control impulse spending', label: 'impulseTips' },
  { text: 'how to resist buying on impulse', label: 'impulseTips' },

  // ── afford (can I afford / can I buy X) ──────────────────────────────────────
  { text: 'can i afford a new phone', label: 'afford' },
  { text: 'can i afford to buy a laptop', label: 'afford' },
  { text: 'can i buy a new pair of shoes', label: 'afford' },
  { text: 'is it ok to spend on a 5000 gadget', label: 'afford' },
  { text: 'do i have enough to buy a watch', label: 'afford' },
  { text: 'am i able to afford a vacation', label: 'afford' },
  { text: 'can i afford to eat out tonight', label: 'afford' },
  { text: 'should i buy this or is it too expensive for me', label: 'afford' },

  // ── debt (utang owed TO the user — receivables) ──────────────────────────────
  { text: 'how much money am i owed', label: 'debt' },
  { text: 'who else owes me money', label: 'debt' },
  { text: 'list the people who owe me', label: 'debt' },
  { text: 'how much utang is owed to me', label: 'debt' },
  { text: 'who hasnt paid me back yet', label: 'debt' },
  { text: 'show my outstanding debts', label: 'debt' },
  { text: 'how much do people owe me', label: 'debt' },

  // ── safeToSpend (how much is safe to spend) ──────────────────────────────────
  // NB: kept clear of `balance` paraphrases ("do i have money left") — these
  // center on the *spendable* amount this month, not the raw account balance.
  { text: 'how much can i safely spend', label: 'safeToSpend' },
  { text: 'how much is safe to spend', label: 'safeToSpend' },
  { text: 'how much can i spend this month without going over', label: 'safeToSpend' },
  { text: 'whats my safe to spend amount', label: 'safeToSpend' },
  { text: 'how much can i spend per day for the rest of the month', label: 'safeToSpend' },
  { text: 'how much can i still spend this month', label: 'safeToSpend' },
  { text: 'whats my spending allowance for the month', label: 'safeToSpend' },
  { text: 'how much is left in my budget to spend this month', label: 'safeToSpend' },

  // ── reCategorize (move a transaction to another category — a command) ─────────
  { text: 'recategorize the spotify charge as entertainment', label: 'reCategorize' },
  { text: 'move my grab ride to transport', label: 'reCategorize' },
  { text: 'change the netflix payment to entertainment', label: 'reCategorize' },
  { text: 'mark that lazada purchase as shopping', label: 'reCategorize' },
  { text: 'reclassify my last transaction as food', label: 'reCategorize' },
  { text: 'put the grab charge under transport', label: 'reCategorize' },
  { text: 'can you recategorize my coffee as food', label: 'reCategorize' },
  { text: 'switch that payment to bills', label: 'reCategorize' },

  // ── splitBill (split a shared bill with others) ───────────────────────────────
  { text: 'split the bill', label: 'splitBill' },
  { text: 'help me split this bill', label: 'splitBill' },
  { text: 'split the dinner bill between us', label: 'splitBill' },
  { text: 'i want to split a bill with my friends', label: 'splitBill' },
  { text: 'divide the bill among us', label: 'splitBill' },
  { text: 'split the check', label: 'splitBill' },
  { text: 'lets go dutch on this', label: 'splitBill' },

  // ── unknown (out-of-scope rejection) ─────────────────────────────────────────
  { text: "what's the weather today", label: 'unknown' },
  { text: 'what is the weather', label: 'unknown' },
  { text: 'will it rain tomorrow', label: 'unknown' },
  { text: 'is it going to rain later', label: 'unknown' },
  { text: 'is it going to be hot today', label: 'unknown' },
  { text: 'will the weather be nice later', label: 'unknown' },
  { text: 'whats the forecast for later', label: 'unknown' },
  { text: 'tell me a joke', label: 'unknown' },
  { text: 'say something funny', label: 'unknown' },
  { text: 'sing me a song', label: 'unknown' },
  { text: 'what time is it', label: 'unknown' },
  { text: 'what day is it', label: 'unknown' },
  { text: 'who won the game last night', label: 'unknown' },
  { text: 'whats the score', label: 'unknown' },
  { text: 'who is winning the game', label: 'unknown' },
  { text: 'did our team win', label: 'unknown' },
  { text: 'how did the game go', label: 'unknown' },
  { text: "what's the latest news", label: 'unknown' },
  { text: 'translate this for me', label: 'unknown' },
  { text: 'set an alarm', label: 'unknown' },
  { text: "what's your favorite color", label: 'unknown' },
  { text: 'are you a robot', label: 'unknown' },
  { text: 'i love you', label: 'unknown' },
  { text: 'play some music', label: 'unknown' },
  { text: 'how old are you', label: 'unknown' },
  { text: 'lorem ipsum dolor sit amet', label: 'unknown' },
  // profanity / abuse — must reject, never answer as a finance query
  { text: 'suck my dick', label: 'unknown' },
  { text: 'fuck you', label: 'unknown' },
  { text: 'fuck off', label: 'unknown' },
  { text: 'screw you', label: 'unknown' },
  { text: 'you suck', label: 'unknown' },
  { text: 'shut up', label: 'unknown' },
  { text: 'go to hell', label: 'unknown' },
  { text: 'this is bullshit', label: 'unknown' },
  { text: 'stupid bot', label: 'unknown' },
  { text: 'you are dumb', label: 'unknown' },
  { text: 'kiss my ass', label: 'unknown' },
  { text: 'piss off', label: 'unknown' },
  // hostility / frustration directed at the app, not a finance question
  { text: 'i hate this app', label: 'unknown' },
  { text: 'this app is useless', label: 'unknown' },
  { text: 'this app sucks', label: 'unknown' },
  { text: 'worst app ever', label: 'unknown' },
  { text: 'you are useless', label: 'unknown' },
  { text: 'this is stupid', label: 'unknown' },
  { text: 'you never understand me', label: 'unknown' },
  { text: 'this doesnt work', label: 'unknown' },
  { text: 'you are so annoying', label: 'unknown' },
  // identity / relationship chit-chat
  { text: 'who made you', label: 'unknown' },
  { text: 'are you human', label: 'unknown' },
  { text: 'do you have feelings', label: 'unknown' },
  { text: 'will you marry me', label: 'unknown' },
  { text: 'do you love me', label: 'unknown' },
  { text: 'what are you wearing', label: 'unknown' },
  // off-topic tasks unrelated to money
  { text: 'order me a pizza', label: 'unknown' },
  { text: 'book me a flight', label: 'unknown' },
  { text: 'call my mom', label: 'unknown' },
  { text: 'open youtube', label: 'unknown' },
  { text: 'what is the capital of france', label: 'unknown' },
  { text: 'write me an essay', label: 'unknown' },
  // terminators / frustration that must not force an intent
  { text: 'stop', label: 'unknown' },
  { text: 'stop it', label: 'unknown' },
  { text: 'nevermind', label: 'unknown' },
  { text: 'forget it', label: 'unknown' },
  { text: 'you lied', label: 'unknown' },
  { text: 'you lied to me', label: 'unknown' },
  { text: 'this is wrong', label: 'unknown' },
  { text: 'that is not right', label: 'unknown' },
];
