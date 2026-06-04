/**
 * OCR post-processing (FINO_INTELLIGENCE_V2.md §3) — the pure merchant /
 * category / account resolution that used to be inlined in `ScreenshotScreen`
 * and `BillSplitterScreen`. No UI, no network: it takes a raw edge-function
 * response plus the user's accounts/categories and returns plain data the
 * screen applies to state. Behaviour is preserved exactly from the screens.
 */

import type { AccountLite } from '../categorize/categorize';
import type {
  RawField,
  RawReceiptResponse,
  RawSplitResponse,
  FieldStatus,
  ParsedReceipt,
} from './types';

export type { AccountLite };

export type CategoryLite = { name: string; emoji?: string | null };

export type ReceiptResolution = {
  /** Normalized fields ready for the confirm UI. */
  parsed: ParsedReceipt;
  /** The user account the detected wallet/account name matched, if any. */
  matchedAccount: AccountLite | null;
  /** Category to preselect. `signal: 'merchant'` only on a real OCR-category
   *  match (vs. a plain "default to first category" fallback). `null` when the
   *  user has no categories to choose from. */
  category: { name: string; signal: 'merchant' | null } | null;
};

/** confidence → field status. ≥ 0.85 is auto-confirmed, else needs a glance. */
const toStatus = (confidence: number): FieldStatus =>
  confidence >= 0.85 ? 'confirmed' : 'check';

/** Read a field's value, tolerating both `{ value }` objects and flat primitives. */
function fieldValue(
  f: RawField | string | number | null | undefined
): string | number | null {
  if (f === null || f === undefined) return null;
  if (typeof f === 'object') return f.value ?? null;
  return f;
}

/** Read a field's confidence, falling back to a legacy flat `*_confidence`. */
function fieldConf(
  f: RawField | string | number | null | undefined,
  legacy?: number
): number {
  if (f && typeof f === 'object') return f.confidence ?? legacy ?? 0;
  return legacy ?? 0;
}

/**
 * Resolve a `parse-receipt` response into confirm-screen state: match the
 * detected wallet/account name to a real account, score each field's
 * confidence, and suggest a category from the user's list.
 */
export function resolveReceipt(
  raw: RawReceiptResponse,
  opts: {
    accounts: AccountLite[];
    categories: CategoryLite[];
    lastUsedAccountId?: string | null;
  }
): ReceiptResolution {
  const { accounts, categories, lastUsedAccountId } = opts;

  // Prefer the text-detected wallet name; fall back to the UI-detected account.
  const detectedWalletNameRaw = fieldValue(raw.wallet);
  const detectedWalletName =
    detectedWalletNameRaw === null ? null : String(detectedWalletNameRaw);
  const detectedWalletConf = fieldConf(raw.wallet);
  const accountValueRaw = fieldValue(raw.account);
  const detectedAccountName =
    detectedWalletName ??
    (accountValueRaw === null ? null : String(accountValueRaw));
  const detectedAccountConf = detectedWalletName
    ? detectedWalletConf
    : fieldConf(raw.account);

  const fallbackAccount =
    lastUsedAccountId && accounts.find((a) => a.id === lastUsedAccountId)
      ? lastUsedAccountId
      : (accounts[0]?.id ?? '');
  let matchedAccountId = fallbackAccount;
  let accountConf = detectedAccountConf > 0 ? detectedAccountConf : 0.4;
  let matchedAccount: AccountLite | null = null;

  if (detectedAccountName && accounts.length > 0) {
    const lower = detectedAccountName.toLowerCase();
    matchedAccount =
      accounts.find((a) => {
        const accountLower = a.name.toLowerCase();
        // Forward: account name contains detected (e.g. "gcash wallet" ⊇ "gcash").
        if (accountLower.includes(lower)) return true;
        // Reverse with a word boundary so "gcash" matches whole-word inside the
        // detected string but "cash" does not falsely match "gcash".
        const escaped = accountLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`).test(lower);
      }) ?? null;
    if (matchedAccount) {
      matchedAccountId = matchedAccount.id;
      accountConf =
        detectedAccountConf >= 0.85
          ? detectedAccountConf
          : Math.max(detectedAccountConf, 0.4);
    }
  }

  const merchantConf = fieldConf(raw.merchant, raw.merchant_confidence);
  const amountConf = fieldConf(raw.amount, raw.amount_confidence);
  const dateConf = fieldConf(raw.date, raw.date_confidence);

  // Match the parser's suggested category against the user's actual list
  // (by name, then emoji). The parser emits master keys like "food".
  let category: ReceiptResolution['category'] = null;
  const suggestedRaw = String(fieldValue(raw.category) ?? '').trim();
  if (suggestedRaw && categories.length > 0) {
    const lower = suggestedRaw.toLowerCase();
    const match =
      categories.find((c) => c.name.toLowerCase() === lower) ??
      categories.find((c) => (c.emoji ?? '').toLowerCase() === lower);
    if (match) {
      category = { name: match.name, signal: 'merchant' };
    } else if (categories[0]) {
      category = { name: categories[0].name, signal: null };
    }
  } else if (categories[0]) {
    category = { name: categories[0].name, signal: null };
  }

  const parsed: ParsedReceipt = {
    account: {
      value: matchedAccountId,
      confidence: accountConf,
      status: toStatus(accountConf),
    },
    merchant: {
      value: (fieldValue(raw.merchant) ?? '') as string | number,
      confidence: merchantConf,
      status: toStatus(merchantConf),
    },
    amount: {
      value: (fieldValue(raw.amount) ?? '') as string | number,
      confidence: amountConf,
      status: toStatus(amountConf),
    },
    date: {
      value: (fieldValue(raw.date) ?? '') as string | number,
      confidence: dateConf,
      status: toStatus(dateConf),
    },
    wallet: (() => {
      if (detectedWalletName) {
        return {
          value: detectedWalletName,
          confidence: detectedWalletConf,
          status: toStatus(detectedWalletConf),
        };
      }
      const accountVal = fieldValue(raw.account);
      if (accountVal) {
        const conf = fieldConf(raw.account);
        return { value: accountVal, confidence: conf, status: toStatus(conf) };
      }
      return undefined;
    })(),
  };

  return { parsed, matchedAccount, category };
}

// ─── Bill-split normalization ────────────────────────────────────────────────

export type SplitLineItem = { name: string; price: number; quantity: number };

export type SplitResolution = {
  merchant: string | null;
  total: number | null;
  items: SplitLineItem[];
};

/**
 * Normalize a `split-receipt` response into line items: default quantity to 1
 * and derive a line total from `price` or `unit_price × quantity`.
 */
export function normalizeSplitItems(raw: RawSplitResponse): SplitResolution {
  const items: SplitLineItem[] = (raw.items ?? []).map((item) => {
    const quantity = item.quantity ?? 1;
    const price =
      item.price ?? (item.unit_price ? item.unit_price * quantity : 0);
    return { name: item.name, price, quantity };
  });
  return { merchant: raw.merchant ?? null, total: raw.total ?? null, items };
}
