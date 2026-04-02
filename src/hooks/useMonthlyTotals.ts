import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';

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
      .select('amount, type')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    if (!error && data) {
      const income = data
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
      const expense = data
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
      setTotalIncome(income);
      setTotalExpense(expense);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  return { totalIncome, totalExpense, loading, refetch: fetchTotals };
};
