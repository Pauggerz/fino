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

// Cross-mount cache: useAccounts is consumed by ~10 screens (Home, Feed,
// AccountDetail, More, Stats, Chat, AddTransaction, …). Without this, every
// remount briefly returned [] before the observable's first emission, which
// caused "Account not found" flashes on AccountDetail and skeleton flickers
// elsewhere. The observer overwrites the cache on every emission so it never
// goes stale within a session.
const accountsCache = new Map<string, Account[]>();

export const useAccounts = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const cached = userId ? accountsCache.get(userId) : undefined;
  const [accounts, setAccounts] = useState<Account[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

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
    const sub = query
      .observeWithColumns([
        'balance',
        'name',
        'type',
        'brand_colour',
        'letter_avatar',
        'is_active',
        'sort_order',
      ])
      .subscribe((records) => {
      const next = records.map(toPlain);
      setAccounts(next);
      setLoading(false);
      accountsCache.set(userId, next);
    });
    return () => sub.unsubscribe();
  }, [userId]);

  // Round to cents so tiny float-drift on the reduce (which changes every
  // sync pull as the accounts array re-emits) doesn't retrigger the balance
  // withTiming animation on HomeScreen and cause a visible twitch.
  const totalBalance = useMemo(
    () => Math.round(accounts.reduce((sum, a) => sum + a.balance, 0) * 100) / 100,
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
