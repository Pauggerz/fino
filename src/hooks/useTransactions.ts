import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import { Transaction } from '@/types';
import { formatSectionTitle } from '@/utils/groupByDate';
import { getPendingQueue } from '@/services/syncService';

const PAGE_SIZE = 20;

/** Deterministic cache key from the active filter combination. */
function makeCacheKey(
  category?: string,
  sortOrder?: SortOrder,
  transactionType?: string,
  accountId?: string,
): string {
  return `FINO_TX_CACHE_${category ?? ''}_${sortOrder ?? 'date_desc'}_${transactionType ?? ''}_${accountId ?? ''}`;
}

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

  // Cursor state: for date-ordered pages we track last seen (date, id).
  // For amount_desc we fall back to numeric offset to keep things simple.
  const cursorRef = useRef<{ date: string; id: string } | null>(null);
  const offsetRef = useRef(0); // used only for amount_desc

  const fetch = useCallback(
    async (reset: boolean) => {
      if (reset) {
        cursorRef.current = null;
        offsetRef.current = 0;
      }

      const isAmountDesc = sortOrder === 'amount_desc';
      const isDateAsc = sortOrder === 'date_asc';

      // ── Build base query ──────────────────────────────────────────────────
      let q = supabase
        .from('transactions')
        .select('*, accounts(name, brand_colour, letter_avatar)');

      if (isAmountDesc) {
        // amount_desc: use classic offset pagination (no stable cursor available)
        q = q
          .order('amount', { ascending: false })
          .range(offsetRef.current, offsetRef.current + PAGE_SIZE - 1);
      } else {
        // date_desc / date_asc: cursor-based pagination
        q = q
          .order('date', { ascending: isDateAsc })
          .order('id', { ascending: isDateAsc });

        if (!reset && cursorRef.current) {
          const { date: cDate, id: cId } = cursorRef.current;
          if (isDateAsc) {
            q = q.or(`date.gt.${cDate},and(date.eq.${cDate},id.gt.${cId})`);
          } else {
            q = q.or(`date.lt.${cDate},and(date.eq.${cDate},id.lt.${cId})`);
          }
        }

        q = q.limit(PAGE_SIZE);
      }

      // ── Apply filters ─────────────────────────────────────────────────────
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

      // ── Fetch local pending items ─────────────────────────────────────────
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

        // Advance cursor to last fetched row (for date-ordered queries)
        if (!isAmountDesc && data.length > 0) {
          const last = data[data.length - 1];
          cursorRef.current = { date: last.date, id: last.id };
        }
        // Advance offset for amount_desc
        if (isAmountDesc) {
          offsetRef.current += PAGE_SIZE;
        }

        startTransition(() => {
          if (reset) {
            setItems([...mappedPending, ...mappedDb]);
          } else {
            setItems((prev) => {
              // Strip pending items from prev on non-reset appends to avoid duplication
              const withoutPending = prev.filter((tx) => !tx.isPending);
              return [...mappedPending, ...withoutPending, ...mappedDb];
            });
          }
          setHasMore(data.length === PAGE_SIZE);
        });
      } else if (error && reset) {
        // OFFLINE FALLBACK: Preserve old items, just update pending queue
        startTransition(() => {
          setItems((prev) => {
            const withoutPending = prev.filter((tx) => !tx.isPending);
            return [...mappedPending, ...withoutPending];
          });
          setHasMore(false);
        });
      }
    },
    [category, dateRange, searchQuery, accountId, sortOrder, transactionType]
  );

  const cacheKey = useMemo(
    () => makeCacheKey(category, sortOrder, transactionType, accountId),
    [category, sortOrder, transactionType, accountId],
  );

  // Date-range and search are intentionally excluded from caching: they are
  // transient/user-driven filters where stale data would be confusing.
  const isCacheable = !dateRange && (!searchQuery || searchQuery.trim() === '');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // 1. Serve first-page cache immediately — skip the skeleton for returning users
      if (isCacheable) {
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw && !cancelled) {
            setItems(JSON.parse(raw));
            setLoading(false);
          }
        } catch (_) {
          // ignore cache read errors
        }
      }

      // 2. Background network fetch
      if (!cancelled) {
        if (isCacheable) {
          // Already rendered from cache — don't flash spinner on revalidation
          await fetch(true);
        } else {
          setLoading(true);
          await fetch(true);
        }
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [fetch, cacheKey, isCacheable]);

  // After a successful first-page fetch, persist to cache
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!isCacheable || items.length === 0) return;
    AsyncStorage.setItem(cacheKey, JSON.stringify(items)).catch(() => {});
  }, [items, cacheKey, isCacheable]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetch(false).finally(() => setLoadingMore(false));
  }, [fetch, hasMore, loadingMore]);

  const refetch = useCallback(() => {
    // Only show spinner if we have no data to display yet
    if (itemsRef.current.length === 0) setLoading(true);
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
