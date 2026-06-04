/**
 * `<srai>`-style symbolic reduction (FINO_INTELLIGENCE_V2.md §2).
 *
 * Collapses the many ways a user can phrase the same idea down to a canonical
 * keyword that the weighted intent registry triggers on. This is what lets
 * "where'd my money go", "san napunta pera ko", and "asa nagkadto akong kwarta"
 * all light up the same `breakdown` intent without each phrasing needing its
 * own trigger row.
 *
 * IMPORTANT: canonicalization output feeds INTENT SCORING ONLY. Slot extraction
 * reads the original normalized message, so these rewrites never erase a
 * category / time / account the user mentioned.
 *
 * Each rule appends (does not replace) a canonical token, so multiple signals
 * in one sentence ("how much do I have and where did it go") survive.
 */

type Rule = { re: RegExp; canon: string };

const RULES: Rule[] = [
  // ── balance ──────────────────────────────────────────────────────────────
  {
    re: /\bhow much (money )?(do i have|i have|is left|do i got)\b/,
    canon: 'balance',
  },
  {
    re: /\b(money|cash|funds|pera|kwarta|kuwarta) (left|remaining|natitira|natira|nabilin)\b/,
    canon: 'balance',
  },
  {
    re: /\bmagkano (ang )?(pera|kwarta|kuwarta|natitira|natira|balanse|laman)\b/,
    canon: 'balance',
  },
  {
    re: /\b(pila|tagpila) (akong|ang|ako) (kwarta|pera|nabilin)\b/,
    canon: 'balance',
  },
  { re: /\bnet worth\b/, canon: 'balance' },

  // ── breakdown ────────────────────────────────────────────────────────────
  {
    re: /\bwhere(?:'?d| did| does| do)?\s+(my |the |it |all )?(money|cash|pera|kwarta)?\s*(go|going|went)\b/,
    canon: 'breakdown',
  },
  {
    re: /\b(san|saan|asa) (na)?(punta|pumunta|napunta|nagkadto|gikadto) .*(pera|kwarta|kuwarta)\b/,
    canon: 'breakdown',
  },
  { re: /\bbreak(it)? ?down\b/, canon: 'breakdown' },
  {
    re: /\bwhat('?s| is| am i)? .*(spending|spent) (it )?on\b/,
    canon: 'breakdown',
  },

  // ── spend ────────────────────────────────────────────────────────────────
  // "how much on coffee" / "how much did I spend on food" / "magkano sa pagkain"
  // — implies a spend question even with no explicit spend verb.
  { re: /\bhow much (did i (spend|pay) )?(on|for) \w/, canon: 'spend' },
  { re: /\bmagkano (sa|para sa) \w/, canon: 'spend' },

  // ── compare ──────────────────────────────────────────────────────────────
  { re: /\b(compared?|compare|versus|kumpara|vs)\b/, canon: 'compare' },
  {
    re: /\b(more|less|higher|lower|mas (mataas|mababa|marami|konti)) (than|kaysa|sa)\b/,
    canon: 'compare',
  },

  // ── cut ──────────────────────────────────────────────────────────────────
  {
    re: /\b(where|how|saan|paano|asa|unsa).*(cut|save|reduce|trim|tipid|makatipid|bawas)\b/,
    canon: 'cut',
  },
  { re: /\bspend less\b/, canon: 'cut' },

  // ── savings / forecast ───────────────────────────────────────────────────
  { re: /\b(on track|on pace|am i (saving|on))\b/, canon: 'savings' },
  {
    re: /\b(savings? rate|how much .*(saving|naiipon|naimpon|matitipid))\b/,
    canon: 'savings',
  },
  { re: /\bforecast|project(ion|ed)?\b/, canon: 'savings' },

  // ── help / capabilities ──────────────────────────────────────────────────
  {
    re: /\bwhat can you (do|help)|what do you do|how (can|do) you help\b/,
    canon: 'help',
  },
  { re: /\b(ano|unsa) (ang )?(kaya|magagawa|mahimo) mo\b/, canon: 'help' },
  { re: /\b(commands?|features?|capabilities)\b/, canon: 'help' },

  // ── thanks ───────────────────────────────────────────────────────────────
  {
    re: /\b(thanks?|thank you|thank u|ty|salamat|daghang salamat)\b/,
    canon: 'thanks',
  },
];

/**
 * Returns the normalized text with canonical keyword tokens appended for every
 * idiom rule that fired. The original words are preserved so direct keyword
 * triggers still work alongside the reductions.
 */
export function canonicalize(normalized: string): string {
  const hits: string[] = [];
  for (const { re, canon } of RULES) {
    if (re.test(normalized) && !hits.includes(canon)) hits.push(canon);
  }
  return hits.length ? `${normalized} ${hits.join(' ')}` : normalized;
}
