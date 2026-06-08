/**
 * In-chat mutations (chat-mutations plan, Phases 3 & 4). The brain PROPOSES a
 * change as plain data and ChatScreen executes it only after the user confirms
 * — these functions never import the DB, stay pure and synchronous, and so load
 * fine in the `tsx` harnesses (no React Native).
 *
 *   • answerReCategorize — resolves a target transaction + destination category
 *     from the snapshot and returns a `recategorize` mutation proposal. Returns
 *     a plain clarification (no `mutation`) when either side is unresolved, so a
 *     wrong guess can never be written.
 *   • answerSplitBill — there is no in-chat split service yet, so this navigates
 *     to a (best-effort pre-filled) BillSplitter where the user confirms on the
 *     real screen. No DB write, hence no confirm card.
 */

import type { BrainContext, BrainResponse, TxLite } from './types';
import type { Slots } from './slots';
import { selectTx, sortByDateDesc, matchMerchant } from './query';
import { peso } from './nlg';
import { analyzeTransactionText } from '../categorize/categorize';

const MONTHS_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function capWord(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function txLabelOf(t: TxLite): string {
  return (
    t.name?.trim() ||
    t.merchant?.trim() ||
    t.category?.trim() ||
    'that transaction'
  );
}

const CONNECTIVE_RE = /\b(?:as|to|into|under)\b/;
/** Source subject = the text before the destination connective. */
function headBeforeConnective(norm: string): string {
  const m = CONNECTIVE_RE.exec(norm);
  return m ? norm.slice(0, m.index) : norm;
}

/** Generic nouns the taxonomy may map to a category but which are never the
 *  merchant subject of a re-categorize command. */
const SOURCE_STOPWORDS = new Set([
  'charge',
  'payment',
  'transaction',
  'expense',
  'purchase',
  'buy',
  'last',
  'latest',
  'recent',
]);

/** Command verbs + determiners stripped from the source half before analyzing,
 *  so the taxonomy keys on the real merchant ("grab") rather than the verb
 *  ("move", which the taxonomy maps to Transport). */
const HEAD_NOISE = new Set([
  'move',
  'change',
  'switch',
  'mark',
  'put',
  'file',
  'recategorize',
  're-categorize',
  'recategorise',
  'reclassify',
  'retag',
  're-tag',
  'categorize',
  'categorise',
  'can',
  'you',
  'please',
  'my',
  'the',
  'a',
  'that',
  'this',
]);

const LAST_TX_RE =
  /\b(?:last|latest|recent|previous|most recent)\b[^.]{0,16}\b(?:transaction|purchase|expense|charge|payment|buy|one)\b/;

/**
 * Find the transaction a re-categorize command refers to. Priority: an explicit
 * "last transaction", then an amount (charge lookup), then a "my X charge"
 * merchant slot, then a taxonomy keyword pulled from the source half. The user
 * confirms the exact row before any write, so a near-miss is recoverable.
 */
function resolveSourceTx(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): TxLite | undefined {
  const txns = ctx.transactions ?? [];
  if (!txns.length) return undefined;
  const pool = sortByDateDesc(selectTx(txns, { type: 'expense' }));
  if (!pool.length) return undefined;

  // "recategorize my last transaction as …" → the most recent expense.
  if (LAST_TX_RE.test(norm)) return pool[0];

  // Amount (charge lookup) within a 2% tolerance.
  if (slots.amounts.length) {
    const a = slots.amounts[0];
    const tol = Math.max(1, a * 0.02);
    const byAmt = pool.filter((t) => Math.abs(t.amount - a) <= tol);
    if (byAmt.length) return byAmt[0];
  }

  // An explicit "my Spotify charge / internet bill" merchant.
  if (slots.merchant) {
    const m = matchMerchant(pool, slots.merchant);
    if (m.length) return m[0];
  }

  // A taxonomy keyword from the source half ("my grab ride", "the netflix sub").
  // Strip command verbs / determiners first so the taxonomy keys on the real
  // merchant, not the verb ("move" itself maps to Transport).
  const head = headBeforeConnective(norm)
    .split(/\s+/)
    .filter((w) => w && !HEAD_NOISE.has(w))
    .join(' ');
  const a = analyzeTransactionText(
    head,
    ctx.topCategories.map((c) => c.name)
  );
  const kw = a.matchedKeyword?.toLowerCase();
  if (kw && kw.length >= 3 && !SOURCE_STOPWORDS.has(kw)) {
    const byMerchant = matchMerchant(pool, kw);
    if (byMerchant.length) return byMerchant[0];
    // Fall back to the resolved category bucket (most-recent row in it).
    const label = (a.resolvedCategory ?? '').toLowerCase();
    if (label) {
      const byCat = pool.filter(
        (t) => (t.category ?? '').toLowerCase() === label
      );
      if (byCat.length) return byCat[0];
    }
  }
  return undefined;
}

const RECAT_FOLLOWUPS = [
  'Show me my last five transactions',
  'Give me a spending breakdown',
];

/**
 * Propose moving a transaction to a new category. Emits a `recategorize`
 * mutation only when BOTH a target row and a destination category resolve;
 * otherwise it asks for the missing half (never a silent or wrong write).
 */
export function answerReCategorize(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = RECAT_FOLLOWUPS;
  const txns = ctx.transactions ?? [];
  const dest = slots.targetCategory;

  if (!txns.length) {
    return {
      text: "I don't have your recent transactions loaded yet, so I can't move anything. Give it a moment and try again.",
      followUps,
    };
  }
  if (!dest) {
    return {
      text: 'Which category should I move it to? For example: "move my Grab ride to Transport".',
      followUps,
    };
  }

  const tx = resolveSourceTx(ctx, slots, norm);
  if (!tx) {
    return {
      text: `Tell me which transaction — a merchant or amount works, e.g. "recategorize my Spotify charge as ${dest.label}".`,
      followUps,
    };
  }

  const from = tx.category ?? null;
  const to = dest.label;
  const label = capWord(txLabelOf(tx));
  if (from && from.toLowerCase() === to.toLowerCase()) {
    return { text: `${label} is already tagged ${to}.`, followUps };
  }

  return {
    text: `Move ${label} (${peso(tx.amount)}) from ${
      from ?? 'Other'
    } to ${to}? Tap confirm and I'll update it.`,
    card: {
      kind: 'coach',
      data: {
        status: 'watch',
        title: 'Re-categorize',
        message: `${label}: ${from ?? 'Other'} → ${to}`,
        reasons: [
          { label: 'Amount', detail: peso(tx.amount) },
          { label: 'Logged', detail: fmtDate(tx.date) || '—' },
        ],
      },
    },
    mutation: {
      kind: 'recategorize',
      txId: tx.id,
      txLabel: label,
      fromCategory: from,
      toCategory: to,
    },
    followUps,
  };
}

/**
 * Split-a-bill (Phase 4). No in-chat split service yet, so we route to the
 * BillSplitter (the confirm surface) rather than write anything. Any amount in
 * the message is passed along best-effort for a future pre-fill.
 */
export function answerSplitBill(slots: Slots): BrainResponse {
  const amount = slots.amounts.length ? Math.max(...slots.amounts) : undefined;
  return {
    text: amount
      ? `Let's split that ${peso(amount)} bill — I'll open the Bill Splitter so you can add who's in.`
      : "Let's split a bill — I'll open the Bill Splitter so you can add the people and the amounts.",
    card: {
      kind: 'coach',
      data: {
        status: 'good',
        title: 'Split a bill',
        message: amount
          ? `Divide ${peso(amount)} across everyone.`
          : 'Divide a shared bill evenly or by item.',
      },
      actions: [
        {
          kind: 'navigate',
          label: 'Open Bill Splitter',
          target: 'billSplitter',
          params: amount ? { amount } : {},
        },
      ],
    },
    followUps: [
      'Show me my last five transactions',
      'Give me a spending breakdown',
    ],
  };
}
