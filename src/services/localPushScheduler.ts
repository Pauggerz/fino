import { Platform } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import * as Notifications from 'expo-notifications';

import { database } from '@/db';
import type BillReminderModel from '@/db/models/BillReminder';
import type RecurringBillModel from '@/db/models/RecurringBill';
import type RecurringIncomeModel from '@/db/models/RecurringIncome';
import {
  readNotificationPrefs,
  type NotificationPrefs,
} from './notificationPrefs';
import { copy } from './notificationCopy';
import {
  PAYLOAD_VERSION,
  isHourInQuietWindow,
  type NotificationData,
} from './notificationTypes';

/**
 * Local scheduling engine.
 *
 * Computes the desired set of OS-level scheduled notifications from the user's
 * bills + recurring bills + recurring incomes + prefs, diffs it against what is
 * actually scheduled, and reconciles. Works fully offline — these are the
 * events whose timing is known on-device.
 *
 * Every scheduled notification carries `data.managedBy === 'fino-scheduler'` so
 * reconciliation only ever cancels its own notifications, never one-offs or
 * future OS-level schedules from other sources.
 */

const CHANNELS = {
  bill: 'bill-reminders',
  budget: 'budget-alerts',
  digest: 'weekly-digest',
  general: 'general',
} as const;

interface DesiredNotification {
  kind: string;
  fireAt: number; // epoch ms, device-local
  channelId: string;
  title: string;
  body: string;
  data: NotificationData;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/** Local Date for a 'YYYY-MM-DD' day at `hour`, shifted back `daysBefore`. */
function fireDateFor(dayStr: string, daysBefore: number, hour: number): Date {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0);
  dt.setDate(dt.getDate() - daysBefore);
  return dt;
}

/** Push a fire time out of the quiet window to quietHoursEnd:00. */
function applyQuietHours(fire: Date, prefs: NotificationPrefs): Date {
  if (!prefs.quietHoursEnabled) return fire;
  const hour = fire.getHours();
  if (!isHourInQuietWindow(hour, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return fire;
  }
  const shifted = new Date(fire);
  shifted.setHours(prefs.quietHoursEnd, 0, 0, 0);
  // Late-night fire inside a wrap window (e.g. 23:00 with 22→07) belongs to the
  // *next* morning, not the same calendar day.
  if (
    prefs.quietHoursStart > prefs.quietHoursEnd &&
    hour >= prefs.quietHoursStart
  ) {
    shifted.setDate(shifted.getDate() + 1);
  }
  return shifted;
}

// ── Desired-set computation ──────────────────────────────────────────────────

async function computeDesired(
  userId: string,
  prefs: NotificationPrefs
): Promise<DesiredNotification[]> {
  if (!prefs.pushEnabled) return [];
  const now = Date.now();
  const desired: DesiredNotification[] = [];

  const push = (
    kind: string,
    fire: Date,
    channelId: string,
    content: { title: string; body: string },
    base: Omit<NotificationData, 'v' | 'kind' | 'fireAt'>
  ) => {
    const fireAdj = applyQuietHours(fire, prefs);
    const fireAt = fireAdj.getTime();
    if (fireAt <= now) return; // never schedule in the past
    desired.push({
      kind,
      fireAt,
      channelId,
      title: content.title,
      body: content.body,
      data: {
        v: PAYLOAD_VERSION,
        kind,
        fireAt,
        managedBy: 'fino-scheduler',
        ...base,
      },
    });
  };

  // ── One-off bill reminders ──────────────────────────────────────────────
  if (prefs.billReminders) {
    const bills = await database
      .get<BillReminderModel>('bill_reminders')
      .query(Q.where('user_id', userId), Q.where('is_paid', false))
      .fetch();

    for (const bill of bills) {
      if (!bill.dueDate) continue;
      const fire = fireDateFor(
        bill.dueDate,
        prefs.billReminderDaysBefore,
        prefs.billReminderHour
      );
      const days = prefs.billReminderDaysBefore;
      const content =
        days === 0
          ? copy.billDue.today(bill)
          : days === 1
            ? copy.billDue.tomorrow(bill)
            : copy.billDue.inNDays(bill, days);
      push(
        `bill-reminder:${bill.id}:${bill.dueDate}`,
        fire,
        CHANNELS.bill,
        content,
        {
          // One-off bill reminders live in the MoreScreen bills modal — the `more`
          // tab is the closest deep-link target (there is no dedicated route).
          route: 'more',
          notification_type: 'reminder',
          entityId: bill.id,
          inboxInsert: true,
          interruptionLevel: days <= 1 ? 'timeSensitive' : 'active',
          title: content.title,
          body: content.body,
          actionLabel: 'View bills',
        }
      );
    }

    // ── Recurring bills — only the next occurrence ─────────────────────────
    const recurringBills = await database
      .get<RecurringBillModel>('recurring_bills')
      .query(Q.where('user_id', userId), Q.where('is_active', true))
      .fetch();

    for (const rb of recurringBills) {
      if (!rb.nextDueAt) continue;
      const fire = fireDateFor(
        rb.nextDueAt,
        prefs.billReminderDaysBefore,
        prefs.billReminderHour
      );
      const days = prefs.billReminderDaysBefore;
      const content =
        days === 0
          ? copy.billDue.today(rb)
          : days === 1
            ? copy.billDue.tomorrow(rb)
            : copy.billDue.inNDays(rb, days);
      push(
        `recurring-bill:${rb.id}:${rb.nextDueAt}`,
        fire,
        CHANNELS.bill,
        content,
        {
          route: 'RecurringBills',
          notification_type: 'reminder',
          entityId: rb.id,
          inboxInsert: true,
          interruptionLevel: days <= 1 ? 'timeSensitive' : 'active',
          title: content.title,
          body: content.body,
          actionLabel: 'Mark paid',
        }
      );
    }
  }

  // ── Recurring income (payday) reminders ───────────────────────────────────
  if (prefs.paydayReminders) {
    const incomes = await database
      .get<RecurringIncomeModel>('recurring_incomes')
      .query(Q.where('user_id', userId), Q.where('is_active', true))
      .fetch();

    for (const inc of incomes) {
      if (!inc.nextDueAt) continue;
      // Payday fires on the morning of, at the bill-reminder hour.
      const fire = fireDateFor(inc.nextDueAt, 0, prefs.billReminderHour);
      const content = copy.payday(inc);
      push(
        `recurring-income:${inc.id}:${inc.nextDueAt}`,
        fire,
        CHANNELS.general,
        content,
        {
          route: 'RecurringIncome',
          notification_type: 'reminder',
          entityId: inc.id,
          inboxInsert: true,
          interruptionLevel: 'active',
          title: content.title,
          body: content.body,
          actionLabel: 'Log income',
        }
      );
    }
  }

  return desired;
}

// ── OS scheduling primitives ─────────────────────────────────────────────────

async function scheduleOne(item: DesiredNotification): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: item.title,
      body: item.body,
      data: item.data as unknown as Record<string, unknown>,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: item.fireAt,
      channelId: item.channelId,
    } as Notifications.NotificationTriggerInput,
  });
}

