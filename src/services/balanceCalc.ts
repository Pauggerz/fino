import { useState, useEffect } from 'react';
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
    if (tx.type === 'exp') {
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

// ─── Reactive transaction store ───────────────────────────────────────────────
//
// A lightweight in-memory store that notifies subscribers on every mutation
// (add / remove), so components can recalculate balances reactively.
//
// Animation: the BALANCE_UPDATE duration (400 ms from transitions.ts) is
// exported here so UI components know how long to run Animated.timing after
// a balance change.
//
export const BALANCE_ANIMATE_MS = transitions.BALANCE_UPDATE.duration; // 400

type Listener = () => void;

class TransactionStore {
  private txns: Transaction[] = [];

  private starting: Record<Account, number> = { ...DEFAULT_STARTING_BALANCES };

  private listeners = new Set<Listener>();

  /** Most recently added transaction — consumed once by the toast layer. */
  private lastSaved: Transaction | null = null;

  // ── Subscribe / notify ──
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  // ── Mutations — each triggers recalculation in all subscribers ──

  /** Add a transaction. Triggers reactive recalculation. */
  add(partial: Omit<Transaction, 'id' | 'date'>): Transaction {
    const tx: Transaction = {
      ...partial,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: new Date(),
    };
    this.txns = [tx, ...this.txns];
    this.lastSaved = tx;
    this.emit();
    return tx;
  }

  /** Returns the most recently saved transaction (once). Null if already consumed. */
  getLastSaved(): Transaction | null {
    return this.lastSaved;
  }

  /** Mark the pending toast as consumed so it isn't shown twice. */
  clearLastSaved(): void {
    this.lastSaved = null;
  }

  /** Remove a transaction by id (used on Undo). Triggers reactive recalculation. */
  remove(id: string): void {
    this.txns = this.txns.filter((t) => t.id !== id);
    this.emit();
  }

  // ── Read ──

  getAll(): Transaction[] {
    return [...this.txns];
  }

  getBalanceSummary(): BalanceSummary {
    return calculateBalanceSummary(this.txns, this.starting);
  }

  /** Per-account summaries with isNegative flag. */
  getAccountSummaries(): AccountSummary[] {
    return getAccountSummaries(this.txns, this.starting);
  }

  getCategorySpend(): Record<Category, number> {
    return calculateCategorySpend(this.txns);
  }
}

/** Singleton store — import this in components and services. */
export const transactionStore = new TransactionStore();

/**
 * React hook — re-renders the caller whenever the store changes (create/delete/undo).
 * Usage:
 *   const store = useTransactionStore();
 *   const { totalBalance } = store.getBalanceSummary();
 */
export function useTransactionStore(): TransactionStore {
  const [, forceUpdate] = useState(0);
  useEffect(
    () => transactionStore.subscribe(() => forceUpdate((n) => n + 1)),
    []
  );
  return transactionStore;
}
