import { useCallback, useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/db';
import type CategoryModel from '@/db/models/Category';
import { useAuth } from '@/contexts/AuthContext';
import { triggerSync } from '@/services/watermelonSync';
import type { Category } from '@/types';

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

// Cross-mount cache keyed by user — mirrors useCategories so remounts on the
// recurring-income picker / Categories screen don't flash an empty list while
// the observable spins up.
const cache = new Map<string, Category[]>();
const cacheKey = (userId: string) => `${userId}-income`;

export const useIncomeCategories = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const cached = userId ? cache.get(cacheKey(userId)) : undefined;
  const [categories, setCategories] = useState<Category[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setLoading(false);
      return;
    }
    const sub = database
      .get<CategoryModel>('categories')
      .query(
        Q.where('user_id', userId),
        Q.where('is_active', true),
        Q.sortBy('sort_order', Q.asc)
      )
      .observeWithColumns([
        'name',
        'emoji',
        'tile_bg_colour',
        'text_colour',
        'is_active',
        'sort_order',
        'category_type',
      ])
      .subscribe((records) => {
        const seen = new Set<string>();
        const filtered = records
          .filter((c) => c.categoryType === 'income')
          .filter((c) => {
            const lower = c.name.toLowerCase();
            if (seen.has(lower)) return false;
            seen.add(lower);
            return true;
          })
          .map(toPlain);
        setCategories(filtered);
        setLoading(false);
        cache.set(cacheKey(userId), filtered);
      });

    return () => sub.unsubscribe();
  }, [userId]);

  const refetch = useCallback(async (): Promise<void> => {
    await triggerSync();
  }, []);

  return { categories, loading, error: null, refetch };
};
