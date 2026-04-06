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
    // Add temporary ID for local rendering and flag as pending
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
    // Strip local-only properties before pushing to Supabase
    const { id, isPending, ...dbPayload } = tx;
    
    try {
      const { error } = await supabase.from('transactions').insert(dbPayload);

      if (error) {
        console.error('Supabase Sync error for tx:', error.message, error.details);
        allSuccess = false;
      } else {
        // Only remove from local storage if Supabase responds with success
        await removeFromQueue(id);
      }
    } catch (e) {
      console.error('Exception during sync (Network drop?):', e);
      allSuccess = false;
    }
  }

  return allSuccess;
};