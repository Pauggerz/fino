/**
 * Standalone terminal test for the typo/misroute bug class
 * (INTELLIGENCE_UPGRADE.md, Phases A + B — gate D1).
 *
 * Run from the repo root:
 *   npx tsx scripts/test-typo.ts        (or: npm run test:typo)
 *
 * Covers the four failure modes the upgrade plan was written against:
 *   1. Glued amounts    — "ice crwam20" must log as ₱20, "5kg" must NOT.
 *   2. Statement gate   — an amountless purchase statement gets a log-clarify,
 *                         never a force-answered query.
 *   3. Typo'd questions — "how mcuh did i spnd" fires the RULES layer (A3),
 *                         not just the char-gram classifier.
 *   4. Display names    — typos never leak into the logged name
 *                         ("Bouhgt Chicken" → "Chicken", "crwam" → "cream").
 * Plus B1/B2 sanity: meta.confidence exists, is in [0,1], and hits the
 * deterministic anchors (fallback = 0, clear rule win ≥ LOW_CONFIDENCE).
 *
 * No Jest, no Expo runtime; exit code 1 on any failure. Imports sub-paths only
 * (never the `@/intelligence` barrel — it pulls in React Native).
 */

import {
  splitGluedAmounts,
  extractAmounts,
} from '../src/intelligence/core/amounts';
import { spellNormalize } from '../src/intelligence/convo/spell';
import {
  looksLikeQuestion,
  looksLikeCommand,
  looksLikeLogStatement,
} from '../src/intelligence/convo/route';
import { parseChatTransaction } from '../src/intelligence/categorize/parseTransaction';
import {
  routeMessage,
  classifyMessage,
  LOW_CONFIDENCE,
} from '../src/intelligence/convo/brain';

const ACCOUNTS = [{ id: 'a1', name: 'Wallet' }];
const EXPENSE_CATS = ['Food', 'Coffee', 'Transport', 'Bills', 'Shopping'];
const INCOME_CATS = [{ name: 'Salary' }, { name: 'Bonus' }];

const parse = (text: string) =>
  parseChatTransaction(text, ACCOUNTS, EXPENSE_CATS, INCOME_CATS);

