import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Category } from '@/types';

// Keys used for income categories — exclude them from expense/budget views
const INCOME_EMOJI_KEYS = new Set([
  'salary',
  'allowance',
  'freelance',
  'business',
  'gifts',
  'investment',
]);

export interface CategoryWithSpend extends Category {
  spent: number;
  pct: number;
  state: 'under' | 'nearing' | 'over';
}

export const useCategories = () => {
  const [categories, setCategories] = useState<CategoryWithSpend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategoriesAndSpend = async () => {
    // 1. Get current month boundaries
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

    // 2. Fetch active categories
    const { data: catData, error: catError } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (catError || !catData) {
      setLoading(false);
      return;
    }

    // 3. Fetch expenses for the current month
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('type', 'expense')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    const expenses = txData && !txError ? txData : [];

    // 4. Aggregate spend per category (GROUP BY equivalent)
    const spendMap: Record<string, number> = {};
    expenses.forEach((tx) => {
      // Assuming tx.category maps to category name or ID. Lowercased for safety.
      if (tx.category) {
        const catKey = tx.category.toLowerCase();
        spendMap[catKey] = (spendMap[catKey] || 0) + tx.amount;
      }
    });

    // 5. Combine and calculate states (exclude income categories)
    const enriched = catData
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

        return {
          ...cat,
          spent,
          pct,
          state,
        };
      });

    setCategories(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategoriesAndSpend();
  }, []);

  return { categories, loading, refetch: fetchCategoriesAndSpend };
};
