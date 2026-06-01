import { Platform } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import * as Notifications from 'expo-notifications';

import { database } from '@/db';
import NotificationModel from '@/db/models/Notification';
import { supabase } from './supabase';
import { routeFromPayload } from './notificationRouter';
import { PAYLOAD_VERSION, type NotificationData } from './notificationTypes';

/**
 * Receive path: foreground presentation, inbox materialisation, badge sync,
 * deep-link routing on tap, and cold-start handling.
 *
 * One inbox row per `kind` is the single source of truth (§3.3) — both rails
 * (local schedule + server push) funnel through materialiseInbox so the inbox
 * and OS tray stay coherent. Web is a no-op.
 */

interface ContentFallback {
  title?: string | null;
  body?: string | null;
}

/** Install the foreground presentation policy. Call once at app init. */
export function setForegroundNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, // SDK 51+ split from shouldShowAlert
      shouldShowList: true,
      shouldPlaySound: false, // quiet in-app; respect a calm UX
      shouldSetBadge: true,
    }),
  });
}

/** iOS actionable-notification categories (§6.15). No-op on Android/web. */
export async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.setNotificationCategoryAsync('BILL_DUE', [
      {
        identifier: 'MARK_PAID',
        buttonTitle: 'Mark paid',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'SNOOZE_1H',
        buttonTitle: 'Snooze 1h',
        options: { opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync('BUDGET_ALERT', [
      {
        identifier: 'OPEN_BUDGET',
        buttonTitle: 'Review budget',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (err) {
    if (__DEV__)
      console.warn('[notificationHandlers] category register failed:', err);
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

const notificationsCollection = () =>
  database.get<NotificationModel>('notifications');

/**
 * Insert (or no-op) an inbox row for a delivered notification, deduped by
 * (user_id, kind). Dismissed rows are never resurrected (§3.3). Honours payload
 * version skew (§6.10).
 */
export async function materialiseInbox(
  data: Partial<NotificationData> | undefined,
  fallback: ContentFallback
): Promise<void> {
  if (!data || !data.inboxInsert || !data.kind) return;

  if (typeof data.v === 'number' && data.v > PAYLOAD_VERSION) {
    // Newer payload than this client understands — the OS notification already
    // showed; skip inbox insert rather than guess at fields.
    if (__DEV__)
      console.warn('[notificationHandlers] payload version skew', data.v);
    return;
  }

  const userId = await currentUserId();
  if (!userId) return;

  const existing = await notificationsCollection()
    .query(Q.where('user_id', userId), Q.where('kind', data.kind))
    .fetch();
  if (existing.length > 0) return; // present (read or dismissed) — leave as-is

  const now = Date.now();
  await database.write(async () => {
    await notificationsCollection().create((n) => {
      n.userId = userId;
      n.kind = data.kind as string;
      n.type = data.notification_type ?? 'reminder';
      n.title = data.title ?? fallback.title ?? 'Notification';
      n.message = data.body ?? fallback.body ?? '';
      n.actionRoute = data.route;
      n.actionLabel = data.actionLabel;
      n.isRead = false;
      n.isDismissed = false;
      n.createdAt = now;
    });
  });
}

async function markInboxRead(kind?: string): Promise<void> {
  if (!kind) return;
  const userId = await currentUserId();
  if (!userId) return;
  const rows = await notificationsCollection()
    .query(Q.where('user_id', userId), Q.where('kind', kind))
    .fetch();
  const unread = rows.filter((r) => !r.isRead);
  if (unread.length === 0) return;
  await database.write(async () => {
    for (const r of unread) {
      await r.update((n) => {
        n.isRead = true;
      });
    }
  });
}

/** Set the OS badge to the current unread (non-dismissed, non-snoozed) count. */
export async function syncBadgeCount(): Promise<void> {
  if (Platform.OS === 'web') return;
  const userId = await currentUserId();
  if (!userId) {
    await Notifications.setBadgeCountAsync(0);
    return;
  }
  const rows = await notificationsCollection()
    .query(
      Q.where('user_id', userId),
      Q.where('is_dismissed', false),
      Q.where('is_read', false)
    )
    .fetch();
  const now = Date.now();
  const count = rows.filter(
    (r) => !r.snoozedUntil || r.snoozedUntil <= now
  ).length;
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Handle an iOS action-button tap (§6.15). Returns true when the action was
 * consumed (so the caller should not also navigate). Mutations are dynamically
 * imported to keep this early-loaded module light. Best-effort: reliable while
 * JS is running (foreground / background-alive); a dead-killed background action
 * would need a TaskManager headless task, deferred.
 */
async function handleAction(
  actionId: string,
  data: Partial<NotificationData> | undefined
): Promise<boolean> {
  if (!data?.kind) return false;

  if (actionId === 'SNOOZE_1H') {
    const { scheduleOneOff } = await import('./localPushScheduler');
    await scheduleOneOff(`${data.kind}:snooze`, Date.now() + 60 * 60 * 1000, {
      title: data.title ?? 'Reminder',
      body: data.body ?? '',
      route: data.route,
      notification_type: data.notification_type,
      entityId: data.entityId,
      inboxInsert: false,
      channelId: 'bill-reminders',
    });
    return true;
  }

  if (actionId === 'MARK_PAID' && data.entityId) {
    const { updateBillReminder, markRecurringBillPaid } =
      await import('./localMutations');
    if (data.kind.startsWith('recurring-bill:')) {
      await markRecurringBillPaid(data.entityId);
    } else {
      await updateBillReminder(data.entityId, { isPaid: true });
    }
    return true;
  }

  return false;
}

async function processResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const { content } = response.notification.request;
  const data = content.data as Partial<NotificationData> | undefined;
  // Background taps never fired the receive listener — materialise here too.
  await materialiseInbox(data, { title: content.title, body: content.body });
  await markInboxRead(data?.kind);
  await syncBadgeCount();

  const consumed = await handleAction(response.actionIdentifier, data);
  if (!consumed) routeFromPayload(data);
}

/**
 * Attach foreground receive + tap listeners. Returns an unsubscribe function.
 * Call once after the navigation container is ready.
 */
export function attachNotificationListeners(): () => void {
  if (Platform.OS === 'web') return () => {};

  const recvSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      const { content } = notification.request;
      const data = content.data as Partial<NotificationData> | undefined;
      materialiseInbox(data, { title: content.title, body: content.body })
        .then(syncBadgeCount)
        .catch((err) => {
          if (__DEV__)
            console.warn('[notificationHandlers] receive failed:', err);
        });
    }
  );

  const respSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      processResponse(response).catch((err) => {
        if (__DEV__)
          console.warn('[notificationHandlers] response failed:', err);
      });
    }
  );

  return () => {
    recvSub.remove();
    respSub.remove();
  };
}

/**
 * Handle a tap that cold-started the app (the listeners weren't mounted when it
 * happened). Call once after navigation is ready (§6.14).
 */
export async function handleColdStartNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;
  await processResponse(response);
}
