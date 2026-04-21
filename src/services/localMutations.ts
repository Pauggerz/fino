import { Q } from '@nozbe/watermelondb';

import { database } from '../db';
import type AccountModel from '../db/models/Account';
import type TransactionModel from '../db/models/Transaction';
import type CategoryModel from '../db/models/Category';
import type DebtModel from '../db/models/Debt';
import type SavingsGoalModel from '../db/models/SavingsGoal';
import type BillReminderModel from '../db/models/BillReminder';
import type MerchantMappingModel from '../db/models/MerchantMapping';
import { triggerSync } from './watermelonSync';

const accounts = () => database.get<AccountModel>('accounts');
const transactions = () => database.get<TransactionModel>('transactions');
const categories = () => database.get<CategoryModel>('categories');
const debts = () => database.get<DebtModel>('debts');
const savingsGoals = () => database.get<SavingsGoalModel>('savings_goals');
const billReminders = () => database.get<BillReminderModel>('bill_reminders');
const merchantMappings = () => database.get<MerchantMappingModel>('merchant_mappings');

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

/** Fire-and-forget sync — never blocks the caller's UI. */
function syncInBackground(): void {
  triggerSync().catch((err) => {
    if (__DEV__) console.warn('[localMutations] background sync failed:', err?.message);
  });
}

export type NewTransactionInput = {
  userId: string;
  accountId: string;
  amount: number;
  type: 'expense' | 'income';
  category?: string | null;
  merchantName?: string | null;
  displayName?: string | null;
  transactionNote?: string | null;
  signalSource?: 'description' | 'merchant' | 'time_history' | 'manual' | null;
  date: string;
  receiptUrl?: string | null;
  merchantConfidence?: number | null;
  amountConfidence?: number | null;
  dateConfidence?: number | null;
  /** Pre-supplied id lets optimistic UI reference the future row immediately. */
  id?: string;
};

/**
 * Creates a transaction and atomically adjusts the source account's balance.
 * Both writes happen inside a single WatermelonDB batch — if the process is
 * killed mid-write SQLite rolls back cleanly.
 */
export async function createTransaction(input: NewTransactionInput): Promise<string> {
  const txId = input.id ?? uuidv4();
  await database.write(async () => {
    const account = await accounts().find(input.accountId);
    const delta = input.type === 'expense' ? -input.amount : input.amount;

    const txPrepared = transactions().prepareCreate((tx) => {
      tx._raw.id = txId;
      tx.userId = input.userId;
      tx.accountId = input.accountId;
      tx.amount = input.amount;
      tx.type = input.type;
      tx.category = input.category ?? undefined;
      tx.merchantName = input.merchantName ?? undefined;
      tx.displayName = input.displayName ?? undefined;
      tx.transactionNote = input.transactionNote ?? undefined;
      tx.signalSource = input.signalSource ?? undefined;
      tx.date = input.date;
      tx.receiptUrl = input.receiptUrl ?? undefined;
      tx.accountDeleted = false;
      tx.merchantConfidence = input.merchantConfidence ?? undefined;
      tx.amountConfidence = input.amountConfidence ?? undefined;
      tx.dateConfidence = input.dateConfidence ?? undefined;
    });

    const accountPrepared = account.prepareUpdate((a) => {
      a.balance = a.balance + delta;
    });

    await database.batch(txPrepared, accountPrepared);
  });

  syncInBackground();
  return txId;
}

export type UpdateTransactionPatch = {
  displayName?: string | null;
  transactionNote?: string | null;
  category?: string | null;
  merchantName?: string | null;
  accountId?: string;
  date?: string;
  amount?: number;
  type?: 'expense' | 'income';
};

/**
 * Updates a transaction and, when amount/type/account changes, rebalances the
 * affected account(s) inside the same write so no intermediate state is ever
 * visible.
 */
