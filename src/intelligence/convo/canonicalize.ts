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

  // ── transactions (list / find / filter) ──────────────────────────────────
  // Append "transaction history" — the strong `transactions` trigger.
  {
    re: /\b(transaction history|recent (transactions?|purchases?|activity)|list (my )?(transactions?|purchases?|expenses?)|show (me )?(my )?(transactions?|purchases?))\b/,
    canon: 'transaction history',
  },
  {
    re: /\bwhat (did|have) i (buy|bought|purchase[ds]?)\b/,
    canon: 'transaction history',
  },
  // A SINGLE biggest transaction (not the biggest category — that stays
  // `topCategory`). Qualified by "single" or a day/time scope.
  {
    re: /\b(highest|biggest|largest|most expensive)\s+single\b/,
    canon: 'transaction history',
  },
  {
    re: /\b(highest|biggest|largest|most expensive)\b[^.]*\b(expense|purchase|transaction|charge|buy)\b[^.]*\b(yesterday|today|kahapon|this week|last week|weekend|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/,
    canon: 'transaction history',
  },
  { re: /\bwhat (was|is) the\b.*\bcharge\b/, canon: 'transaction history' },

  // ── categoryOf ────────────────────────────────────────────────────────────
  { re: /\bcategory (did|was|does|for|of) (my|the|a)\b/, canon: 'fall under' },
  { re: /\bfalls? under\b/, canon: 'fall under' },

  // ── salaryStatus ──────────────────────────────────────────────────────────
  {
    re: /\b(did|has|have|is)\b.*\b(salary|sweldo|sahod|payroll|paycheck)\b.*\b(hit|come|came|arrive|arrived|land|landed|in|yet|reflect|deposited)\b/,
    canon: 'salary hit',
  },
  { re: /\b(sweldo|sahod) na\b/, canon: 'sahod na' },
  { re: /\bdid i get paid\b/, canon: 'did i get paid' },

  // ── billStatus ────────────────────────────────────────────────────────────
  { re: /\bdid i (already )?pay\b/, canon: 'did i pay' },
  { re: /\bhave i (already )?paid\b/, canon: 'have i paid' },
  {
    re: /\b(subscriptions?|recurring (bills?|payments?|charges?|expenses?|subscriptions?))\b/,
    canon: 'subscriptions',
  },

  // ── overspend (unusual spikes / anomalies) ───────────────────────────────
  {
    re: /\b(unusual|spikes?|anomaly|anomalies|anomalous|out of the ordinary)\b/,
    canon: 'overspending',
  },

  // ── summary (Category 3) ──────────────────────────────────────────────────
  {
    re: /\b(summari[sz]e|summary|recap|overview|digest|cash ?flow|how did i do|income (vs|versus) (total )?expenses?|fixed (vs|versus) variable)\b/,
    canon: 'spending summary',
  },

  // ── budgetStatus ──────────────────────────────────────────────────────────
  // Budget-HEALTH phrasings only. Deliberately NOT "over budget" — that stays
  // an overspend signal — so the anchor never fires on "am I over budget".
  { re: /\bbudget (health|status|left)\b/, canon: 'budget status' },
  {
    re: /\b(under|within|stay under|left in|how('?s| is)) [^.]*\bbudget\b/,
    canon: 'budget status',
  },
  { re: /\bon track to stay under\b/, canon: 'budget status' },

  // ── needsVsWants ──────────────────────────────────────────────────────────
  {
    re: /\bneeds?\b.{0,10}\b(vs|versus|and|or)\b.{0,10}\bwants?\b/,
    canon: 'needs wants',
  },
  { re: /\bneeds? (versus|vs|and|or) wants?\b/, canon: 'needs wants' },

  // ── dowPattern ────────────────────────────────────────────────────────────
  { re: /\bday of (the )?week\b/, canon: 'day of week' },
  {
    re: /\b(what|which|on what) day\b[^.]*\b(spend|spent|gastos)\b/,
    canon: 'day of week',
  },

  // ── incomeShare ───────────────────────────────────────────────────────────
  {
    re: /\b(what )?(percentage|percent|how much|what part|what portion|share) of (my )?(income|salary|sahod|sweldo|kita)\b/,
    canon: 'income share',
  },
  {
    re: /\b(income|salary) goes (to|toward|towards|on)\b/,
    canon: 'income share',
  },

  // ── trend ─────────────────────────────────────────────────────────────────
  { re: /\btrending (up|down)?\b/, canon: 'spending trend' },
  {
    re: /\b(going|trending|moving) (up|down)\b[^.]*\b(over time|each month|lately)\b/,
    canon: 'spending trend',
  },

  // ── typicalSpend ──────────────────────────────────────────────────────────
  {
    re: /\b(typically|usually|normally|on average) (spend|spent|pay|gastos)\b/,
    canon: 'typical spend',
  },
  {
    re: /\bhow much do i (typically|usually|normally) (spend|pay)\b/,
    canon: 'typical spend',
  },

  // ── Category 4: advice & coaching ─────────────────────────────────────────
  // subscriptionCut — a cancel/cut verb near "subscription"/"recurring" (either
  // order), so plain "review my subscriptions" stays a billStatus listing.
  {
    re: /\b(cut|cancel|cancell?ing|reduce|lower|drop|stop|get rid of|trim).{0,24}\b(subscriptions?|recurring (?:bills?|charges?|expenses?|payments?|subscriptions?))\b/,
    canon: 'cut subscriptions',
  },
  {
    re: /\b(subscriptions?|recurring (?:bills?|charges?|expenses?|payments?)).{0,24}\b(cancel|cancell?ing|cut|reduce|drop|stop|get rid of)\b/,
    canon: 'cut subscriptions',
  },
  // goalPlan — "save (up) for <thing>".
  { re: /\bsav(?:e|ing)(?: up)? for\b/, canon: 'goal plan' },
  { re: /\bput away for\b/, canon: 'goal plan' },
  // bonusAdvice.
  {
    re: /\b(bonus|13th month|windfall|year[- ]end (?:pay|money))\b/,
    canon: 'bonus advice',
  },
  // improveSavings.
  {
    re: /\b(improve|boost|increase|raise|better|grow|higher) [^.]{0,16}\bsavings?\b/,
    canon: 'improve savings',
  },
  // cutAmount — a cut/free-up verb followed by a peso figure.
  {
    re: /\b(cut|trim|save|reduce|free up|slash|shave)\b[^.]{0,16}\b\d[\d,]*\b/,
    canon: 'cut amount',
  },
  // ruleOfThumb.
  { re: /\brule of thumb\b/, canon: 'rule of thumb' },
  { re: /\b50[ /-]?30[ /-]?20\b/, canon: 'rule of thumb' },
  // impulseTips.
  { re: /\bimpulse\b/, canon: 'impulse tips' },

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
