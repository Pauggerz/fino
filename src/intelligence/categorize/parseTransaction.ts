import {
  analyzeTransactionText,
  detectAccount,
  buildDisplayName,
  type AccountLite,
} from './categorize';
import { matchIncomeKeyword, looksLikeIncome } from './income';
import { parseTimeRange } from '../core/time';
import { extractAmountsRecovered } from '../core/amounts';
// Chat-only dependency on the convo layer's vocabulary — acceptable here
// because `parseChatTransaction` is exclusively the ChatScreen logger; the
// Add Transaction sheet path (`analyzeTransactionText`) stays untouched.
import { spellNormalize } from '../convo/spell';

export type ChatTx = {
  amount: number;
  displayName: string;
  category: string | null;
  type: 'expense' | 'income';
  accountId: string | null;
  accountName: string | null;
  /** ISO date for the transaction when the message names an unambiguous past
   *  day ("yesterday", "3 days ago"); undefined → caller uses "now". Multi-day
   *  or future references are intentionally ignored (never guess a window). */
  date?: string;
};

/**
 * Parse a chat message into a transaction using the same offline taxonomy
 * the Add Transaction sheet uses. Returns null when no peso amount can be
 * extracted (signal that the user isn't logging a transaction).
 *
 * Multi-amount inputs like "chicken 50 and rice 50" are summed into a single
 * transaction; buildDisplayName produces "Food - Chicken & Rice".
 */
export function parseChatTransaction(
  text: string,
  accounts: AccountLite[],
  expenseCategoryNames: string[],
  incomeCategoryList: readonly { name: string }[]
): ChatTx | null {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return null;

  // Typo-hardened surface (INTELLIGENCE_UPGRADE.md, Phase A1+A4): recover a
  // glued amount ("ice crwam20" → "ice crwam 20") when the text yields none
  // as-is, then snap OOV tokens to known words ("crwam" → "cream") so the
  // categorizer and display name see clean input. One missing space or slip
  // must not turn a log into a misrouted "question".
  const { amounts: recovered, surface: glued } =
    extractAmountsRecovered(trimmed);
  if (recovered.length === 0) return null;
  const surface = spellNormalize(glued);

  const isIncome = looksLikeIncome(surface);
  const activeCategoryNames = isIncome
    ? incomeCategoryList.map((c) => c.name)
    : expenseCategoryNames;

  const analysis = analyzeTransactionText(surface, activeCategoryNames);
  if (analysis.extractedAmounts.length === 0) return null;

  const amount =
    Math.round(analysis.extractedAmounts.reduce((s, n) => s + n, 0) * 100) /
    100;
  const acctMatch = detectAccount(surface, accounts);

  const category = isIncome
    ? matchIncomeKeyword(surface, incomeCategoryList)
    : analysis.resolvedCategory;

  const master = analysis.suggestedCategory;
  const displayName = isIncome
    ? (category ?? 'Income')
    : buildDisplayName(surface, master, {
        accountSurface: acctMatch?.matchedKeyword ?? null,
      });

  const accountId =
    acctMatch?.accountId ?? (accounts.length === 1 ? accounts[0].id : null);
  const accountName =
    acctMatch?.accountName ?? (accounts.length === 1 ? accounts[0].name : null);

  // Back-date the log only for an unambiguous single past day ("yesterday",
  // "3 days ago"). Weeks/months/future or vague phrases stay undefined → "now".
  const tr = parseTimeRange(surface);
  const date =
    tr && (tr.key === 'yesterday' || tr.key === 'daysAgo')
      ? tr.start.toISOString()
      : undefined;

  return {
    amount,
    displayName,
    category,
    type: isIncome ? 'income' : 'expense',
    accountId,
    accountName,
    date,
  };
}
