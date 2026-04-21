import { useCallback, useEffect, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { combineLatest } from 'rxjs';

import { database } from '@/db';
import type AccountModel from '@/db/models/Account';
import type TransactionModel from '@/db/models/Transaction';
import { useAuth } from '@/contexts/AuthContext';
import { triggerSync } from '@/services/watermelonSync';
import { Transaction } from '@/types';
import { formatSectionTitle } from '@/utils/groupByDate';

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
  const [items, setItems] = useState<FeedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { user } = useAuth();
  const userId = user?.id;

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

    if (sortOrder === 'amount_desc') parts.push(Q.sortBy('amount', Q.desc));
    else if (sortOrder === 'date_asc') parts.push(Q.sortBy('date', Q.asc));
    else parts.push(Q.sortBy('date', Q.desc));

    return parts;
  }, [category, dateRange, searchQuery, accountId, sortOrder, transactionType]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setLoading(true);

    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const txObs = database
      .get<TransactionModel>('transactions')
      .query(Q.where('user_id', userId), ...clauses)
      .observe();
    const accountsObs = database
      .get<AccountModel>('accounts')
      .query(Q.where('user_id', userId))
      .observe();

    const sub = combineLatest([txObs, accountsObs]).subscribe(([txRecords, accRecords]) => {
      const accountMap = new Map<string, AccountModel>();
      for (const a of accRecords) accountMap.set(a.id, a);

      const needle = searchQuery?.trim().toLowerCase();
      let mapped = txRecords.map((tx) => modelToPlain(tx, accountMap));
      if (needle) {
        mapped = mapped.filter((tx) => {
          const hay = `${tx.display_name ?? ''} ${tx.merchant_name ?? ''} ${tx.category ?? ''} ${tx.amount}`.toLowerCase();
          return hay.includes(needle);
        });
      }

      setItems(mapped);
      setLoading(false);
    });

    return () => sub.unsubscribe();
  }, [clauses, searchQuery, userId]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

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
    visibleItems.forEach((tx) => {
      const title = formatSectionTitle(tx.date || new Date().toISOString());
      if (!map[title]) map[title] = [];
      map[title].push(tx);
    });
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [visibleItems]);

  return {
    sections,
    items: visibleItems,
    loading,
    loadingMore: false,
    loadMore,
    hasMore,
    refetch,
  };
};
