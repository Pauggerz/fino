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
  // "what's in my bank account" / "how much is in my account" — a balance
  // question, NOT a transfer (the corpus over-associates "bank account" with
  // "transfer … to my bank account"). Requires a quantity/possession frame so
  // "transfer 500 to my bank account" (uses "to", not "in") is unaffected.
  {
    re: /\b(?:how much|what'?s|what is|whats|money|left)\b[^.]{0,24}\bin (?:my|the) (?:bank )?account\b/,
    canon: 'balance',
  },

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

  // ── coach (self-assessment: "am i bad with money?") ──────────────────────
  {
    re: /\b(?:am i|are we) (?:so |really |that |pretty )?(?:bad|terrible|awful|hopeless|good|great|smart|dumb) with (?:my )?money\b/,
    canon: 'how am i doing',
  },

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
  // "when did i last get paid" / "when was i paid" — a WHEN question about pay
  // landing; the salaryStatus answer carries the latest income date, so it
  // answers the "when" (a plain `income` total would not).
  {
    re: /\bwhen (?:did|was|do|will) i (?:last |just )?(?:get |got |getting |being )?paid\b/,
    canon: 'did i get paid',
  },

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
  // goalPlan — goal statements: "goal this month to buy iPhone 17",
  // "my goal is to save 50k", "new goal: emergency fund".
  {
    re: /\bgoals?\b[^.]{0,40}\b(?:buy|get|purchase|save|saving|afford)\b/,
    canon: 'goal plan',
  },
  { re: /\b(?:my|new) goal\b/, canon: 'goal plan' },
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
  // "what should my (monthly) budget be" / "how much should i budget" — asking
  // for GUIDANCE on sizing a budget, not the status of one they've set.
  {
    re: /\bwhat should (?:my|our|the) [^.]{0,20}\bbudget be\b/,
    canon: 'rule of thumb',
  },
  { re: /\bhow much should (?:i|we) budget\b/, canon: 'rule of thumb' },
  // impulseTips.
  { re: /\bimpulse\b/, canon: 'impulse tips' },

  // ── safeToSpend ───────────────────────────────────────────────────────────
  { re: /\bsafe(?:ly)? to spend\b/, canon: 'safe to spend' },
  // "how much can/should I (safely) spend" — but NOT "...spend on coffee", which
  // is a category-scoped spend question, so we exclude a trailing "on/for".
  {
    re: /\bhow much (?:can|should|may) i (?:safely )?spend(?!\s+(?:on|for)\b)/,
    canon: 'safe to spend',
  },
  {
    re: /\b(?:left|available|remaining|ok(?:ay)?) to spend\b/,
    canon: 'safe to spend',
  },
  { re: /\bspend safely\b/, canon: 'safe to spend' },

  // ── reCategorize (a command, not a question — gated on a destination) ──────
  {
    re: /\bre-?categori[sz]e\b|\breclassif(?:y|ies)\b|\bre-?tag(?:ged)?\b/,
    canon: 'recategorize',
  },
  // move/change/switch/mark/put/file <subject> as|to|into|under <category>. The
  // negative lookahead keeps time words ("...to last month") and transfers
  // ("...to gcash/savings") from masquerading as a re-categorize.
  {
    re: /\b(?:move|change|switch|mark|put|file|categori[sz]e)\b[^.]{0,30}\b(?:as|to|into|under)\s+(?!last\b|this\b|next\b|yesterday\b|today\b|tomorrow\b|gcash\b|maya\b|savings\b|my account\b|the account\b)/,
    canon: 'recategorize',
  },

  // ── splitBill ─────────────────────────────────────────────────────────────
  {
    re: /\bsplit\b[^.]{0,16}\b(?:bill|tab|check|receipt|cost|expense|dinner|lunch|meal|payment)\b/,
    canon: 'split bill',
  },
  {
    re: /\bsplit (?:it|this|that)\b[^.]{0,16}\b(?:with|between|among)\b/,
    canon: 'split bill',
  },
  { re: /\bgo dutch\b/, canon: 'split bill' },

  // ── debt (receivables recall: "who i lent money to", "how much i owe") ────
  {
    re: /\bwho (?:i |did i )?(?:lent|lend|loaned|loan|borrowed|owes?)\b/,
    canon: 'who owes me',
  },
  {
    re: /\bhow much (?:do |did |does )?i (?:still )?owe\b/,
    canon: 'how much do i owe',
  },

  // ── runway ("how long will my money last") ───────────────────────────────
  {
    re: /\bhow long (?:will|can|would|does) (?:my )?(?:money|cash|balance|funds?|savings?) (?:last|stretch|hold|carry)\b/,
    canon: 'runway',
  },
  { re: /\bburn ?rate\b/, canon: 'runway' },
  { re: /\brun(?:ning)? out of (?:money|cash|funds?)\b/, canon: 'runway' },
  { re: /\bwhen (?:will|would|do) i (?:run out|go broke)\b/, canon: 'runway' },

  // ── explainSpend ("why is my spending so high", "what changed") ──────────
  {
    re: /\bwhy (?:is|are|was|am i|do i)\b[^.]*\b(?:spend(?:ing)?|expenses?|gastos)\b/,
    canon: 'explain spending',
  },
  {
    re: /\bwhy\b[^.]*\b(?:so (?:high|much|big)|too (?:high|much))\b/,
    canon: 'explain spending',
  },
  {
    re: /\bwhy (?:did|has|is) my (?:balance|money|cash|savings?) (?:go(?:ne)? down|dropp?(?:ed)?|f[ae]ll(?:en)?|decreas(?:e|ed)|shr[au]nk)\b/,
    canon: 'explain spending',
  },
  { re: /\bwhat(?: has| s|s)? changed\b/, canon: 'explain spending' },
  // "why am i always broke" — a WHY about money draining, not a balance check
  // (plain "am i broke" stays `balance`). Answer with what's driving spend.
  {
    re: /\bwhy (?:am i|are we) (?:always |still |so |constantly )?(?:broke|poor|out of (?:money|cash)|low on (?:money|cash))\b/,
    canon: 'explain spending',
  },

  // ── monthPattern ("cheapest / most expensive month") ─────────────────────
  {
    re: /\b(?:cheapest|least expensive|lowest|priciest|most expensive|highest|biggest|costliest) month\b/,
    canon: 'month pattern',
  },
  {
    re: /\b(?:which|what) month (?:did|do|have|was|were) i (?:spend|spent|spending)\b/,
    canon: 'month pattern',
  },
  {
    re: /\b(?:spending|spend|expenses?) (?:by|per|each|every) month\b/,
    canon: 'month pattern',
  },
  { re: /\bmonth (?:over|by|to) month\b/, canon: 'month pattern' },

  // ── weekend vs weekday → reuse the dowPattern anchor ─────────────────────
  {
    re: /\bweek ?ends?\b[^.]{0,16}\b(?:vs\.?|versus|or|and|compared to)\b[^.]{0,16}\bweek ?days?\b/,
    canon: 'day of week',
  },
  {
    re: /\bweek ?days?\b[^.]{0,16}\b(?:vs\.?|versus|or|and|compared to)\b[^.]{0,16}\bweek ?ends?\b/,
    canon: 'day of week',
  },

  // ── saved-so-far → savings (range-aware in the bridge) ───────────────────
  { re: /\b(?:have|did) i sav(?:e|ed)\b/, canon: 'savings' },
  { re: /\bsaved? so far\b/, canon: 'savings' },

  // ── average daily spend → typicalSpend (daily mode in the bridge) ────────
  {
    re: /\b(?:average|avg|typical) (?:daily|per[- ]day)\b/,
    canon: 'typical spend',
  },
  { re: /\bdaily (?:spend(?:ing)?|average|burn)\b/, canon: 'typical spend' },
  { re: /\b(?:spend|spending) (?:per|a|each) day\b/, canon: 'typical spend' },

  // ── upcomingBills ─────────────────────────────────────────────────────────
  { re: /\bnext bill\b/, canon: 'upcoming bills' },
  {
    re: /\b(?:bills?|payments?|dues)\b[^.]{0,20}\b(?:due|coming up|upcoming)\b/,
    canon: 'upcoming bills',
  },
  {
    re: /\b(?:due|coming up|upcoming)\b[^.]{0,20}\b(?:bills?|payments?)\b/,
    canon: 'upcoming bills',
  },
  { re: /\bupcoming (?:bills?|payments?|charges?)\b/, canon: 'upcoming bills' },
  { re: /\bwhen is\b[^.]{0,28}\bdue\b/, canon: 'upcoming bills' },
  { re: /\bwhat(?: is|s)? due\b/, canon: 'upcoming bills' },

  // ── setBudget (a command, diverted from the logger by route.ts) ──────────
  {
    re: /\b(?:set|create|make|add|update|put|give me)\b[^.]{0,16}\bbudgets?\b/,
    canon: 'set budget',
  },
  { re: /\bbudgets?\b\s*(?:of\s*)?(?:₱|php)?\s?\d/, canon: 'set budget' },
  {
    re: /\bcap (?:my |the )?\w[\w ]{0,16} at (?:₱|php)?\s?\d/,
    canon: 'set budget',
  },

  // ── deleteTransaction ─────────────────────────────────────────────────────
  {
    re: /\b(?:delete|remove|erase|scrap|undo)\b[^.]{0,24}\b(?:transactions?|charges?|expenses?|purchases?|payments?|entry|entries|one)\b/,
    canon: 'delete transaction',
  },

  // ── transfer (money between accounts; needs an amount so "move my grab
  //     ride to transport" stays a recategorize) ──────────────────────────────
  {
    re: /\b(?:move|transfer)\b[^.]{0,12}(?:₱|php)?\s?\d[\d,]*(?:\.\d+)?\b[^.]{0,28}\b(?:to|into)\b/,
    canon: 'transfer funds',
  },
  { re: /\btransfer\b[^.]{0,20}\b(?:from|to|into)\b/, canon: 'transfer funds' },

  // ── reminder ──────────────────────────────────────────────────────────────
  // "remind me to pay…" is a task to stage; "remind me who/what/how much…" is a
  // RECALL question wrapping a query ("remind me who i lent money to") — the
  // lookahead keeps those from staging a reminder so the inner question's own
  // intent (debt/spend/…) can win.
  {
    re: /\bremind me(?! (?:who|whom|what|whats|when|where|which|why|how)\b)/,
    canon: 'set reminder',
  },
  { re: /\bset (?:a |an )?reminder\b/, canon: 'set reminder' },
  { re: /\bdon ?t let me forget\b/, canon: 'set reminder' },

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