/**
 * Read all currently-scheduled notifications that we own, keyed by kind.
 * Returns the request identifier + the recorded fireAt for diffing.
 */
async function readOwnScheduled(): Promise<
  Map<string, { id: string; fireAt: number }>
> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const map = new Map<string, { id: string; fireAt: number }>();
  for (const req of all) {
    const data = req.content.data as Partial<NotificationData> | undefined;
    if (!data || data.managedBy !== 'fino-scheduler' || !data.kind) continue;
    map.set(data.kind, {
      id: req.identifier,
      fireAt: typeof data.fireAt === 'number' ? data.fireAt : 0,
    });
  }
  return map;
}

// ── Public API ────────────────────────────────────────────────────────────────

let inFlight: Promise<void> | null = null;

async function doSync(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !userId) return;

  // No permission → nothing can be displayed; clear our schedule and bail.
  const { status } = await Notifications.getPermissionsAsync();
  const prefs = await readNotificationPrefs(userId);

  const existing = await readOwnScheduled();
  const desired =
    status === 'granted' && prefs.pushEnabled
      ? await computeDesired(userId, prefs)
      : [];
  const desiredByKind = new Map(desired.map((d) => [d.kind, d]));

  // Cancel ours that are stale (gone from desired, or fire time changed).
  for (const [kind, cur] of existing) {
    const want = desiredByKind.get(kind);
    if (!want || want.fireAt !== cur.fireAt) {
      await Notifications.cancelScheduledNotificationAsync(cur.id);
    }
  }

  // Schedule desired that aren't already scheduled at the right time.
  for (const item of desired) {
    const cur = existing.get(item.kind);
    if (cur && cur.fireAt === item.fireAt) continue;
    await scheduleOne(item);
  }
}

/**
 * Reconcile OS-level scheduled notifications with current data + prefs.
 * Idempotent and single-flight: concurrent callers share one in-flight run.
 */
export function syncScheduledNotifications(userId: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doSync(userId)
    .catch((err) => {
      if (__DEV__) console.warn('[localPushScheduler] sync failed:', err);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// Debounced wrapper — coalesce bursts (e.g. editing several bills in a row).
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUserId: string | null = null;

/** Debounced reconciliation for mutation call-sites (300 ms window, §6.11). */
export function scheduleReconcile(userId: string): void {
  if (Platform.OS === 'web' || !userId) return;
  pendingUserId = userId;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (pendingUserId) syncScheduledNotifications(pendingUserId);
  }, 300);
}

/** Cancel every scheduled notification we own that tracks a given entity. */
export async function cancelScheduledForEntity(
  entityId: string
): Promise<void> {
  if (Platform.OS === 'web' || !entityId) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const req of all) {
    const data = req.content.data as Partial<NotificationData> | undefined;
    if (data?.managedBy === 'fino-scheduler' && data.entityId === entityId) {
      await Notifications.cancelScheduledNotificationAsync(req.identifier);
    }
  }
}

/** Schedule a single one-off notification (used by snooze, §6.25). */
export async function scheduleOneOff(
  kind: string,
  fireAt: number,
  payload: Omit<NotificationData, 'v' | 'kind' | 'fireAt' | 'managedBy'> & {
    title: string;
    body: string;
    channelId?: string;
  }
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;
  const { title, body, channelId = CHANNELS.general, ...rest } = payload;
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: {
        v: PAYLOAD_VERSION,
        kind,
        fireAt,
        managedBy: 'fino-scheduler',
        ...rest,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId,
    } as Notifications.NotificationTriggerInput,
  });
}

/**
 * Present a notification immediately if permission is granted (used by the
 * IntelligenceEngine to raise an OS notification alongside an in-app warning,
 * §6.22). Respects quiet hours and push_enabled. Caller gates on category prefs.
 */
export async function fireImmediateIfPermitted(seed: {
  kind: string;
  title: string;
  body: string;
  notificationType?: NotificationData['notification_type'];
  route?: string;
  channelId?: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: seed.title,
      body: seed.body,
      sound: false,
      data: {
        v: PAYLOAD_VERSION,
        kind: seed.kind,
        managedBy: 'fino-scheduler',
        route: seed.route,
        notification_type: seed.notificationType,
        // Inbox row already exists (the engine inserted it) — don't double-insert.
        inboxInsert: false,
      } satisfies NotificationData,
    },
    trigger: null, // immediate
  });
}
