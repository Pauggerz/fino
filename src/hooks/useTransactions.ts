import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/services/supabase';
import { Transaction } from '@/types';
import { formatSectionTitle } from '@/utils/groupByDate';
import { getPendingQueue } from '@/services/syncService'; // Add this import

const PAGE_SIZE = 20;

export interface FeedTransaction extends Transaction {
  account_name: string;
  account_brand_colour: string;
  account_letter_avatar: string;
  isPending?: boolean; // Add pending flag
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
    account_name: acct.name ?? 'Unknown',
    account_brand_colour: acct.brand_colour ?? '#888888',
    account_letter_avatar: acct.letter_avatar ?? '?',
  };
}

export interface DateRange {
  from: string;
  to: string;   
}

export const useTransactions = (category?: string, dateRange?: DateRange) => {
  const [items, setItems] = useState<FeedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);

  const fetch = useCallback(
    async (reset: boolean) => {
      const start = reset ? 0 : offset.current;

      // 1. Fetch from Supabase
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

      // 2. Fetch local pending items
      const pendingQueue = await getPendingQueue();
      const mappedPending = pendingQueue.map(row => ({
        ...row,
        account_name: 'Pending Sync',
        account_brand_colour: '#F59E0B', // Amber for offline
        account_letter_avatar: 'P',
        isPending: true
      }));

      if (!error && data) {
        const mappedDb = data.map(mapRow);
        
        if (reset) {
          // Combine pending items at the top of the list
          setItems([...mappedPending, ...mappedDb]);
          offset.current = PAGE_SIZE;
        } else {
          setItems((prev) => [...prev, ...mappedDb]);
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
      const title = formatSectionTitle(tx.date || new Date().toISOString());
      if (!map[title]) map[title] = [];
      map[title].push(tx);
    });
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [items]);

  return { sections, items, loading, loadingMore, loadMore, hasMore, refetch };
};