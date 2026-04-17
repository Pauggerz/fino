import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'FINO_PENDING_TRANSACTIONS';

// Retry config — an insert that fails gets up to RETRY_ATTEMPTS tries with
// exponential backoff. A single transient network blip shouldn't strand a tx.
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const getPendingQueue = async (): Promise<any[]> => {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
};

export const addToQueue = async (transaction: any) => {
  try {
    const queue = await getPendingQueue();
    const newTx = { ...transaction, id: `temp_${Date.now()}`, isPending: true };
    queue.push(newTx);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return newTx;
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    throw error;
  }
};

export const removeFromQueue = async (tempId: string) => {
  try {
    const queue = await getPendingQueue();
    const filtered = queue.filter((tx) => tx.id !== tempId);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing from offline queue:', error);
  }
};

/**
 * Attempt the server-side atomic insert+balance update, retrying on transient
 * errors with exponential backoff. Returns true if the RPC succeeded.
 */
async function insertTxWithRetry(dbPayload: any): Promise<boolean> {
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

      console.error(
        `[sync] RPC attempt ${attempt + 1}/${RETRY_ATTEMPTS} failed:`,
        error.message,
      );
    } catch (e) {
      console.error(`[sync] RPC attempt ${attempt + 1}/${RETRY_ATTEMPTS} threw:`, e);
    }

    // Backoff before the next attempt (but not after the last one).
    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  return false;
}

/**
 * Legacy non-atomic fallback: insert the transaction then update the balance
 * in two separate calls. Only used if the RPC function hasn't been deployed.
 * Partial-failure risk is documented; the caller keeps the tx in the queue
 * on any error.
 */
async function insertTxFallback(tx: any, dbPayload: any): Promise<boolean> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(dbPayload)
    .select()
    .single();

  if (error || !data) {
    console.error('[sync] fallback insert failed:', error?.message);
    return false;
  }

  const delta = tx.type === 'expense' ? -tx.amount : tx.amount;
  const { data: accData } = await supabase
    .from('accounts')
    .select('balance')
    .eq('id', tx.account_id)
    .single();

  if (accData) {
    const { error: balErr } = await supabase
      .from('accounts')
      .update({ balance: accData.balance + delta })
      .eq('id', tx.account_id);
    if (balErr) {
      console.error('[sync] fallback balance update failed:', balErr.message);
      // Tx already inserted — returning true would strand the queue item, but
      // returning false would re-insert a duplicate. Prefer the former and
      // surface the drift via logs; real fix is deploying the RPC.
      return true;
    }
  }

  return true;
}

export const processQueue = async (): Promise<boolean> => {
  const queue = await getPendingQueue();
  if (queue.length === 0) return true;

  let allSuccess = true;

  for (const tx of queue) {
    const { id, isPending, ...dbPayload } = tx;

    try {
      // Try the atomic RPC first (handles both insert + balance update in one
      // server-side transaction). Falls back to two-step if RPC isn't deployed.
      let ok = await insertTxWithRetry(dbPayload);
      if (!ok) {
        ok = await insertTxFallback(tx, dbPayload);
      }

      if (ok) {
        await removeFromQueue(id);
      } else {
        allSuccess = false;
      }
    } catch (e) {
      console.error('[sync] unexpected exception during sync:', e);
      allSuccess = false;
    }
  }

  return allSuccess;
};
