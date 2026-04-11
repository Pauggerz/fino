import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/services/supabase';
import { Transaction } from '@/types';
import { formatSectionTitle } from '@/utils/groupByDate';
import { getPendingQueue } from '@/services/syncService';

const PAGE_SIZE = 20;

export interface FeedTransaction extends Transaction {
  account_name: string;
  account_brand_colour: string;
  account_letter_avatar: string;
  isPending?: boolean;
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
  from: string; // ISO string
  to: string; // ISO string
}

export type SortOrder = 'date_desc' | 'date_asc' | 'amount_desc';

export interface TransactionFilters {
  category?: string;
  dateRange?: DateRange;
  searchQuery?: string;
  accountId?: string;
  sortOrder?: SortOrder;
}

export const useTransactions = (
  category?: string,
  dateRange?: DateRange,
  searchQuery?: string,
  accountId?: string,
  sortOrder?: SortOrder,
  transactionType?: 'expense' | 'income'
) => {
  const [items, setItems] = useState<FeedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);

  const fetch = useCallback(
    async (reset: boolean) => {
      const start = reset ? 0 : offset.current;

      // 1. Fetch from Supabase
      const order = sortOrder === 'date_asc' ? true : false;
      let q = supabase
        .from('transactions')
        .select('*, accounts(name, brand_colour, letter_avatar)')
        .order('date', { ascending: order })
        .range(start, start + PAGE_SIZE - 1);

      if (sortOrder === 'amount_desc') {
        q = supabase
          .from('transactions')
          .select('*, accounts(name, brand_colour, letter_avatar)')
          .order('amount', { ascending: false })
          .range(start, start + PAGE_SIZE - 1);
      }

      if (transactionType) {
        q = q.eq('type', transactionType);
      }

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

      if (accountId) {
        q = q.eq('account_id', accountId);
      }

      if (searchQuery && searchQuery.trim().length > 0) {
        const term = searchQuery.trim();
        q = q.or(
          `display_name.ilike.%${term}%,merchant_name.ilike.%${term}%,category.ilike.%${term}%`
        );
      }

      const { data, error } = await q;

      // 2. Fetch local pending items
      const pendingQueue = await getPendingQueue();
      const searchTerm = searchQuery?.trim().toLowerCase() ?? '';
      const fromTs = dateRange ? new Date(dateRange.from).getTime() : undefined;
      const toTs = dateRange ? new Date(dateRange.to).getTime() : undefined;

      const filteredPending = pendingQueue.filter((row: any) => {
        if (transactionType && row.type !== transactionType) return false;

        if (category && category !== 'All') {
          if (category === 'Income') {
            if (row.type !== 'income') return false;
          } else if ((row.category ?? '').toLowerCase() !== category.toLowerCase()) {
            return false;
          }
        }

        if (typeof fromTs === 'number' && typeof toTs === 'number') {
          const rowTs = new Date(row.date).getTime();
          if (Number.isNaN(rowTs) || rowTs < fromTs || rowTs > toTs) return false;
        }

        if (accountId && row.account_id !== accountId) return false;

        if (searchTerm.length > 0) {
          const haystack = `${row.display_name ?? ''} ${row.merchant_name ?? ''} ${row.category ?? ''} ${row.amount ?? ''}`.toLowerCase();
          if (!haystack.includes(searchTerm)) return false;
        }

        return true;
      });

      const mappedPending = filteredPending.map((row) => ({
        ...row,
        account_name: 'Pending Sync',
        account_brand_colour: '#F59E0B',
        account_letter_avatar: 'P',
        isPending: true,
      }));

      if (!error && data) {
        const mappedDb = data.map(mapRow);
        
        if (reset) {
          setItems([...mappedPending, ...mappedDb]);
          offset.current = PAGE_SIZE;
        } else {
          setItems((prev) => [...prev, ...mappedDb]);
          offset.current = start + PAGE_SIZE;
        }
        setHasMore(data.length === PAGE_SIZE);
      } else if (error && reset) {
        // OFFLINE FALLBACK: Preserve old items, just update pending queue
        setItems((prev) => {
          const withoutPending = prev.filter(tx => !tx.isPending);
          return [...mappedPending, ...withoutPending];
        });
        setHasMore(false);
      }
    },
    [category, dateRange, searchQuery, accountId, sortOrder, transactionType]
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