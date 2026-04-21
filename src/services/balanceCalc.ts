import { Category } from './aiCategoryMap';
import { transitions } from '../constants/transitions';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TxType = 'exp' | 'inc';
export type Account = 'gcash' | 'cash' | 'bdo' | 'maya';

export interface Transaction {
  id: string;
  amount: number;
  type: TxType;
  category: Category;
  account: Account;
  date: Date;
  note?: string;
  signal_source?: 'manual' | 'ai_description';
}

export interface BalanceSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
}

export interface AccountSummary {
  accountId: Account;
  balance: number;
  isNegative: boolean;
}

export interface CategorySummary {
  categoryId: Category;
  totalSpent: number;
}

// ─── Starting balances (set during onboarding) ────────────────────────────────

export const DEFAULT_STARTING_BALANCES: Record<Account, number> = {
  gcash: 8000,
  cash: 2450,
  bdo: 2000,
  maya: 0,
};

// ─── Pure calculation functions ───────────────────────────────────────────────

/**
 * Total balance + income/expense aggregates across all accounts.
 * Formula: starting_balance_total + SUM(income) − SUM(expenses)
 */
export function calculateBalanceSummary(
  transactions: Transaction[],
  startingBalances: Record<Account, number> = DEFAULT_STARTING_BALANCES
): BalanceSummary {
  const initialTotal = Object.values(startingBalances).reduce(
    (s, v) => s + v,
    0
  );

  return transactions.reduce(
    (acc, tx) => {
      if (tx.type === 'inc') {
        acc.totalIncome += tx.amount;
        acc.totalBalance += tx.amount;
      } else {
        acc.totalExpense += tx.amount;
        acc.totalBalance -= tx.amount;
      }
      return acc;
    },
    { totalBalance: initialTotal, totalIncome: 0, totalExpense: 0 }
  );
}

/**
 * Per-account balance: starting_balance + SUM(income) − SUM(expenses) for that account.
 */
export function calculateAccountBalances(
  transactions: Transaction[],
  startingBalances: Record<Account, number> = DEFAULT_STARTING_BALANCES
): Record<Account, number> {
  const balances = { ...startingBalances };
  transactions.forEach((tx) => {
    if (tx.type === 'inc') balances[tx.account] += tx.amount;
    else balances[tx.account] -= tx.amount;
  });
  return balances;
}

/**
 * Per-account summary objects — includes `isNegative` flag for UI rendering.
 * Use this in components that need to show the `!` indicator + expenseRed colour.
 */
export function getAccountSummaries(
  transactions: Transaction[],
  startingBalances: Record<Account, number> = DEFAULT_STARTING_BALANCES
): AccountSummary[] {
  const raw = calculateAccountBalances(transactions, startingBalances);
  return (Object.keys(startingBalances) as Account[]).map((id) => ({
    accountId: id,
    balance: raw[id],
    isNegative: raw[id] < 0,
  }));
}

/**
 * Per-category expense totals — powers spending bars and Stats screen.
 */
export function calculateCategorySpend(
  transactions: Transaction[]
): Record<Category, number> {
  const totals: Record<Category, number> = {
    food: 0,
    transport: 0,
    shopping: 0,
    bills: 0,
    health: 0,
    other: 0,
  };
  transactions.forEach((tx) => {
    // Transfers are internal moves and should not count as category spending.
    if (tx.type === 'exp' && String(tx.category).toLowerCase() !== 'transfer') {
      const cat = totals[tx.category] !== undefined ? tx.category : 'other';
      totals[cat] += tx.amount;
    }
  });
  return totals;
}

/** Returns true when a balance is negative — use to switch to expenseRed + "!" indicator. */
export function isNegativeBalance(balance: number): boolean {
  return balance < 0;
}

// Keep this exported for HomeScreen animation timing.
export const BALANCE_ANIMATE_MS = transitions.BALANCE_UPDATE.duration; // 400
