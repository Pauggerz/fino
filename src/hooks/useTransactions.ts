import { useCallback, useEffect, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/db';
import type AccountModel from '@/db/models/Account';
import type TransactionModel from '@/db/models/Transaction';
import { useAuth } from '@/contexts/AuthContext';
import { triggerSync } from '@/services/watermelonSync';
import { Transaction } from '@/types';
import { formatRowTime, formatSectionTitle } from '@/utils/groupByDate';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

export interface FeedTransaction extends Transaction {
  account_name: string;
  account_brand_colour: string;
  account_letter_avatar: string;
  // Pre-formatted at the data layer so row components don't allocate a Date +
  // Intl.DateTimeFormat per scroll frame.
  time: string;
  isPending?: boolean;
}

export interface TransactionSection {
  title: string;
  data: FeedTransaction[];
}

export interface DateRange {
  from: string;
  to: string;
}

export type SortOrder = 'date_desc' | 'date_asc' | 'amount_desc';

export interface TransactionFilters {
  category?: string;
  dateRange?: DateRange;
  searchQuery?: string;
  accountId?: string;
  sortOrder?: SortOrder;
}

// Cross-mount cache for the first-paint snapshot per filter signature. Users
// bounce Home ↔ Feed constantly; without this, every revisit reflashed the
// list skeleton while SQLite re-ran the same query. visibleCount is excluded
// from the key intentionally — only the initial PAGE_SIZE paint needs to be
// instant; pagination state has its own UI affordance (loadingMore).
const txSnapshotCache = new Map<string, TransactionModel[]>();
const txSnapshotKey = (
  userId: string,
  category?: string,
  dateRange?: DateRange,
  search?: string,
  accountId?: string,
  sortOrder?: SortOrder,
  transactionType?: 'expense' | 'income',
) =>
  `${userId}|${category ?? ''}|${dateRange?.from ?? ''}-${dateRange?.to ?? ''}|${search ?? ''}|${accountId ?? ''}|${sortOrder ?? ''}|${transactionType ?? ''}`;

function modelToPlain(
  tx: TransactionModel,
  accountMap: Map<string, AccountModel>,
): FeedTransaction {
  const raw = tx._raw as Record<string, unknown>;
  const acct = accountMap.get(tx.accountId);
  return {
    id: tx.id,
    user_id: tx.userId,
    account_id: tx.accountId,
    amount: tx.amount,
    type: tx.type as 'expense' | 'income',
    category: tx.category ?? null,
    merchant_name: tx.merchantName ?? null,
    display_name: tx.displayName ?? null,
    transaction_note: tx.transactionNote ?? null,
    signal_source:
      (tx.signalSource as 'description' | 'merchant' | 'time_history' | 'manual' | null) ?? null,
    date: tx.date,
    receipt_url: tx.receiptUrl ?? null,
    account_deleted: tx.accountDeleted,
    merchant_confidence: tx.merchantConfidence ?? null,
    amount_confidence: tx.amountConfidence ?? null,
    date_confidence: tx.dateConfidence ?? null,
    created_at: (raw.server_created_at as string) ?? '',
    account_name: acct?.name ?? 'Unknown',
    account_brand_colour: acct?.brandColour ?? '#888888',
    account_letter_avatar: acct?.letterAvatar ?? '?',
    time: formatRowTime(tx.date),
  };
}

export const useTransactions = (
  category?: string,
  dateRange?: DateRange,
  searchQuery?: string,
  accountId?: string,
  sortOrder?: SortOrder,
  transactionType?: 'expense' | 'income',
) => {
  const { user } = useAuth();
  const userId = user?.id;
  const initialCacheKey = userId
    ? txSnapshotKey(
        userId,
        category,
        dateRange,
        searchQuery ?? '',
        accountId,
        sortOrder,
        transactionType,
      )
    : null;
  const initialCached = initialCacheKey
    ? txSnapshotCache.get(initialCacheKey)
    : undefined;

  const [txRecords, setTxRecords] = useState<TransactionModel[]>(
    initialCached ?? [],
  );
  const [accountMap, setAccountMap] = useState<Map<string, AccountModel>>(new Map());
  const [loading, setLoading] = useState(!initialCached);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery ?? '');

  // Debounce search input so typing doesn't re-query SQLite on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery ?? ''), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset pagination whenever filters change (but not when visibleCount itself changes).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, dateRange, debouncedSearch, accountId, sortOrder, transactionType]);

  const clauses = useMemo(() => {
    const parts: Q.Clause[] = [];
    if (transactionType) parts.push(Q.where('type', transactionType));
    if (category && category !== 'All') {
      if (category === 'Income') parts.push(Q.where('type', 'income'));
      else parts.push(Q.where('category', Q.like(Q.sanitizeLikeString(category))));
    }
    if (dateRange) {
      parts.push(Q.where('date', Q.gte(dateRange.from)));
      parts.push(Q.where('date', Q.lte(dateRange.to)));
    }
    if (accountId) parts.push(Q.where('account_id', accountId));

    const needle = debouncedSearch.trim();
    if (needle) {
      const like = `%${Q.sanitizeLikeString(needle)}%`;
      parts.push(
        Q.or(
          Q.where('display_name', Q.like(like)),
          Q.where('merchant_name', Q.like(like)),
          Q.where('category', Q.like(like)),
        ),
      );
    }

    if (sortOrder === 'amount_desc') parts.push(Q.sortBy('amount', Q.desc));
    else if (sortOrder === 'date_asc') parts.push(Q.sortBy('date', Q.asc));
    else parts.push(Q.sortBy('date', Q.desc));

    // +1 so we can tell whether there are more rows beyond the visible window.
    parts.push(Q.take(visibleCount + 1));

    return parts;
  }, [category, dateRange, debouncedSearch, accountId, sortOrder, transactionType, visibleCount]);

  // Accounts subscription — kept separate so renaming an account doesn't
  // re-run the transaction query. The account map just re-emits, the useMemo
  // below maps against the latest map.
  useEffect(() => {
    if (!userId) {
      setAccountMap(new Map());
      return;
    }
    const sub = database
      .get<AccountModel>('accounts')
      .query(Q.where('user_id', userId))
      .observeWithColumns(['name', 'brand_colour', 'letter_avatar'])
      .subscribe((records) => {
        const map = new Map<string, AccountModel>();
        for (const a of records) map.set(a.id, a);
        setAccountMap(map);
      });
    return () => sub.unsubscribe();
  }, [userId]);

  const cacheKey = useMemo(
    () =>
      userId
        ? txSnapshotKey(
            userId,
            category,
            dateRange,
            debouncedSearch,
            accountId,
            sortOrder,
            transactionType,
          )
        : null,
    [userId, category, dateRange, debouncedSearch, accountId, sortOrder, transactionType],
  );

  // Transactions subscription — re-subscribes when filters or visibleCount change.
  // Note: we deliberately do NOT setLoading(true) on every effect run. If the
  // consumer already has cached rows for this filter signature, the list
  // should keep rendering them while the observable catches up.
  useEffect(() => {
    if (!userId) {
      setTxRecords([]);
      setLoading(false);
      return;
    }

    const sub = database
      .get<TransactionModel>('transactions')
      .query(Q.where('user_id', userId), ...clauses)
      .observeWithColumns([
        'amount',
        'type',
        'date',
        'is_transfer',
        'category',
        'merchant_name',
        'display_name',
        'account_id',
      ])
      .subscribe((records) => {
        setTxRecords(records);
        setLoading(false);
        if (cacheKey) txSnapshotCache.set(cacheKey, records);
      });

    return () => sub.unsubscribe();
  }, [clauses, userId, cacheKey]);

  const hasMore = txRecords.length > visibleCount;

  const items = useMemo(() => {
    const sliced = hasMore ? txRecords.slice(0, visibleCount) : txRecords;
    return sliced.map((tx) => modelToPlain(tx, accountMap));
  }, [txRecords, accountMap, visibleCount, hasMore]);

  const loadMore = useCallback(() => {
    if (hasMore) setVisibleCount((prev) => prev + PAGE_SIZE);
  }, [hasMore]);

  const refetch = useCallback(async () => {
    // Observables auto-refresh local data — kick a sync so pull-to-refresh
    // actually pulls down anything new from the server.
    await triggerSync();
  }, []);

  const sections: TransactionSection[] = useMemo(() => {
    const map: Record<string, FeedTransaction[]> = {};
    items.forEach((tx) => {
      const title = formatSectionTitle(tx.date || new Date().toISOString());
      if (!map[title]) map[title] = [];
      map[title].push(tx);
    });
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [items]);

  return {
    sections,
    items,
    loading,
    loadingMore: false,
    loadMore,
    hasMore,
    refetch,
  };
};
