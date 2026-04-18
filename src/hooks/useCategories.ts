import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { supabase } from '@/services/supabase';
import { Category } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingQueue } from '@/services/syncService';

// Keys used for income categories — exclude them from expense/budget views
const INCOME_EMOJI_KEYS = new Set([
  'salary',
  'allowance',
  'freelance',
  'business',
  'gifts',
  'investment',
]);

const CACHE_KEY = 'FINO_CATEGORIES_CACHE';

export interface CategoryWithSpend extends Category {
  spent: number;
  pct: number;
  state: 'under' | 'nearing' | 'over';
}

const STALE_WINDOW_MS = 15_000;

export const useCategories = () => {
  const [categories, setCategories] = useState<CategoryWithSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const lastFetchedAt = useRef(0);

  const fetchCategoriesAndSpend = useCallback(async (force = false) => {
    if (isFetchingRef.current) return;
    if (!force && Date.now() - lastFetchedAt.current < STALE_WINDOW_MS) return;
    isFetchingRef.current = true;
    try {
    let baseCategories: Category[] = [];
    let hasCachedData = false;

    // 1. Load from local cache first
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedData) {
        baseCategories = JSON.parse(cachedData);
        hasCachedData = true;
      } else {
        // No cache — show spinner on first boot only
        setLoading(true);
      }
    } catch (e) {
      if (__DEV__) console.error('Failed to load categories cache', e);
      setLoading(true);
    }

    // Immediately surface cached categories so the UI renders without waiting
    if (hasCachedData) {
      setLoading(false);
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
      setError(null);
    } else if (catError) {
      setError(catError.message ?? 'Failed to load categories');
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
    startTransition(() => {
      setCategories(enriched);
      setLoading(false);
    });
    if (!catError && catData) {
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(baseCategories)).catch((e) => {
        if (__DEV__) console.warn('[useCategories] cache write failed:', e);
      });
    }
    lastFetchedAt.current = Date.now();
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchCategoriesAndSpend();
  }, [fetchCategoriesAndSpend]);

  return { categories, loading, error, refetch: fetchCategoriesAndSpend };
};