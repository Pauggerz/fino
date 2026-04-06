import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import { Account } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingQueue } from '@/services/syncService';

/* eslint-disable import/prefer-default-export */

const CACHE_KEY = 'FINO_ACCOUNTS_CACHE';

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    let fetchedAccounts: Account[] = [];

    // 1. Load from local cache first for instant/offline display
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedData) {
        fetchedAccounts = JSON.parse(cachedData);
      }
    } catch (e) {
      console.error('Failed to load accounts cache', e);
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
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
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

    setAccounts(adjustedAccounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return { accounts, totalBalance, loading, refetch: fetchAccounts };
};