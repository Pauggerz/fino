import { useCallback, useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { combineLatest } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { database } from '@/db';
import type CategoryModel from '@/db/models/Category';
import type TransactionModel from '@/db/models/Transaction';
import { useAuth } from '@/contexts/AuthContext';
import { triggerSync } from '@/services/watermelonSync';
import type { Category } from '@/types';

// Income category names — excluded from budget views.
// Matched against `category.name` (lowercased). Was previously matched against
// `cat.emoji`, which silently never fired because `emoji` holds glyphs, not
// names — income categories were leaking into the budget UI.
const INCOME_CATEGORY_NAMES = new Set([
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

function toPlain(record: CategoryModel): Category {
  return {
    id: record.id,
    user_id: record.userId,
    name: record.name,
    emoji: record.emoji ?? null,
    tile_bg_colour: record.tileBgColour ?? null,
    text_colour: record.textColour ?? null,
    budget_limit: record.budgetLimit ?? null,
    is_active: record.isActive,
    is_default: record.isDefault,
    sort_order: record.sortOrder,
  };
}

function monthBounds() {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  ).toISOString();
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  ).toISOString();
  return { start, end };
}

// Cross-mount cache: remounts on Home ↔ Feed serve last-known categories
// synchronously instead of flashing an empty list while observables spin up.
const categoriesCache = new Map<string, CategoryWithSpend[]>();
const categoriesKey = (userId: string) => {
  const d = new Date();
  return `${userId}-${d.getFullYear()}-${d.getMonth()}`;
};

export const useCategories = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const cached = userId ? categoriesCache.get(categoriesKey(userId)) : undefined;
  const [categories, setCategories] = useState<CategoryWithSpend[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setLoading(false);
      return;
    }
    const { start, end } = monthBounds();

    const categoriesQuery = database
      .get<CategoryModel>('categories')
      .query(
        Q.where('user_id', userId),
        Q.where('is_active', true),
        Q.sortBy('sort_order', Q.asc),
      );

    const expensesQuery = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('type', 'expense'),
        Q.where('date', Q.gte(start)),
        Q.where('date', Q.lte(end)),
      );

    // Debounce collapses observer bursts (e.g. a sync pull writing 30 tx rows
    // fires 30 emissions; debounced, the downstream rebuild of spendMap runs
    // once per burst). 50ms is imperceptible to users but catches full pulls.
    const sub = combineLatest([
      categoriesQuery.observeWithColumns(['name', 'emoji', 'budget_limit', 'is_active', 'sort_order']),
      expensesQuery.observeWithColumns(['amount', 'category', 'type', 'is_transfer', 'date']),
    ]).pipe(debounceTime(50)).subscribe(
      ([categoryRecords, txRecords]) => {
        const spendMap: Record<string, number> = {};
        for (const tx of txRecords) {
          // Transfers are account movements, not category spending. String
          // check handles pre-migration-013 rows without is_transfer set.
          if (tx.isTransfer || (tx.category ?? '').toLowerCase() === 'transfer') continue;
          if (!tx.category) continue;
          const key = tx.category.toLowerCase();
          spendMap[key] = (spendMap[key] ?? 0) + tx.amount;
        }

        const enriched: CategoryWithSpend[] = categoryRecords
          .filter((cat) => !INCOME_CATEGORY_NAMES.has(cat.name.toLowerCase()))
          .map((cat) => {
            const plain = toPlain(cat);
            const spent = spendMap[plain.name.toLowerCase()] ?? 0;
            const pct = plain.budget_limit && plain.budget_limit > 0 ? spent / plain.budget_limit : 0;
            let state: 'under' | 'nearing' | 'over' = 'under';
            if (plain.budget_limit) {
              if (pct >= 1) state = 'over';
              else if (pct >= 0.7) state = 'nearing';
            }
            return { ...plain, spent, pct, state };
          });

        setCategories(enriched);
        setLoading(false);
        categoriesCache.set(categoriesKey(userId), enriched);
      },
    );

    return () => sub.unsubscribe();
  }, [userId]);

  // Stable reference — HomeScreen's useFocusEffect lists this in its deps,
  // and a fresh arrow per render used to tear down + replay the entrance
  // animation on every sync pull.
  const refetch = useCallback(async (_force?: boolean): Promise<void> => {
    await triggerSync();
  }, []);

  return { categories, loading, error: null, refetch };
};