export async function updateTransaction(
  transactionId: string,
  patch: UpdateTransactionPatch,
): Promise<void> {
  await database.write(async () => {
    const tx = await transactions().find(transactionId);
    const prevAmount = tx.amount;
    const prevType = tx.type as 'expense' | 'income';
    const prevAccountId = tx.accountId;

    const nextAmount = patch.amount ?? prevAmount;
    const nextType = patch.type ?? prevType;
    const nextAccountId = patch.accountId ?? prevAccountId;

    const balanceMutations = [];
    const reverseDelta = prevType === 'expense' ? prevAmount : -prevAmount;
    const forwardDelta = nextType === 'expense' ? -nextAmount : nextAmount;

    if (!tx.accountDeleted) {
      if (prevAccountId === nextAccountId) {
        const net = reverseDelta + forwardDelta;
        if (net !== 0) {
          const acc = await accounts().find(prevAccountId);
          balanceMutations.push(
            acc.prepareUpdate((a) => {
              a.balance = a.balance + net;
            }),
          );
        }
      } else {
        const oldAcc = await accounts().find(prevAccountId);
        const newAcc = await accounts().find(nextAccountId);
        balanceMutations.push(
          oldAcc.prepareUpdate((a) => {
            a.balance = a.balance + reverseDelta;
          }),
          newAcc.prepareUpdate((a) => {
            a.balance = a.balance + forwardDelta;
          }),
        );
      }
    }

    const txUpdate = tx.prepareUpdate((t) => {
      if (patch.displayName !== undefined) t.displayName = patch.displayName ?? undefined;
      if (patch.transactionNote !== undefined) t.transactionNote = patch.transactionNote ?? undefined;
      if (patch.category !== undefined) t.category = patch.category ?? undefined;
      if (patch.merchantName !== undefined) t.merchantName = patch.merchantName ?? undefined;
      if (patch.accountId !== undefined) t.accountId = patch.accountId;
      if (patch.date !== undefined) t.date = patch.date;
      if (patch.amount !== undefined) t.amount = patch.amount;
      if (patch.type !== undefined) t.type = patch.type;
    });

    await database.batch(txUpdate, ...balanceMutations);
  });

  syncInBackground();
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  await database.write(async () => {
    const tx = await transactions().find(transactionId);
    const account = await accounts().find(tx.accountId);
    const reverseDelta = tx.type === 'expense' ? tx.amount : -tx.amount;

    const accountPrepared = account.prepareUpdate((a) => {
      a.balance = a.balance + reverseDelta;
    });
    const txPrepared = tx.prepareMarkAsDeleted();

    await database.batch(accountPrepared, txPrepared);
  });

  syncInBackground();
}

export async function saveAdjustment(params: {
  userId: string;
  accountId: string;
  currentBalance: number;
  newBalance: number;
  note: string;
}): Promise<void> {
  const diff = params.newBalance - params.currentBalance;
  if (diff === 0) return;
  const today = new Date().toISOString().split('T')[0];

  await database.write(async () => {
    const account = await accounts().find(params.accountId);
    const txPrepared = transactions().prepareCreate((tx) => {
      tx._raw.id = uuidv4();
      tx.userId = params.userId;
      tx.accountId = params.accountId;
      tx.amount = Math.abs(diff);
      tx.type = diff > 0 ? 'income' : 'expense';
      tx.category = 'adjustment';
      tx.displayName = params.note || 'Balance Reconciliation';
      tx.transactionNote = params.note || undefined;
      tx.date = today;
      tx.accountDeleted = false;
    });
    const accountPrepared = account.prepareUpdate((a) => {
      a.balance = params.newBalance;
      a.lastReconciledAt = new Date().toISOString();
    });
    await database.batch(txPrepared, accountPrepared);
  });

  syncInBackground();
}

export async function saveTransfer(params: {
  userId: string;
  sourceAccountId: string;
  sourceAccountName: string;
  destAccountId: string;
  destAccountName: string;
  amount: number;
}): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await database.write(async () => {
    const source = await accounts().find(params.sourceAccountId);
    const dest = await accounts().find(params.destAccountId);

    const outTx = transactions().prepareCreate((tx) => {
      tx._raw.id = uuidv4();
      tx.userId = params.userId;
      tx.accountId = params.sourceAccountId;
      tx.amount = params.amount;
      tx.type = 'expense';
      tx.category = 'transfer';
      tx.displayName = `Transfer to ${params.destAccountName}`;
      tx.date = today;
      tx.accountDeleted = false;
    });
    const inTx = transactions().prepareCreate((tx) => {
      tx._raw.id = uuidv4();
      tx.userId = params.userId;
      tx.accountId = params.destAccountId;
      tx.amount = params.amount;
      tx.type = 'income';
      tx.category = 'transfer';
      tx.displayName = `Transfer from ${params.sourceAccountName}`;
      tx.date = today;
      tx.accountDeleted = false;
    });
    const sourceUpdate = source.prepareUpdate((a) => {
      a.balance = a.balance - params.amount;
    });
    const destUpdate = dest.prepareUpdate((a) => {
      a.balance = a.balance + params.amount;
    });

    await database.batch(outTx, inTx, sourceUpdate, destUpdate);
  });

  syncInBackground();
}

