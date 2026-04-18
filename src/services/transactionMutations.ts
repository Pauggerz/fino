import { supabase } from '@/services/supabase';
import type { Account } from '@/types';

export async function saveAdjustment({
  account,
  currentBalance,
  newBalance,
  note,
}: {
  account: Account;
  currentBalance: number;
  newBalance: number;
  note: string;
}): Promise<void> {
  const diff = newBalance - currentBalance;
  if (diff === 0) return;

  const today = new Date().toISOString().split('T')[0];

  await supabase.from('transactions').insert({
    account_id: account.id,
    user_id: account.user_id,
    amount: Math.abs(diff),
    type: diff > 0 ? 'income' : 'expense',
    category: 'adjustment',
    merchant_name: null,
    display_name: note || 'Balance Reconciliation',
    transaction_note: note || null,
    date: today,
    receipt_url: null,
    account_deleted: false,
  });

  await supabase
    .from('accounts')
    .update({ last_reconciled_at: new Date().toISOString() })
    .eq('id', account.id);
}

export async function saveTransfer({
  sourceAccount,
  destAccount,
  amount,
}: {
  sourceAccount: Account;
  destAccount: Account;
  amount: number;
}): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('transactions').insert([
    {
      account_id: sourceAccount.id,
      user_id: sourceAccount.user_id,
      amount,
      type: 'expense',
      category: 'transfer',
      merchant_name: null,
      display_name: `Transfer to ${destAccount.name}`,
      transaction_note: null,
      date: today,
      receipt_url: null,
      account_deleted: false,
    },
    {
      account_id: destAccount.id,
      user_id: sourceAccount.user_id,
      amount,
      type: 'income',
      category: 'transfer',
      merchant_name: null,
      display_name: `Transfer from ${sourceAccount.name}`,
      transaction_note: null,
      date: today,
      receipt_url: null,
      account_deleted: false,
    },
  ]);
}

export async function saveEditAccount({
  accountId,
  name,
  type,
}: {
  accountId: string;
  name: string;
  type: string;
}): Promise<void> {
  await supabase.from('accounts').update({ name, type }).eq('id', accountId);
}
