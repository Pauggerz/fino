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
  | 'count';

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
