/**
 * Standalone terminal test for the chat log-vs-ask gate
 * (`convo/route.ts` + `categorize/parseTransaction.ts`). Mirrors the other
 * `scripts/test-*.ts` harnesses.
 *
 * Run from the repo root:
 *   npx tsx scripts/test-route.ts        (or: npm run test:route)
 *
 * This exercises the REAL end-to-end decision ChatScreen makes:
 *   parsed = looksLikeQuestion(text) ? null : parseChatTransaction(text, …)
 * and asserts each utterance routes to the brain (a question) or is logged (a
 * transaction). No Jest, no Expo runtime; exit code 1 on any failure.
 */

import {
  looksLikeQuestion,
  looksLikeCommand,
} from '../src/intelligence/convo/route';
import { isAbusive } from '../src/intelligence/convo/safety';
import { parseChatTransaction } from '../src/intelligence/categorize/parseTransaction';

// One account → a parsed transaction auto-resolves (no picker), so a non-null
// result here means "would have been logged".
const ACCOUNTS = [{ id: 'a1', name: 'Wallet' }];
const EXPENSE_CATS = ['Food', 'Coffee', 'Transport', 'Bills', 'Shopping'];
const INCOME_CATS = [{ name: 'Salary' }, { name: 'Bonus' }, { name: 'Freelance' }];

type Outcome = 'brain' | 'log';

/** The exact decision ChatScreen's handleSend makes. */
function decide(text: string): Outcome {
  const parsed =
    looksLikeQuestion(text) || looksLikeCommand(text)
      ? null
      : parseChatTransaction(text, ACCOUNTS, EXPENSE_CATS, INCOME_CATS);
  return parsed ? 'log' : 'brain';
}

type Case = { text: string; want: Outcome };

const cases: Case[] = [
  // ── Amount-bearing QUESTIONS — must reach the brain, never logged ──────────
  { text: 'where can i cut 2000 this month', want: 'brain' },
  { text: 'list all transactions over 5000 pesos this year', want: 'brain' },
  { text: 'i want to save for a 60000 laptop', want: 'brain' },
  { text: 'what was the 1500 charge on tuesday', want: 'brain' },
  { text: 'did i spend more than 1000 on food', want: 'brain' },
  { text: 'how much of my 30000 income goes to rent', want: 'brain' },
  { text: 'show me transactions under 500', want: 'brain' },
  { text: 'can i afford a 2000 dinner', want: 'brain' },
  { text: 'where can i free up 3000', want: 'brain' },
  { text: 'help me save 50000 for a trip', want: 'brain' },
  { text: 'which expense was the 1200 payment', want: 'brain' },

  // ── Evaluative affordability questions (no pronoun) — must reach the brain ──
  { text: 'is 5000 too much for food', want: 'brain' },
  { text: 'is ₱2000 too expensive for dinner', want: 'brain' },
  { text: 'is that worth it', want: 'brain' },
  { text: 'is 300 a good deal', want: 'brain' },

  // ── Mutation COMMANDS (amount-bearing) — must reach the brain, not logged ───
  { text: 'recategorize the 1500 charge as coffee', want: 'brain' },
  { text: 'move my grab ride to transport', want: 'brain' },
  { text: 'change the 1500 charge to bills', want: 'brain' },
  { text: 'mark netflix as entertainment', want: 'brain' },
  { text: 'split my 100 bill', want: 'brain' },
  { text: 'split the 500 dinner with john', want: 'brain' },

  // ── B1 gate holes (meerkat plan) — command-shaped, must NEVER be logged ────
  { text: 'set a budget of 5000 for food', want: 'brain' },
  { text: 'budget 3000 for transport', want: 'brain' },
  { text: 'make my food budget 4000', want: 'brain' },
  { text: 'cap my eating out at 1500', want: 'brain' },
  { text: 'remind me to pay my electric bill 2000', want: 'brain' },
  { text: 'set a reminder for my internet bill', want: 'brain' },
  { text: 'i want to buy a phone for 25000', want: 'brain' },
  { text: 'i plan to buy a laptop for 50000', want: 'brain' },
  { text: 'delete my last transaction', want: 'brain' },
  { text: 'remove the 500 charge', want: 'brain' },
  { text: 'delete the grab expense from yesterday', want: 'brain' },
  { text: 'i logged that twice remove one', want: 'brain' },
  { text: 'transfer 500 from gcash to bpi', want: 'brain' },
  { text: 'move 500 to savings', want: 'brain' },

  // ── Debt/receivable statements — Utang Tracker material, never logged ──────
  { text: 'paul owed me 5k', want: 'brain' },
  { text: 'paul owes me 500', want: 'brain' },
  { text: 'paul borrowed 5k', want: 'brain' },
  { text: 'i lent paul 2000', want: 'brain' },
  { text: 'lent 500 to maria', want: 'brain' },
  { text: 'i owe paul 300', want: 'brain' },
  { text: 'paul paid me back 500', want: 'brain' },
  { text: 'utang ni paul 500', want: 'brain' },

  // ── Goal statements — SavingsGoal material, never logged ───────────────────
  { text: 'goal this month to buy iphone 17', want: 'brain' },
  { text: 'my goal is to save 50000', want: 'brain' },
  { text: 'new goal save up for a car', want: 'brain' },

  // ── Genuine TRANSACTIONS — must still be logged ────────────────────────────
  { text: 'lunch 120', want: 'log' },
  { text: 'spent 50 on grab via gcash', want: 'log' },
  { text: 'i earned 5000 from freelance', want: 'log' },
  { text: 'bonus 5000', want: 'log' },
  { text: 'groceries 1500', want: 'log' },
  { text: 'coffee 150', want: 'log' },
  { text: 'haircut 200', want: 'log' },
  { text: 'shopping 2000', want: 'log' },
  { text: 'save 500 to gcash', want: 'log' },
  { text: 'chicken 50 and rice 50', want: 'log' },
  { text: 'paid 1200 for electricity', want: 'log' },
  { text: 'grab 80 gcash', want: 'log' },
  // Controls for the new command cues: a past purchase / paid bill is a log,
  // not a wish ("want to buy") or a reminder.
  { text: 'bought a phone for 25000', want: 'log' },
  { text: 'electric bill 2000', want: 'log' },
  { text: 'paid 2000 for my electric bill', want: 'log' },
  // Controls for the debt/goal cues: "rent" must not trip \blent\b, a plain
  // payment to a person is still a log, and "goal" alone needs a save/buy verb.
  { text: 'rent 5000', want: 'log' },
  { text: 'paid 500 to paul', want: 'log' },

  // ── No amount at all — already routed to the brain today (control) ─────────
  { text: 'how much did i spend', want: 'brain' },
  { text: 'give me a spending breakdown', want: 'brain' },
  { text: 'what can you do', want: 'brain' },
];

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

