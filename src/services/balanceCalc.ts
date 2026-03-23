import { Category } from './aiCategoryMap';

export type TxType = 'exp' | 'inc';
export type Account = 'gcash' | 'cash' | 'bdo';

export interface Transaction {
  id: string;
  amount: number;
  type: TxType;
  category: Category;
  account: Account;
  date: Date;
  note?: string;
}

export interface BalanceSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
}

export interface CategorySummary {
  categoryId: Category;
  totalSpent: number;
}

export interface AccountSummary {
  accountId: Account;
  balance: number;
}

/**
 * Calculates Total Balance, Total Income, and Total Expenses 
 * for a given set of transactions within a specific timeframe.
 */
export function calculateBalanceSummary(
  transactions: Transaction[], 
  startingBalances: Record<Account, number> = { gcash: 0, cash: 0, bdo: 0 }
): BalanceSummary {
  // 1. Start with base account balances (simulating the onboarding setup)
  const initialTotal = Object.values(startingBalances).reduce((sum, val) => sum + val, 0);

  // 2. Aggregate transactions
  return transactions.reduce(
    (acc, tx) => {
      if (tx.type === 'inc') {
        acc.totalIncome += tx.amount;
        acc.totalBalance += tx.amount;
      } else if (tx.type === 'exp') {
        acc.totalExpense += tx.amount;
        acc.totalBalance -= tx.amount;
      }
      return acc;
    },
    { totalBalance: initialTotal, totalIncome: 0, totalExpense: 0 }
  );
}

/**
 * Aggregates expenses by category to power the "Spending this month" UI
 * and the progress bars on the Stats screen.
 */
export function calculateCategorySpend(transactions: Transaction[]): Record<Category, number> {
  const defaultCategories: Record<Category, number> = {
    food: 0, transport: 0, shopping: 0, bills: 0, health: 0, other: 0
  };

  return transactions.reduce((acc, tx) => {
    if (tx.type === 'exp') {
      // Ensure the category exists in our accumulator, fallback to 'other'
      const cat = acc[tx.category] !== undefined ? tx.category : 'other';
      acc[cat] += tx.amount;
    }
    return acc;
  }, defaultCategories);
}

/**
 * Calculates the current real-time balance of each individual account
 * to power the "Accounts" chips on the Home and More screens.
 */
export function calculateAccountBalances(
  transactions: Transaction[],
  startingBalances: Record<Account, number> = { gcash: 0, cash: 0, bdo: 0 }
): Record<Account, number> {
  // Clone starting balances so we don't mutate the original object
  const balances = { ...startingBalances };

  transactions.forEach((tx) => {
    if (tx.type === 'inc') {
      balances[tx.account] += tx.amount;
    } else if (tx.type === 'exp') {
      balances[tx.account] -= tx.amount;
    }
  });

  return balances;
}