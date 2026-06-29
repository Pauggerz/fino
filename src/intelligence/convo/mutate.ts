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
import { peso, capWord, fmtDate } from './nlg';
import { analyzeTransactionText } from '../categorize/categorize';

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
  norm: string,
  opts: { anyType?: boolean } = {}
): TxLite | undefined {
  const txns = ctx.transactions ?? [];
  if (!txns.length) return undefined;
  // Re-categorize only ever targets expenses; a delete can target any row
  // ("delete my last transaction" might be an income or transfer).
  const pool = sortByDateDesc(
    opts.anyType
      ? selectTx(txns, { includeNonSpending: true })
      : selectTx(txns, { type: 'expense' })
  );
  if (!pool.length) return undefined;

  // "recategorize my last transaction as …" → the most recent expense.
  if (LAST_TX_RE.test(norm)) return pool[0];

  // Amount (charge lookup) within a 2% tolerance. An explicit amount is
  // authoritative: when no row lands inside the tolerance, only an explicit
  // merchant ("my 500 grab charge") may still resolve — never the loose
  // keyword/category fallback below, which would happily offer a different
  // row for "delete the ₱500 charge" when no ₱500 row exists.
  let amountMissed = false;
  if (slots.amounts.length) {
    const a = slots.amounts[0];
    const tol = Math.max(1, a * 0.02);
    const byAmt = pool.filter((t) => Math.abs(t.amount - a) <= tol);
    if (byAmt.length) return byAmt[0];
    amountMissed = true;
  }

  // An explicit "my Spotify charge / internet bill" merchant.
  if (slots.merchant) {
    const m = matchMerchant(pool, slots.merchant);
    if (m.length) return m[0];
  }
  if (amountMissed) return undefined;

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
const BUDGET_FOLLOWUPS = [
  'Am I on track to stay under my budget?',
  'Give me a spending breakdown',
];

/**
 * Propose a category budget ("set a budget of 5000 for food"). Emits a
 * `setBudget` mutation only when both the category and the limit resolve;
 * ChatScreen maps the category NAME to its row and writes `budgetLimit` after
 * the user confirms.
 */
export function answerSetBudget(
  ctx: BrainContext,
  slots: Slots
): BrainResponse {
  const followUps = BUDGET_FOLLOWUPS;
  const cat = slots.category ?? slots.targetCategory;
  const limit = slots.amounts.length ? Math.max(...slots.amounts) : undefined;

  if (!cat && !limit) {
    return {
      text: 'Tell me the category and the monthly cap — e.g. "set a budget of ₱5,000 for food".',
      followUps,
    };
  }
  if (!cat) {
    return {
      text: `For which category? e.g. "set a ${peso(limit as number)} budget for food".`,
      followUps,
    };
  }
  if (!limit) {
    return {
      text: `What monthly cap should I set for ${cat.label}? e.g. "set a ₱5,000 budget for ${cat.label.toLowerCase()}".`,
      followUps,
    };
  }

  const existing = (ctx.budgets ?? []).find(
    (b) => b.category.toLowerCase() === cat.label.toLowerCase()
  );
  return {
    text: existing
      ? `Update your ${cat.label} budget from ${peso(existing.limit)} to ${peso(
          limit
        )}/month? Tap confirm and I'll set it.`
      : `Set a ${peso(limit)}/month budget for ${cat.label}? Tap confirm and I'll set it.`,
    card: {
      kind: 'coach',
      data: {
        status: 'watch',
        title: 'Set budget',
        message: `${cat.label}: ${peso(limit)}/month${
          existing ? ` (was ${peso(existing.limit)})` : ''
        }`,
      },
    },
    mutation: { kind: 'setBudget', category: cat.label, limit },
    followUps,
  };
}

/**
 * Propose deleting a transaction ("delete my last transaction", "remove the
 * ₱500 charge"). Destructive, so the confirm copy is explicit; the actual
 * delete runs in ChatScreen only after the user confirms.
 */
export function answerDeleteTransaction(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = RECAT_FOLLOWUPS;
  const txns = ctx.transactions ?? [];
  if (!txns.length) {
    return {
      text: "I don't have your recent transactions loaded yet, so I can't delete anything. Give it a moment and try again.",
      followUps,
    };
  }
  const tx = resolveSourceTx(ctx, slots, norm, { anyType: true });
  if (!tx) {
    return {
      text: 'Tell me which transaction to delete — "delete my last transaction" or "delete the ₱500 charge" both work.',
      followUps,
    };
  }
  const label = capWord(txLabelOf(tx));
  return {
    text: `Delete ${label} (${peso(tx.amount)}, ${fmtDate(tx.date) || 'no date'})? This removes it from your records — tap confirm if you're sure.`,
    card: {
      kind: 'coach',
      data: {
        status: 'over',
        title: 'Delete transaction',
        message: `${label} · ${peso(tx.amount)} · ${fmtDate(tx.date) || '—'}`,
      },
    },
    mutation: {
      kind: 'delete',
      txId: tx.id,
      txLabel: label,
      amount: tx.amount,
    },
    followUps,
  };
}

// ─── Transfer between accounts ───────────────────────────────────────────────

const FROM_ACCT_RE =
  /\bfrom\s+(?:my |the )?([a-z0-9][a-z0-9 ]{1,24}?)(?=\s+(?:to|into)\b|\s*$)/;
const TO_ACCT_RE = /\b(?:to|into)\s+(?:my |the )?([a-z0-9][a-z0-9 ]{1,24})\s*$/;

function matchAccount(
  accts: { id: string; name: string }[],
  term: string | undefined
): { id: string; name: string } | undefined {
  const t = term?.trim().toLowerCase();
  if (!t) return undefined;
  return (
    accts.find((a) => a.name.toLowerCase() === t) ??
    accts.find(
      (a) =>
        a.name.toLowerCase().includes(t) || t.includes(a.name.toLowerCase())
    )
  );
}

/**
 * Propose moving money between accounts ("transfer 500 from gcash to bpi").
 * Both sides must resolve against the user's real accounts; a destination that
 * reads as a CATEGORY instead falls through to the re-categorize proposal
 * ("move 500 to food" usually means re-tagging the ₱500 charge).
 */
export function answerTransfer(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ["What's my balance?", 'Show me my last five transactions'];
  const accts = ctx.accounts ?? [];
  const amount = slots.amounts.length ? Math.max(...slots.amounts) : undefined;
  const toTerm = TO_ACCT_RE.exec(norm)?.[1];
  const fromTerm = FROM_ACCT_RE.exec(norm)?.[1];
  const toAcct = matchAccount(accts, toTerm);
  const fromHit = matchAccount(accts, fromTerm);

  // Destination resolves to a category, not an account → it's a re-tag. But a
  // source that names a REAL account ("from gcash …") is unmistakably a
  // transfer — never reroute that to re-categorize, even when the destination
  // word fuzzes to a category ("bpi" → Bills).
  if (!toAcct && !fromHit && slots.targetCategory && slots.amounts.length) {
    return answerReCategorize(ctx, slots, norm);
  }
  if (!amount) {
    return {
      text: 'How much should I move? e.g. "transfer ₱500 from GCash to BPI".',
      followUps,
    };
  }
  if (accts.length < 2) {
    return {
      text: 'You need at least two accounts to transfer between — add one in Accounts and try again.',
      actions: [
        { kind: 'navigate', label: 'Open Accounts', target: 'accounts' },
      ],
      followUps,
    };
  }
  if (!toAcct) {
    return {
      text: `Which account should the ${peso(amount)} go to? You have ${accts
        .map((a) => a.name)
        .join(', ')}.`,
      followUps,
    };
  }
  let fromAcct = fromHit;
  if (!fromAcct) {
    const others = accts.filter((a) => a.id !== toAcct.id);
    if (others.length === 1) [fromAcct] = others;
    else {
      return {
        text: `From which account should I move ${peso(amount)} to ${
          toAcct.name
        }? (${others.map((a) => a.name).join(', ')})`,
        followUps,
      };
    }
  }
  if (fromAcct.id === toAcct.id) {
    return {
      text: "That's the same account on both sides — tell me a different source or destination.",
      followUps,
    };
  }
  return {
    text: `Move ${peso(amount)} from ${fromAcct.name} to ${toAcct.name}? Tap confirm and I'll make the transfer.`,
    card: {
      kind: 'coach',
      data: {
        status: 'watch',
        title: 'Transfer',
        message: `${fromAcct.name} → ${toAcct.name} · ${peso(amount)}`,
      },
    },
    mutation: {
      kind: 'transfer',
      amount,
      fromAccountId: fromAcct.id,
      fromLabel: fromAcct.name,
      toAccountId: toAcct.id,
      toLabel: toAcct.name,
    },
    followUps,
  };
}

// ─── Bill reminder (navigate-prefill — no write) ─────────────────────────────

const REMIND_SUBJECT_RE =
  /\bremind me (?:to |about )?(?:pay(?:ing)? )?(?:my |the |a |an )?([a-z][a-z0-9 ]{2,32}?)(?:\s+bills?)?(?:\s+(?:₱|php)?\d|\s*$)/;

/**
 * "Remind me to pay my electric bill (2000)" — there's no in-chat reminder
 * service, so this routes to Recurring Bills pre-filled (best effort) where the
 * user confirms on the real screen.
 */
export function answerReminder(slots: Slots, norm: string): BrainResponse {
  const m = REMIND_SUBJECT_RE.exec(norm);
  let title = m?.[1]?.trim();
  if (title) {
    title = title
      .replace(/\b(?:every|each|on|by|before|when|so|next)\b.*$/, '')
      .trim();
  }
  const label = title && title.length >= 3 ? capWord(title) : undefined;
  const amount = slots.amounts.length ? slots.amounts[0] : undefined;
  const params: Record<string, unknown> = {};
  if (label) params.title = label;
  if (amount) params.amount = amount;
  return {
    text: label
      ? `Let's set that up — I'll open Recurring Bills so you can save a reminder for ${label}${
          amount ? ` (${peso(amount)})` : ''
        }.`
      : "Let's set that up — I'll open Recurring Bills so you can add the reminder there.",
    card: {
      kind: 'coach',
      data: {
        status: 'good',
        title: 'Set a bill reminder',
        message: label
          ? `${label}${amount ? ` · ${peso(amount)}` : ''} — confirm the schedule there.`
          : 'Pick the bill and schedule there.',
      },
      actions: [
        {
          kind: 'navigate',
          label: 'Open Recurring Bills',
          target: 'recurringBills',
          params,
        },
      ],
    },
    followUps: ['What bills are coming up?', 'Did I pay my internet bill?'],
  };
}

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