console.log('Log-vs-ask gate\n');
for (const c of cases) {
  const got = decide(c.text);
  check(`route "${c.text}" → ${c.want}`, got === c.want, `got ${got}`);
}

// ── Income TYPE decision (tightened) — ambiguous nouns stay EXPENSE (#13) ─────
const parse = (text: string) =>
  parseChatTransaction(text, ACCOUNTS, EXPENSE_CATS, INCOME_CATS);

check('"pay 500 for the bill" → expense', parse('pay 500 for the bill')?.type === 'expense');
check('"gift 500" → expense', parse('gift 500')?.type === 'expense');
check('"i earned 5000 from freelance" → income', parse('i earned 5000 from freelance')?.type === 'income');
check('"bonus 5000" → income', parse('bonus 5000')?.type === 'income');
check('"salary 30000" → income', parse('salary 30000')?.type === 'income');

// ── Abuse guard — offensive input is declined, never finance-answered ─────────
check('"suck my dick" → abusive', isAbusive('suck my dick'));
check('"FUCK YOU!!!" → abusive (case/punct)', isAbusive('FUCK YOU!!!'));
check('"you suck" → abusive', isAbusive('you suck'));
check('"tangina mo" → abusive (TL)', isAbusive('tangina mo'));
// High-precision: innocent substrings must NOT trip the guard.
check('"how much did i spend" → clean', !isAbusive('how much did i spend'));
check('"assess my class budget" → clean', !isAbusive('assess my class budget'));
check('"coffee at the cockpit cafe" → clean', !isAbusive('coffee at the cockpit cafe'));
check('"how much on leche flan" → clean', !isAbusive('how much on leche flan'));

// ── "5k" shorthand must not leak a bogus "K" item into the display name ──────
const shorthand = parse('bought shoes 5k');
check(
  '"bought shoes 5k" → amount 5000',
  shorthand?.amount === 5000,
  `got ${shorthand?.amount}`
);
check(
  '"bought shoes 5k" display name has no stray K',
  !!shorthand && !/\bK\b/i.test(shorthand.displayName.replace(/^[^-]*-/, '')),
  `got "${shorthand?.displayName}"`
);

// ── Back-dating only for unambiguous single past days (#9) ────────────────────
const yest = parse('lunch 120 yesterday');
check('"lunch 120 yesterday" back-dates', !!yest?.date && new Date(yest!.date!) < new Date());
check('"lunch 120" stays undated (logs now)', parse('lunch 120')?.date === undefined);
check('"groceries 1500 this month" not back-dated', parse('groceries 1500 this month')?.date === undefined);

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.error('\nSome route tests failed.');
  process.exit(1);
}
console.log('\nAll route tests passed.');