export async function updateAccount(
  accountId: string,
  patch: Partial<Pick<AccountModel, 'name' | 'type' | 'brandColour' | 'letterAvatar' | 'sortOrder'>>,
): Promise<void> {
  await database.write(async () => {
    const acc = await accounts().find(accountId);
    await acc.update((a) => {
      if (patch.name !== undefined) a.name = patch.name;
      if (patch.type !== undefined) a.type = patch.type;
      if (patch.brandColour !== undefined) a.brandColour = patch.brandColour;
      if (patch.letterAvatar !== undefined) a.letterAvatar = patch.letterAvatar;
      if (patch.sortOrder !== undefined) a.sortOrder = patch.sortOrder;
    });
  });
  syncInBackground();
}

export async function createAccount(input: {
  userId: string;
  name: string;
  type: string;
  brandColour: string;
  letterAvatar: string;
  startingBalance: number;
  sortOrder?: number;
}): Promise<string> {
  const id = uuidv4();
  await database.write(async () => {
    await accounts().create((a) => {
      a._raw.id = id;
      a.userId = input.userId;
      a.name = input.name;
      a.type = input.type;
      a.brandColour = input.brandColour;
      a.letterAvatar = input.letterAvatar;
      a.balance = input.startingBalance;
      a.startingBalance = input.startingBalance;
      a.isActive = true;
      a.isDeletable = true;
      a.sortOrder = input.sortOrder ?? 0;
    });
  });
  syncInBackground();
  return id;
}

export async function deleteAccount(accountId: string): Promise<void> {
  await database.write(async () => {
    const acc = await accounts().find(accountId);
    const relatedTxs = await transactions()
      .query(Q.where('user_id', acc.userId), Q.where('account_id', accountId))
      .fetch();

    const accountDelete = acc.prepareMarkAsDeleted();
    const txUpdates = relatedTxs.map((tx) =>
      tx.prepareUpdate((t) => {
        t.accountDeleted = true;
      }),
    );

    await database.batch(accountDelete, ...txUpdates);
  });
  syncInBackground();
}

export async function createCategory(input: {
  userId: string;
  name: string;
  emoji?: string;
  tileBgColour?: string;
  textColour?: string;
  budgetLimit?: number;
  sortOrder?: number;
}): Promise<string> {
  const id = uuidv4();
  await database.write(async () => {
    await categories().create((c) => {
      c._raw.id = id;
      c.userId = input.userId;
      c.name = input.name;
      c.emoji = input.emoji;
      c.tileBgColour = input.tileBgColour;
      c.textColour = input.textColour;
      c.budgetLimit = input.budgetLimit;
      c.isActive = true;
      c.isDefault = false;
      c.sortOrder = input.sortOrder ?? 0;
    });
  });
  syncInBackground();
  return id;
}

export async function updateCategory(
  categoryId: string,
  patch: Partial<Pick<CategoryModel, 'name' | 'emoji' | 'tileBgColour' | 'textColour' | 'budgetLimit' | 'isActive' | 'sortOrder'>>,
): Promise<void> {
  await database.write(async () => {
    const cat = await categories().find(categoryId);
    await cat.update((c) => {
      if (patch.name !== undefined) c.name = patch.name;
      if (patch.emoji !== undefined) c.emoji = patch.emoji;
      if (patch.tileBgColour !== undefined) c.tileBgColour = patch.tileBgColour;
      if (patch.textColour !== undefined) c.textColour = patch.textColour;
      if (patch.budgetLimit !== undefined) c.budgetLimit = patch.budgetLimit;
      if (patch.isActive !== undefined) c.isActive = patch.isActive;
      if (patch.sortOrder !== undefined) c.sortOrder = patch.sortOrder;
    });
  });
  syncInBackground();
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await database.write(async () => {
    const cat = await categories().find(categoryId);
    await cat.markAsDeleted();
  });
  syncInBackground();
}

export async function createDebt(input: {
  userId: string;
  debtorName: string;
  description?: string;
  totalAmount: number;
  amountPaid?: number;
  dueDate?: string;
}): Promise<string> {
  const id = uuidv4();
  await database.write(async () => {
    await debts().create((d) => {
      d._raw.id = id;
      d.userId = input.userId;
      d.debtorName = input.debtorName;
      d.description = input.description;
      d.totalAmount = input.totalAmount;
      d.amountPaid = input.amountPaid ?? 0;
      d.dueDate = input.dueDate;
    });
  });
  syncInBackground();
  return id;
}

