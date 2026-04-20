import {
  useState,
  useEffect,
  useCallback,
  useRef,
  startTransition,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import { Account } from '@/types';
import { getUnsyncedPendingQueue } from '@/services/syncService';

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
        if (__DEV__) console.error('Failed to load accounts cache', e);
        setLoading(true);
      }

      // Show cache immediately (no pending delta yet — we apply it once after
      // fresh data arrives to avoid double-counting if the sync queue drains
      // between the two reads).
      if (fetchedAccounts.length > 0) {
        startTransition(() => {
          setAccounts(fetchedAccounts);
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

      // 4. OFFLINE CALCULATION: Apply pending transactions to balances.
      // Read the queue exactly once here so we never apply it twice.
      const pendingQueue = await getUnsyncedPendingQueue();
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
