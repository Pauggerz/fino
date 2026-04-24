import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { debounceTime } from 'rxjs/operators';

import { database } from '@/db';
import { useAuth } from '@/contexts/AuthContext';
import { triggerSync } from '@/services/watermelonSync';
import type TransactionModel from '@/db/models/Transaction';

export interface SparklinePoint {
  id: string;
  val: number;
}

export interface MonthlyTotals {
  totalIncome: number;
  totalExpense: number;
  sparklineData: SparklinePoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
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
  return { start, end, now };
}

export const useMonthlyTotals = (): MonthlyTotals => {
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [sparklineData, setSparklineData] = useState<SparklinePoint[]>(
    Array.from({ length: 7 }, (_, i) => ({ id: `day${i}`, val: 0 })),
  );
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setTotalIncome(0);
      setTotalExpense(0);
      setSparklineData(Array.from({ length: 7 }, (_, i) => ({ id: `day${i}`, val: 0 })));
      setLoading(false);
      return;
    }

    const { start, end, now } = monthBounds();
    const query = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('date', Q.gte(start)),
        Q.where('date', Q.lte(end)),
        Q.where('account_deleted', false),
      );

    // Local-midnight normaliser keeps day buckets stable across UTC midnight
    // for users west of UTC. Mixing 'YYYY-MM-DD' strings with raw Date.now()
    // would otherwise shift today's tx into "yesterday" after 00:00 UTC.
    const startOfLocalDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const todayStart = startOfLocalDay(now);

    // Debounce collapses observer bursts from sync pulls. Without it, a 30-row
    // pull reruns the month aggregation loop 30 times — with it, once per burst.
    const sub = query
      .observeWithColumns(['amount', 'type', 'date', 'is_transfer', 'category'])
      .pipe(debounceTime(50))
      .subscribe((records) => {
      let income = 0;
      let expense = 0;
      const buckets: number[] = new Array(7).fill(0);

      for (const tx of records) {
        // Inter-account transfers are balance moves, not real income/expense.
        // The string check handles rows created before migration 013 backfilled is_transfer.
        const isTransfer = tx.isTransfer || (tx.category ?? '').toLowerCase() === 'transfer';
        if (isTransfer) continue;
        if (tx.type === 'income') income += tx.amount;
        if (tx.type === 'expense') {
          expense += tx.amount;
          if (tx.date) {
            const txStart = startOfLocalDay(new Date(tx.date));
            const dayDiff = Math.floor((todayStart - txStart) / MS_PER_DAY);
            if (dayDiff >= 0 && dayDiff < 7) buckets[6 - dayDiff] += tx.amount;
          }
        }
      }

      const maxBucket = Math.max(...buckets, 1);
      setTotalIncome(income);
      setTotalExpense(expense);
      setSparklineData(buckets.map((val, i) => ({ id: `day${i}`, val: val / maxBucket })));
      setLoading(false);
    });

    return () => sub.unsubscribe();
  }, [userId]);

  return {
    totalIncome,
    totalExpense,
    sparklineData,
    loading,
    error: null,
    refetch: triggerSync,
  };
};
