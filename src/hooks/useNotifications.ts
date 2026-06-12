import { useCallback, useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/db';
import NotificationModel, { NotificationType } from '@/db/models/Notification';
import type CategoryModel from '@/db/models/Category';
import type TransactionModel from '@/db/models/Transaction';
import { useAuth } from '@/contexts/AuthContext';
import { readNotificationPrefs } from '@/services/notificationPrefs';
import { fireImmediateIfPermitted } from '@/services/localPushScheduler';
import {
  snoozeInbox,
  SNOOZE_DURATION_MS,
} from '@/services/notificationHandlers';

export interface NotificationItem {
  id: string;
  kind: string;
  type: NotificationType;
  title: string;
  message: string;
  actionRoute?: string;
  /** Decoded deep-link params (e.g. { id } for SavingsGoal). */
  actionParams?: Record<string, unknown>;
  actionLabel?: string;
  isRead: boolean;
  createdAt: number;
}

function parseParams(raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toPlain(record: NotificationModel): NotificationItem {
  return {
    id: record.id,
    kind: record.kind,
    type: record.type,
    title: record.title,
    message: record.message,
    actionRoute: record.actionRoute,
    actionParams: parseParams(record.actionParams),
    actionLabel: record.actionLabel,
    isRead: record.isRead,
    createdAt: record.createdAt,
  };
}

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const dayKey = () => new Date().toISOString().slice(0, 10);

type SeedRow = {
  kind: string;
  type: NotificationType;
  title: string;
  message: string;
  actionRoute?: string;
  actionLabel?: string;
};

/**
 * Derive in-app notifications from the local DB.
 *
 * Each row carries a stable `kind` key (e.g. "overspend:Shopping:2026-05") so
 * repeated runs of this function in the same month don't insert duplicates of
 * the same warning. Generation is idempotent and cheap enough to run on every
 * HomeScreen focus.
 */
export async function generatePeriodicInsights(userId: string): Promise<void> {
  if (!userId) return;

  // Read prefs once up front: the budget threshold gates which warnings are
  // generated below, and the same prefs object decides which seeds raise an OS
  // ping at the end of this function.
  const prefs = await readNotificationPrefs(userId);

  const collection = database.get<NotificationModel>('notifications');
  // Dedupe against ALL rows for this user — dismissed ones included. A dismissed
  // insight must NOT be regenerated on the next HomeScreen focus; otherwise the
  // row re-appears the moment the user reopens the inbox and the dismiss looks
  // like it never stuck. Mirrors materialiseInbox's by-kind dedupe, which also
  // never resurrects a dismissed row (§3.3).
  const existing = await collection
    .query(Q.where('user_id', userId))
    .fetch();
  const existingKinds = new Set(existing.map((n) => n.kind));

  const seeds: SeedRow[] = [];
  const month = monthKey();
  const today = dayKey();

  // ── Overspend warnings (budget ≥ user's chosen threshold) ────────────────
  const categories = await database
    .get<CategoryModel>('categories')
    .query(Q.where('user_id', userId), Q.where('is_active', true))
    .fetch();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const txs = await database
    .get<TransactionModel>('transactions')
    .query(
      Q.where('user_id', userId),
      Q.where('type', 'expense'),
      Q.where('date', Q.gte(monthStart.toISOString())),
      Q.where('date', Q.lte(monthEnd.toISOString()))
    )
    .fetch();

  const spendByCat: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.isTransfer) continue;
    const cat = (tx.category ?? '').toLowerCase();
    if (!cat || cat === 'transfer') continue;
    spendByCat[cat] = (spendByCat[cat] ?? 0) + tx.amount;
  }

  for (const cat of categories) {
    if (!cat.budgetLimit || cat.budgetLimit <= 0) continue;
    if (cat.categoryType === 'income') continue;
    const spent = spendByCat[cat.name.toLowerCase()] ?? 0;
    const pct = spent / cat.budgetLimit;
    // Honour the user's configured budget-alert threshold (50/80/100%).
    if (pct < prefs.budgetThreshold / 100) continue;

    const kind = `${pct >= 1 ? 'over-budget' : 'budget-warn'}:${cat.name}:${month}`;
    if (existingKinds.has(kind)) continue;

    const remaining = Math.max(0, cat.budgetLimit - spent);
    seeds.push({
      kind,
      type: 'warning',
      title: pct >= 1 ? `${cat.name} over budget` : `${cat.name} budget alert`,
      message:
        pct >= 1
          ? `You've spent ₱${Math.round(spent).toLocaleString('en-PH')} — that's ${Math.round(pct * 100)}% of your ${cat.name} budget.`
          : `You've used ${Math.round(pct * 100)}% of your ${cat.name} budget. ₱${Math.round(remaining).toLocaleString('en-PH')} remaining this month.`,
      actionRoute: 'Categories',
      actionLabel: 'Review budget',
    });
  }

  // ── Forget tracking (no expense tx in last 2 days) ───────────────────────
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  twoDaysAgo.setHours(0, 0, 0, 0);
  const recent = await database
    .get<TransactionModel>('transactions')
    .query(
      Q.where('user_id', userId),
      Q.where('type', 'expense'),
      Q.where('date', Q.gte(twoDaysAgo.toISOString())),
      Q.take(1)
    )
    .fetch();

  if (recent.length === 0 && txs.length > 0) {
    const kind = `no-tx-2d:${today}`;
    if (!existingKinds.has(kind)) {
      seeds.push({
        kind,
        type: 'reminder',
        title: 'Forget tracking?',
        message:
          "We noticed you haven't logged any transactions in the last 2 days. Keeping your ledger updated helps maintain accurate budgets.",
        actionRoute: 'AddTransaction',
        actionLabel: 'Add transaction',
      });
    }
  }

  // ── Highest-spend insight (once per month) ───────────────────────────────
  const topEntry = Object.entries(spendByCat).sort((a, b) => b[1] - a[1])[0];
  if (topEntry && topEntry[1] > 0) {
    const kind = `top-spend:${month}`;
    if (!existingKinds.has(kind)) {
      const [topName, topAmt] = topEntry;
      const pretty = topName.charAt(0).toUpperCase() + topName.slice(1);
      seeds.push({
        kind,
        type: 'insight',
        title: `${pretty} leads your spend`,
        message: `So far this month, ${pretty} is your biggest category at ₱${Math.round(topAmt).toLocaleString('en-PH')}. Consider setting a budget cap if you don't already have one.`,
        actionRoute: 'Categories',
        actionLabel: 'Set budget',
      });
    }
  }

  if (seeds.length === 0) return;

  const now = Date.now();
  await database.write(async () => {
    for (const seed of seeds) {
      await collection.create((n) => {
        n.userId = userId;
        n.kind = seed.kind;
        n.type = seed.type;
        n.title = seed.title;
        n.message = seed.message;
        n.actionRoute = seed.actionRoute;
        n.actionLabel = seed.actionLabel;
        n.isRead = false;
        n.isDismissed = false;
        n.createdAt = now;
      });
    }
  });

  // §6.22: raise an OS notification alongside the new in-app warning, gated by
  // the matching category pref + system permission. The inbox row already
  // exists (just written above), so these fire with inboxInsert disabled.
  // `prefs` was read at the top of this function.
  for (const seed of seeds) {
    const isBudget =
      seed.kind.startsWith('budget-warn:') ||
      seed.kind.startsWith('over-budget:');
    const isInactivity = seed.kind.startsWith('no-tx-2d:');
    const allowed =
      (isBudget && prefs.budgetAlerts) ||
      (isInactivity && prefs.inactivityReminder);
    if (!allowed) continue;
    await fireImmediateIfPermitted({
      userId,
      kind: seed.kind,
      title: seed.title,
      body: seed.message,
      notificationType: seed.type,
      route: seed.actionRoute,
      channelId: isBudget ? 'budget-alerts' : 'general',
    });
  }
}

