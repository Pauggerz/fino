import type { Account } from '@/types';
import {
  saveAdjustment as localSaveAdjustment,
  saveTransfer as localSaveTransfer,
  updateAccount,
} from './localMutations';

/**
 * Thin compatibility layer — preserves the original API surface while routing
 * writes through WatermelonDB. Delete once every caller imports from
 * `@/services/localMutations` directly.
 */

export async function saveAdjustment(params: {
  account: Account;
  currentBalance: number;
  newBalance: number;
  note: string;
}): Promise<void> {
  await localSaveAdjustment({
    userId: params.account.user_id,
    accountId: params.account.id,
    currentBalance: params.currentBalance,
    newBalance: params.newBalance,
    note: params.note,
  });
}

export async function saveTransfer(params: {
  sourceAccount: Account;
  destAccount: Account;
  amount: number;
}): Promise<void> {
  await localSaveTransfer({
    userId: params.sourceAccount.user_id,
    sourceAccountId: params.sourceAccount.id,
    sourceAccountName: params.sourceAccount.name,
    destAccountId: params.destAccount.id,
    destAccountName: params.destAccount.name,
    amount: params.amount,
  });
}

export async function saveEditAccount(params: {
  accountId: string;
  name: string;
  type: string;
}): Promise<void> {
  await updateAccount(params.accountId, { name: params.name, type: params.type });
}