export async function updateDebt(
  debtId: string,
  patch: Partial<Pick<DebtModel, 'debtorName' | 'description' | 'totalAmount' | 'amountPaid' | 'dueDate'>>,
): Promise<void> {
  await database.write(async () => {
    const d = await debts().find(debtId);
    await d.update((rec) => {
      if (patch.debtorName !== undefined) rec.debtorName = patch.debtorName;
      if (patch.description !== undefined) rec.description = patch.description;
      if (patch.totalAmount !== undefined) rec.totalAmount = patch.totalAmount;
      if (patch.amountPaid !== undefined) rec.amountPaid = patch.amountPaid;
      if (patch.dueDate !== undefined) rec.dueDate = patch.dueDate;
    });
  });
  syncInBackground();
}

export async function deleteDebt(debtId: string): Promise<void> {
  await database.write(async () => {
    const d = await debts().find(debtId);
    await d.markAsDeleted();
  });
  syncInBackground();
}

export async function createSavingsGoal(input: {
  userId: string;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string;
  icon: string;
  color: string;
}): Promise<string> {
  const id = uuidv4();
  await database.write(async () => {
    await savingsGoals().create((g) => {
      g._raw.id = id;
      g.userId = input.userId;
      g.name = input.name;
      g.description = input.description;
      g.targetAmount = input.targetAmount;
      g.currentAmount = input.currentAmount ?? 0;
      g.targetDate = input.targetDate;
      g.icon = input.icon;
      g.color = input.color;
    });
  });
  syncInBackground();
  return id;
}

export async function updateSavingsGoal(
  goalId: string,
  patch: Partial<Pick<SavingsGoalModel, 'name' | 'description' | 'targetAmount' | 'currentAmount' | 'targetDate' | 'icon' | 'color'>>,
): Promise<void> {
  await database.write(async () => {
    const g = await savingsGoals().find(goalId);
    await g.update((rec) => {
      if (patch.name !== undefined) rec.name = patch.name;
      if (patch.description !== undefined) rec.description = patch.description;
      if (patch.targetAmount !== undefined) rec.targetAmount = patch.targetAmount;
      if (patch.currentAmount !== undefined) rec.currentAmount = patch.currentAmount;
      if (patch.targetDate !== undefined) rec.targetDate = patch.targetDate;
      if (patch.icon !== undefined) rec.icon = patch.icon;
      if (patch.color !== undefined) rec.color = patch.color;
    });
  });
  syncInBackground();
}

export async function deleteSavingsGoal(goalId: string): Promise<void> {
  await database.write(async () => {
    const g = await savingsGoals().find(goalId);
    await g.markAsDeleted();
  });
  syncInBackground();
}

export async function createBillReminder(input: {
  userId: string;
  title: string;
  amount?: number;
  merchantName?: string;
  dueDate: string;
  isRecurring?: boolean;
}): Promise<string> {
  const id = uuidv4();
  await database.write(async () => {
    await billReminders().create((b) => {
      b._raw.id = id;
      b.userId = input.userId;
      b.title = input.title;
      b.amount = input.amount;
      b.merchantName = input.merchantName;
      b.dueDate = input.dueDate;
      b.isRecurring = input.isRecurring ?? false;
      b.isPaid = false;
    });
  });
  syncInBackground();
  return id;
}

export async function updateBillReminder(
  billId: string,
  patch: Partial<Pick<BillReminderModel, 'title' | 'amount' | 'merchantName' | 'dueDate' | 'isRecurring' | 'isPaid'>>,
): Promise<void> {
  await database.write(async () => {
    const b = await billReminders().find(billId);
    await b.update((rec) => {
      if (patch.title !== undefined) rec.title = patch.title;
      if (patch.amount !== undefined) rec.amount = patch.amount;
      if (patch.merchantName !== undefined) rec.merchantName = patch.merchantName;
      if (patch.dueDate !== undefined) rec.dueDate = patch.dueDate;
      if (patch.isRecurring !== undefined) rec.isRecurring = patch.isRecurring;
      if (patch.isPaid !== undefined) rec.isPaid = patch.isPaid;
    });
  });
  syncInBackground();
}

export async function deleteBillReminder(billId: string): Promise<void> {
  await database.write(async () => {
    const b = await billReminders().find(billId);
    await b.markAsDeleted();
  });
  syncInBackground();
}

export async function upsertMerchantMapping(input: {
  userId: string;
  merchantRaw: string;
  category: string;
}): Promise<void> {
  await database.write(async () => {
    const existing = await merchantMappings()
      .query(Q.where('user_id', input.userId), Q.where('merchant_raw', input.merchantRaw))
      .fetch();
    if (existing.length > 0) {
      await existing[0].update((m) => {
        m.category = input.category;
      });
      return;
    }
    await merchantMappings().create((m) => {
      m._raw.id = uuidv4();
      m.userId = input.userId;
      m.merchantRaw = input.merchantRaw;
      m.category = input.category;
    });
  });
  syncInBackground();
}
