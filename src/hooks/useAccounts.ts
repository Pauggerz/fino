import { useEffect, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/db';
import type AccountModel from '@/db/models/Account';
import { useAuth } from '@/contexts/AuthContext';
import { triggerSync } from '@/services/watermelonSync';
import type { Account } from '@/types';

/* eslint-disable import/prefer-default-export */

function toPlain(record: AccountModel): Account {
  const raw = record._raw as Record<string, unknown>;
  return {
    id: record.id,
    user_id: record.userId,
    name: record.name,
    type: record.type,
    brand_colour: record.brandColour,
    letter_avatar: record.letterAvatar,
    balance: record.balance,
    starting_balance: record.startingBalance,
    is_active: record.isActive,
    is_deletable: record.isDeletable,
    sort_order: record.sortOrder,
    created_at: (raw.server_created_at as string) ?? '',
    last_reconciled_at: record.lastReconciledAt ?? null,
  };
}

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    const query = database
      .get<AccountModel>('accounts')
      .query(
        Q.where('user_id', userId),
        Q.where('is_active', true),
        Q.sortBy('sort_order', Q.asc),
      );
    const sub = query.observe().subscribe((records) => {
      setAccounts(records.map(toPlain));
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [userId]);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balance, 0),
    [accounts],
  );

  return {
    accounts,
    totalBalance,
    loading,
    error: null,
    refetch: triggerSync,
  };
};
