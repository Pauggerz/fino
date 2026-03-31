/**
 * Lightweight module-level store that carries the most recently saved
 * transaction across the AddTransactionSheet → HomeScreen boundary so
 * HomeScreen can show an undo toast.
 */

export interface LastSavedEntry {
  /** Supabase transaction id — used by HomeScreen to delete on undo. */
  id: string;
  /** Supabase account id — used to restore balance on undo. */
  accountId: string;
  /** Account balance BEFORE this transaction — used to restore on undo. */
  previousBalance: number;
  amount: number;
  type: 'expense' | 'income';
  accountName: string;
  categoryName: string;
}

let store: LastSavedEntry | null = null;

export const setLastSaved = (entry: LastSavedEntry): void => {
  store = entry;
};

export const getLastSaved = (): LastSavedEntry | null => store;

export const clearLastSaved = (): void => {
  store = null;
};
