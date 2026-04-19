import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { OfflineTransaction } from '@/types';

const QUEUE_KEY = 'FINO_PENDING_TRANSACTIONS';

// Retry config — an insert that fails gets up to RETRY_ATTEMPTS tries with
// exponential backoff. A single transient network blip shouldn't strand a tx.
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const getPendingQueue = async (): Promise<OfflineTransaction[]> => {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    if (__DEV__) console.error('Error reading offline queue:', error);
    return [];
  }
};

/**
 * Returns only the pending transactions that have NOT yet been synced to Supabase.
 * Prevents double-counting during the race window where the local queue hasn't
 * cleared yet but the server already has the row.
 */
export const getUnsyncedPendingQueue = async (): Promise<OfflineTransaction[]> => {
  const queue = await getPendingQueue();
  if (queue.length === 0) return queue;

  const pendingIds = queue.map((tx) => tx.id!).filter(Boolean);
  const { data } = await supabase.from('transactions').select('id').in('id', pendingIds);

  const syncedIds = new Set((data ?? []).map((row: { id: string }) => row.id));
  return queue.filter((tx) => !syncedIds.has(tx.id ?? ''));
};

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const addToQueue = async (transaction: OfflineTransaction) => {
  try {
    const queue = await getPendingQueue();
    // Preserve a caller-supplied UUID so the caller can reference the entry later
    // (e.g. for undo). Fall back to a fresh UUID when none is provided.
    const newTx = { ...transaction, id: transaction.id || generateUUID(), isPending: true };
    queue.push(newTx);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return newTx;
  } catch (error) {
    if (__DEV__) console.error('Error adding to offline queue:', error);
    throw error;
  }
};

export const removeFromQueue = async (tempId: string) => {
  try {
    const queue = await getPendingQueue();
    const filtered = queue.filter((tx) => tx.id !== tempId);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch (error) {
    if (__DEV__) console.error('Error removing from offline queue:', error);
  }
};

/**
 * Attempt the server-side atomic insert+balance update, retrying on transient
 * errors with exponential backoff. Returns true if the RPC succeeded.
 */
async function insertTxWithRetry(dbPayload: Record<string, unknown>): Promise<boolean> {
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const { error } = await supabase.rpc('insert_tx_with_balance', {
        tx: dbPayload,
      });
      if (!error) return true;

      // PostgREST "function does not exist" / schema cache miss — don't retry,
      // the RPC simply isn't deployed. The caller will fall back.
      if (error.code === 'PGRST202' || /does not exist/i.test(error.message)) {
        if (__DEV__) {
          console.warn(
            '[sync] insert_tx_with_balance RPC not available — falling back to two-step insert.',
          );
        }
        return false;
      }

      if (__DEV__) console.error(`[sync] RPC attempt ${attempt + 1}/${RETRY_ATTEMPTS} failed:`, error.message);
    } catch (e) {
      if (__DEV__) console.error(`[sync] RPC attempt ${attempt + 1}/${RETRY_ATTEMPTS} threw:`, e);
    }

    // Backoff before the next attempt (but not after the last one).
    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  return false;
}

/**
 * Legacy non-atomic fallback: insert the transaction then atomically increment
 * the account balance via a dedicated RPC. Only used when the main
 * insert_tx_with_balance RPC isn't deployed.
 *
 * The balance increment uses adjust_account_balance(p_account_id, p_delta)
 * which runs `UPDATE accounts SET balance = balance + p_delta WHERE id = p_account_id`
 * server-side — safe under concurrent writes.
 */
async function insertTxFallback(
  tx: OfflineTransaction,
  dbPayload: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(dbPayload)
    .select()
    .single();

  if (error || !data) {
    if (__DEV__) console.error('[sync] fallback insert failed:', error?.message);
    return false;
  }

  const delta = tx.type === 'expense' ? -tx.amount : tx.amount;

  // Atomic increment — avoids the read-then-write race condition.
  const { error: balErr } = await supabase.rpc('adjust_account_balance', {
    p_account_id: tx.account_id,
    p_delta: delta,
  });

  if (balErr) {
    // RPC not deployed yet — last resort: skip balance update rather than
    // risk a duplicate insert on retry.
    if (__DEV__) console.warn('[sync] adjust_account_balance RPC not available:', balErr.message);
  }

  return true;
}

export const processQueue = async (): Promise<boolean> => {
  let queue = await getPendingQueue();
  if (queue.length === 0) return true;

  // Purge legacy entries that were queued with temp_ IDs (no valid UUID) —
  // these can never be inserted and would loop forever.
  const stale = queue.filter((tx) => (tx.id ?? '').startsWith('temp_'));
  if (stale.length > 0) {
    if (__DEV__) console.warn(`[sync] purging ${stale.length} stale temp_ transaction(s) from queue`);
    for (const tx of stale) await removeFromQueue(tx.id!);
    queue = queue.filter((tx) => !(tx.id ?? '').startsWith('temp_'));
  }

  if (queue.length === 0) return true;

  let allSuccess = true;

  for (const tx of queue) {
    const { isPending, ...dbPayload } = tx;

    try {
      // Try the atomic RPC first (handles both insert + balance update in one
      // server-side transaction). Falls back to two-step if RPC isn't deployed.
      let ok = await insertTxWithRetry(dbPayload);
      if (!ok) {
        ok = await insertTxFallback(tx, dbPayload);
      }

      if (ok) {
        await removeFromQueue(tx.id!);
      } else {
        allSuccess = false;
      }
    } catch (e) {
      if (__DEV__) console.error('[sync] unexpected exception during sync:', e);
      allSuccess = false;
    }
  }

  return allSuccess;
};
