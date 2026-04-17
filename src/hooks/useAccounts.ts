import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { supabase } from '@/services/supabase';
import { Account } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingQueue } from '@/services/syncService';

/* eslint-disable import/prefer-default-export */

const CACHE_KEY = 'FINO_ACCOUNTS_CACHE';

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchAccounts = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
    let fetchedAccounts: Account[] = [];

    // 1. Load from local cache first for instant/offline display
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedData) {
        fetchedAccounts = JSON.parse(cachedData);
        // Cache hit — render immediately without a loading spinner
      } else {
        // First boot — no cache yet, show spinner while we fetch
        setLoading(true);
      }
    } catch (e) {
      console.error('Failed to load accounts cache', e);
      setLoading(true);
    }

    // Show whatever we have from cache right away
    if (fetchedAccounts.length > 0) {
      const pendingQueueEarly = await getPendingQueue();
      const earlyAdjusted = fetchedAccounts.map((acc) => {
        let delta = 0;
        pendingQueueEarly.forEach((tx) => {
          if (tx.account_id === acc.id) {
            delta += tx.type === 'expense' ? -tx.amount : tx.amount;
          }
        });
        return { ...acc, balance: acc.balance + delta };
      });
      startTransition(() => {
        setAccounts(earlyAdjusted);
        setLoading(false);
      });
    }

    // 2. Fetch fresh data from Supabase
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    // 3. If successful, update base variables and cache
    if (!error && data) {
      fetchedAccounts = data;
      setError(null);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch((e) => {
        if (__DEV__) console.warn('[useAccounts] cache write failed:', e);
      });
    } else if (error) {
      setError(error.message ?? 'Failed to load accounts');
    }

    // 4. OFFLINE CALCULATION: Apply pending transactions to balances
    const pendingQueue = await getPendingQueue();
    const adjustedAccounts = fetchedAccounts.map((acc) => {
      let pendingDelta = 0;
      pendingQueue.forEach((tx) => {
        if (tx.account_id === acc.id) {
          pendingDelta += tx.type === 'expense' ? -tx.amount : tx.amount;
        }
      });
      return { ...acc, balance: acc.balance + pendingDelta };
    });

    startTransition(() => {
      setAccounts(adjustedAccounts);
      setLoading(false);
    });
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return { accounts, totalBalance, loading, error, refetch: fetchAccounts };
};