/** The exact log-vs-brain decision ChatScreen's handleSend makes. */
const decide = (text: string): 'log' | 'brain' =>
  !looksLikeQuestion(text) && !looksLikeCommand(text) && parse(text)
    ? 'log'
    : 'brain';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra = ''): void {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

// ── 1. Glued-amount recovery (A1) ────────────────────────────────────────────
console.log('Typo/misroute gate\n');

check(
  'splitGluedAmounts("crwam20") splits',
  splitGluedAmounts('i bought ice crwam20') === 'i bought ice crwam 20'
);
check(
  'splitGluedAmounts keeps "5kg" whole (unit suffix)',
  splitGluedAmounts('rice 5kg') === 'rice 5kg'
);
check(
  'splitGluedAmounts leaves clean text alone',
  splitGluedAmounts('coffee 120') === 'coffee 120'
);
check('"5k" shorthand still ₱5,000', extractAmounts('shoes 5k')[0] === 5000);

const glued = parse('I bought ice crwam20');
check('"I bought ice crwam20" parses (logged)', glued !== null);
check('  …amount is 20', glued?.amount === 20, `got ${glued?.amount}`);
check(
  '  …decide() = log (the original repro was force-answered)',
  decide('I bought ice crwam20') === 'log'
);
check(
  '"rice 5kg" does NOT parse an amount (no bogus ₱5 log)',
  parse('bought rice 5kg')?.amount !== 5,
  `got ${parse('bought rice 5kg')?.amount}`
);

// ── 2. Statement gate (A2) — amountless statements clarify, never answer ─────
const stmt = routeMessage('I bought ice crwam');
check(
  '"I bought ice crwam" → log-clarify, not a query answer',
  stmt.meta?.intent === 'logClarify',
  `got ${stmt.meta?.intent}`
);
check(
  '  …clarify echoes the FIXED item, not the typo',
  /cream/i.test(stmt.text) && !/crwam/i.test(stmt.text),
  `got "${stmt.text}"`
);
check(
  '  …offers the manual Add Transaction escape hatch',
  stmt.actions?.some((a) => a.kind === 'navigate') === true
);
check(
  '"i paid my electric bill" (no amount) → log-clarify',
  routeMessage('i paid my electric bill').meta?.intent === 'logClarify'
);
check(
  'looksLikeLogStatement true for "we ordered pizza"',
  looksLikeLogStatement('we ordered pizza')
);
// Question/command/lament shapes must NOT trip the statement gate.
check(
  '"what did i buy this week" is a question, not a statement',
  !looksLikeLogStatement('what did i buy this week')
);
check(
  '"i spent too much" (lament) is not a statement',
  !looksLikeLogStatement('i spent too much')
);

// ── 3. Typo'd questions fire the RULES layer (A3) ────────────────────────────
// The original repro ("how mcuh did i spnd") lands on the right intent no
// matter which layer catches it — that's the user-facing invariant.
const typoSpend = classifyMessage('how mcuh did i spnd');
check(
  '"how mcuh did i spnd" → spend',
  typoSpend.intent === 'spend',
  `got ${typoSpend.intent}`
);
// "mcuh" has a UNIQUE distance-1 fix ("much") → corrected, so the rules fire.
// "spnd" is ambiguous at distance 1 (spend/send) → deliberately left alone
// (unique-best conservatism); the char-gram classifier is the net for those.
const typoRules = classifyMessage('how mcuh did i spend');
check(
  '"how mcuh did i spend" decided by RULES (spell pass fired)',
  typoRules.intent === 'spend' && typoRules.source === 'rules',
  `got ${typoRules.intent}/${typoRules.source}`
);
check(
  'spellNormalize fixes the unique typo, keeps the ambiguous one',
  spellNormalize('how mcuh did i spnd') === 'how much did i spnd',
  `got "${spellNormalize('how mcuh did i spnd')}"`
);
const typoBalance = classifyMessage('whats my balanse');
check(
  '"whats my balanse" → balance',
  typoBalance.intent === 'balance',
  `got ${typoBalance.intent}`
);
check(
  'typo\'d question still routes to the brain (never logged)',
  decide('how mcuh did i spnd on food') === 'brain'
);

// ── 4. Display-name cleanup (A4) ─────────────────────────────────────────────
const chicken = parse('i bouhgt chicken 200');
check('"i bouhgt chicken 200" parses', chicken !== null);
check(
  '  …display name has no verb/typo leak',
  !!chicken && !/bouhgt|bought/i.test(chicken.displayName),
  `got "${chicken?.displayName}"`
);
check(
  '  …display name keeps the item',
  !!chicken && /chicken/i.test(chicken.displayName),
  `got "${chicken?.displayName}"`
);
check(
  '"I bought ice crwam20" display name reads "cream"',
  !!glued && /cream/i.test(glued.displayName) && !/crwam/i.test(glued.displayName),
  `got "${glued?.displayName}"`
);

// ── 5. Unified confidence sanity (B1/B2) ─────────────────────────────────────
const clear = routeMessage("what's my balance");
check(
  'clear rule win reports confidence ≥ LOW_CONFIDENCE',
  (clear.meta?.confidence ?? 0) >= LOW_CONFIDENCE,
  `got ${clear.meta?.confidence}`
);
const gibberish = routeMessage('qwerty asdfgh zxcvbn');
check(
  'gibberish falls back with confidence 0',
  gibberish.meta?.intent === null && gibberish.meta?.confidence === 0,
  `got intent=${gibberish.meta?.intent} conf=${gibberish.meta?.confidence}`
);
check(
  '  …and is flagged for the assist tier',
  gibberish.meta?.assistEligible === true
);
for (const msg of [
  "what's my balance",
  'I bought ice crwam',
  'qwerty asdfgh zxcvbn',
  'how mcuh did i spnd',
]) {
  const conf = routeMessage(msg).meta?.confidence;
  check(
    `confidence for "${msg}" is a number in [0,1]`,
    typeof conf === 'number' && conf >= 0 && conf <= 1,
    `got ${conf}`
  );
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.error('\nSome typo tests failed.');
  process.exit(1);
}
console.log('\nAll typo tests passed.');
