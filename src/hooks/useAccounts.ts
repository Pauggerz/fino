import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import { Account } from '@/types';

/* eslint-disable import/prefer-default-export */

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (!error && data) setAccounts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return { accounts, totalBalance, loading, refetch: fetchAccounts };
};
