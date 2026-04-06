import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'FINO_PENDING_TRANSACTIONS';

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

export const processQueue = async (): Promise<boolean> => {
  const queue = await getPendingQueue();
  if (queue.length === 0) return true;

  let allSuccess = true;

  for (const tx of queue) {
    const { id, isPending, ...dbPayload } = tx;
    
    try {
      // Force Supabase to return the row to confirm it didn't silently fail
      const { data, error } = await supabase
        .from('transactions')
        .insert(dbPayload)
        .select()
        .single();

      if (error || !data) {
        console.error('Supabase Sync error for tx:', error?.message);
        allSuccess = false;
      } else {
        // Fix: Accurately update the account balance on the server!
        const delta = tx.type === 'expense' ? -tx.amount : tx.amount;
        
        const { data: accData } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', tx.account_id)
          .single();

        if (accData) {
          await supabase
            .from('accounts')
            .update({ balance: accData.balance + delta })
            .eq('id', tx.account_id);
        }

        // Only clear from the local queue if EVERYTHING above succeeds
        await removeFromQueue(id);
      }
    } catch (e) {
      console.error('Exception during sync (Network drop?):', e);
      allSuccess = false;
    }
  }

  return allSuccess;
};