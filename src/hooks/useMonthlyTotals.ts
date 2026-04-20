import { useState, useEffect, useCallback, startTransition } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import { getUnsyncedPendingQueue } from '@/services/syncService';

const CACHE_KEY = 'FINO_TOTALS_CACHE';

export interface SparklinePoint {
  id: string;
  val: number;
}

export interface MonthlyTotals {
  totalIncome: number;
  totalExpense: number;
  sparklineData: SparklinePoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useMonthlyTotals = (): MonthlyTotals => {
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [sparklineData, setSparklineData] = useState<SparklinePoint[]>(
    Array.from({ length: 7 }, (_, i) => ({ id: `day${i}`, val: 0 }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (__DEV__) console.error('Failed to load totals cache', e);
    }

    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, type, date')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    if (!error && data) {
      setError(null);
      baseIncome = data
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
      baseExpense = data
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);

      // Save to cache
      AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ totalIncome: baseIncome, totalExpense: baseExpense })
      ).catch((e) => {
        if (__DEV__) console.warn('[useMonthlyTotals] cache write failed:', e);
      });

      // Compute 7-day trailing sparkline from expense data
      const buckets: number[] = new Array(7).fill(0);
      data
        .filter((t) => t.type === 'expense' && t.date)
        .forEach((t) => {
          const dayDiff = Math.floor(
            (now.getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (dayDiff >= 0 && dayDiff < 7) {
            buckets[6 - dayDiff] += t.amount;
          }
        });
      const maxBucket = Math.max(...buckets, 1);
      startTransition(() => {
        setSparklineData(
          buckets.map((val, i) => ({ id: `day${i}`, val: val / maxBucket }))
        );
      });
    } else if (error) {
      setError(error.message ?? 'Failed to load monthly totals');
    }

    // 2. OFFLINE CALCULATION: Apply pending offline transactions
    const pendingQueue = await getUnsyncedPendingQueue();
    pendingQueue.forEach((tx) => {
      if (!tx.date || tx.date < startOfMonth || tx.date > endOfMonth) return;
      if (tx.type === 'income') baseIncome += tx.amount;
      if (tx.type === 'expense') baseExpense += tx.amount;
    });

    startTransition(() => {
      setTotalIncome(baseIncome);
      setTotalExpense(baseExpense);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  return {
    totalIncome,
    totalExpense,
    sparklineData,
    loading,
    error,
    refetch: fetchTotals,
  };
};
