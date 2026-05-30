import {
  analyzeTransactionText,
  detectAccount,
  buildDisplayName,
  type AccountLite,
} from './aiCategoryMap';
import { matchIncomeKeyword, looksLikeIncome } from './incomeKeywords';

export type ChatTx = {
  amount: number;
  displayName: string;
  category: string | null;
  type: 'expense' | 'income';
  accountId: string | null;
  accountName: string | null;
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

  const isIncome = looksLikeIncome(trimmed);
  const activeCategoryNames = isIncome
    ? incomeCategoryList.map((c) => c.name)
    : expenseCategoryNames;

  const analysis = analyzeTransactionText(trimmed, activeCategoryNames);
  if (analysis.extractedAmounts.length === 0) return null;

  const amount =
    Math.round(analysis.extractedAmounts.reduce((s, n) => s + n, 0) * 100) /
    100;
  const acctMatch = detectAccount(trimmed, accounts);

  const category = isIncome
    ? matchIncomeKeyword(trimmed, incomeCategoryList)
    : analysis.resolvedCategory;

  const master = analysis.suggestedCategory;
  const displayName = isIncome
    ? (category ?? 'Income')
    : buildDisplayName(trimmed, master, {
        accountSurface: acctMatch?.matchedKeyword ?? null,
      });

  const accountId =
    acctMatch?.accountId ?? (accounts.length === 1 ? accounts[0].id : null);
  const accountName =
    acctMatch?.accountName ?? (accounts.length === 1 ? accounts[0].name : null);

  return {
    amount,
    displayName,
    category,
    type: isIncome ? 'income' : 'expense',
    accountId,
    accountName,
  };
}
