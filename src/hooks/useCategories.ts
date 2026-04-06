import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import { Category } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingQueue } from '@/services/syncService';

// Keys used for income categories — exclude them from expense/budget views
const INCOME_EMOJI_KEYS = new Set([
  'salary', 'allowance', 'freelance', 'business', 'gifts', 'investment',
]);

const CACHE_KEY = 'FINO_CATEGORIES_CACHE';

export interface CategoryWithSpend extends Category {
  spent: number;
  pct: number;
  state: 'under' | 'nearing' | 'over';
}

export const useCategories = () => {
  const [categories, setCategories] = useState<CategoryWithSpend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategoriesAndSpend = useCallback(async () => {
    let baseCategories: Category[] = [];

    // 1. Load from local cache first
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedData) {
        baseCategories = JSON.parse(cachedData);
      }
    } catch (e) {
      console.error('Failed to load categories cache', e);
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    // 2. Fetch active categories
    const { data: catData, error: catError } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (!catError && catData) {
      baseCategories = catData;
    }

    // 3. Fetch expenses for the current month
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('type', 'expense')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    const expenses = txData && !txError ? txData : [];
    const spendMap: Record<string, number> = {};

    expenses.forEach((tx) => {
      if (tx.category) {
        const catKey = tx.category.toLowerCase();
        spendMap[catKey] = (spendMap[catKey] || 0) + tx.amount;
      }
    });

    // 4. OFFLINE CALCULATION: Add offline pending expenses
    const pendingQueue = await getPendingQueue();
    pendingQueue.forEach((tx) => {
      if (tx.type === 'expense' && tx.category) {
        const catKey = tx.category.toLowerCase();
        spendMap[catKey] = (spendMap[catKey] || 0) + tx.amount;
      }
    });

    // 5. Combine and calculate states
    const enriched = baseCategories
      .filter((cat) => !INCOME_EMOJI_KEYS.has((cat.emoji ?? '').toLowerCase()))
      .map((cat) => {
        const spent = spendMap[cat.name.toLowerCase()] || 0;
        let pct = 0;
        if (cat.budget_limit && cat.budget_limit > 0) {
          pct = spent / cat.budget_limit;
        }

        let state: 'under' | 'nearing' | 'over' = 'under';
        if (cat.budget_limit) {
          if (pct >= 1) state = 'over';
          else if (pct >= 0.7) state = 'nearing';
        }

        return { ...cat, spent, pct, state };
      });

    // 6. Update state and cache
    setCategories(enriched);
    if (!catError && catData) {
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(baseCategories)).catch(() => {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategoriesAndSpend();
  }, [fetchCategoriesAndSpend]);

  return { categories, loading, refetch: fetchCategoriesAndSpend };
};