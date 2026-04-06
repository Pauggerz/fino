import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/services/supabase';
import { Transaction } from '@/types';
import { formatSectionTitle } from '@/utils/groupByDate';

const PAGE_SIZE = 20;

export interface FeedTransaction extends Transaction {
  account_name: string;
  account_brand_colour: string;
  account_letter_avatar: string;
}

export interface TransactionSection {
  title: string;
  data: FeedTransaction[];
}

function mapRow(row: any): FeedTransaction {
  const acct = row.accounts ?? {};
  return {
    ...row,
    accounts: undefined,
    account_name: acct.name ?? '',
    account_brand_colour: acct.brand_colour ?? '#888888',
    account_letter_avatar: acct.letter_avatar ?? '?',
  };
}

export interface DateRange {
  from: string; // ISO string
  to: string; // ISO string
}

/**
 * Fetches paginated transactions joined with account info.
 *
 * @param category   'All' / undefined = no filter. 'Income' = income only.
 *                   A category name filters expenses by that category.
 * @param dateRange  Optional ISO date range to restrict results to a month.
 */
export const useTransactions = (category?: string, dateRange?: DateRange) => {
  const [items, setItems] = useState<FeedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);

  const fetch = useCallback(
    async (reset: boolean) => {
      const start = reset ? 0 : offset.current;

      let q = supabase
        .from('transactions')
        .select('*, accounts(name, brand_colour, letter_avatar)')
        .order('date', { ascending: false })
        .range(start, start + PAGE_SIZE - 1);

      if (category && category !== 'All') {
        if (category === 'Income') {
          q = q.eq('type', 'income');
        } else {
          q = q.ilike('category', category);
        }
      }

      if (dateRange) {
        q = q.gte('date', dateRange.from).lte('date', dateRange.to);
      }

      const { data, error } = await q;

      if (!error && data) {
        const mapped = data.map(mapRow);
        if (reset) {
          setItems(mapped);
          offset.current = PAGE_SIZE;
        } else {
          setItems((prev) => [...prev, ...mapped]);
          offset.current = start + PAGE_SIZE;
        }
        setHasMore(data.length === PAGE_SIZE);
      }
    },
    [category, dateRange]
  );

  useEffect(() => {
    setLoading(true);
    fetch(true).finally(() => setLoading(false));
  }, [fetch]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetch(false).finally(() => setLoadingMore(false));
  }, [fetch, hasMore, loadingMore]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch(true).finally(() => setLoading(false));
  }, [fetch]);

  const sections: TransactionSection[] = useMemo(() => {
    const map: Record<string, FeedTransaction[]> = {};
    items.forEach((tx) => {
      const title = formatSectionTitle(tx.date);
      if (!map[title]) map[title] = [];
      map[title].push(tx);
    });
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [items]);

  return { sections, items, loading, loadingMore, loadMore, hasMore, refetch };
};