export const useNotifications = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return undefined;
    }

    const sub = database
      .get<NotificationModel>('notifications')
      .query(Q.where('user_id', userId), Q.where('is_dismissed', false))
      .observeWithColumns(['is_read', 'created_at', 'snoozed_until'])
      .subscribe((records) => {
        // Hide rows snoozed into the future — they re-surface (and the badge
        // counts them again) once their snoozed_until passes (§6.25).
        const now = Date.now();
        const list = records
          .filter((r) => !r.snoozedUntil || r.snoozedUntil <= now)
          .map(toPlain)
          .sort((a, b) => {
            if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
            return b.createdAt - a.createdAt;
          });
        setNotifications(list);
        setLoading(false);
      });

    return () => sub.unsubscribe();
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAsRead = useCallback(async (id: string) => {
    await database.write(async () => {
      const rec = await database
        .get<NotificationModel>('notifications')
        .find(id);
      if (!rec.isRead) {
        await rec.update((n) => {
          n.isRead = true;
        });
      }
    });
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const records = await database
      .get<NotificationModel>('notifications')
      .query(Q.where('user_id', userId), Q.where('is_read', false))
      .fetch();
    if (records.length === 0) return;
    await database.write(async () => {
      for (const rec of records) {
        await rec.update((n) => {
          n.isRead = true;
        });
      }
    });
  }, [userId]);

  const dismiss = useCallback(async (id: string) => {
    await database.write(async () => {
      const rec = await database
        .get<NotificationModel>('notifications')
        .find(id);
      await rec.update((n) => {
        n.isDismissed = true;
      });
    });
  }, []);

  const clearAll = useCallback(async () => {
    if (!userId) return;
    const records = await database
      .get<NotificationModel>('notifications')
      .query(Q.where('user_id', userId), Q.where('is_dismissed', false))
      .fetch();
    if (records.length === 0) return;
    await database.write(async () => {
      for (const rec of records) {
        await rec.update((n) => {
          n.isDismissed = true;
        });
      }
    });
  }, [userId]);

  // Hide a row for an hour and schedule a local re-surface. Shares the
  // notificationHandlers helper so it behaves exactly like the iOS SNOOZE_1H
  // action (§6.25).
  const snooze = useCallback(
    (item: NotificationItem) =>
      snoozeInbox(item.kind, Date.now() + SNOOZE_DURATION_MS, {
        title: item.title,
        body: item.message,
        route: item.actionRoute,
      }),
    []
  );

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    dismiss,
    snooze,
    clearAll,
  };
};
