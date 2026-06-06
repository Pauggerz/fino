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

import { looksLikeQuestion } from '../src/intelligence/convo/route';
import { parseChatTransaction } from '../src/intelligence/categorize/parseTransaction';

// One account → a parsed transaction auto-resolves (no picker), so a non-null
// result here means "would have been logged".
const ACCOUNTS = [{ id: 'a1', name: 'Wallet' }];
const EXPENSE_CATS = ['Food', 'Coffee', 'Transport', 'Bills', 'Shopping'];
const INCOME_CATS = [{ name: 'Salary' }, { name: 'Bonus' }, { name: 'Freelance' }];

type Outcome = 'brain' | 'log';

/** The exact decision ChatScreen's handleSend makes. */
function decide(text: string): Outcome {
  const parsed = looksLikeQuestion(text)
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

  // ── No amount at all — already routed to the brain today (control) ─────────
  { text: 'how much did i spend', want: 'brain' },
  { text: 'give me a spending breakdown', want: 'brain' },
  { text: 'what can you do', want: 'brain' },
];

let passed = 0;
let failed = 0;

console.log('Log-vs-ask gate\n');
for (const c of cases) {
  const got = decide(c.text);
  if (got === c.want) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ "${c.text}" → ${got}, want ${c.want}`);
  }
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.error('\nSome route tests failed.');
  process.exit(1);
}
console.log('\nAll route tests passed.');
