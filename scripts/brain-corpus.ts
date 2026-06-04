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
  { text: 'is there money in my account', label: 'balance' },
  { text: "what's my total balance", label: 'balance' },
  { text: 'how much is in my wallet', label: 'balance' },
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

  // ── unknown (out-of-scope rejection) ─────────────────────────────────────────
  { text: "what's the weather today", label: 'unknown' },
  { text: 'what is the weather', label: 'unknown' },
  { text: 'will it rain tomorrow', label: 'unknown' },
  { text: 'tell me a joke', label: 'unknown' },
  { text: 'say something funny', label: 'unknown' },
  { text: 'sing me a song', label: 'unknown' },
  { text: 'what time is it', label: 'unknown' },
  { text: 'what day is it', label: 'unknown' },
  { text: 'who won the game last night', label: 'unknown' },
  { text: "what's the latest news", label: 'unknown' },
  { text: 'translate this for me', label: 'unknown' },
  { text: 'set an alarm', label: 'unknown' },
  { text: "what's your favorite color", label: 'unknown' },
  { text: 'are you a robot', label: 'unknown' },
  { text: 'i love you', label: 'unknown' },
  { text: 'play some music', label: 'unknown' },
  { text: 'how old are you', label: 'unknown' },
  { text: 'lorem ipsum dolor sit amet', label: 'unknown' },
];
