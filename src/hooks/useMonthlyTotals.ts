import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingQueue } from '@/services/syncService';

const CACHE_KEY = 'FINO_TOTALS_CACHE';

export interface MonthlyTotals {
  totalIncome: number;
  totalExpense: number;
  loading: boolean;
  refetch: () => Promise<void>;
}

export const useMonthlyTotals = (): MonthlyTotals => {
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchTotals = useCallback(async () => {
    setLoading(true);

    let baseIncome = 0;
    let baseExpense = 0;

    // 1. Load from local cache first
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        baseIncome = parsed.totalIncome || 0;
        baseExpense = parsed.totalExpense || 0;
      }
    } catch (e) {
      console.error('Failed to load totals cache', e);
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, type')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    if (!error && data) {
      baseIncome = data
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
      baseExpense = data
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
      
      // Save to cache
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ totalIncome: baseIncome, totalExpense: baseExpense })).catch(() => {});
    }

    // 2. OFFLINE CALCULATION: Apply pending offline transactions
    const pendingQueue = await getPendingQueue();
    pendingQueue.forEach((tx) => {
      if (tx.type === 'income') baseIncome += tx.amount;
      if (tx.type === 'expense') baseExpense += tx.amount;
    });

    setTotalIncome(baseIncome);
    setTotalExpense(baseExpense);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  return { totalIncome, totalExpense, loading, refetch: fetchTotals };
};