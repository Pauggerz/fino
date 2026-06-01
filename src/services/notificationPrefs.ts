import { database } from '@/db';
import NotificationPrefsModel from '@/db/models/NotificationPrefs';
import { triggerSync } from './watermelonSync';

/**
 * Canonical notification-preferences shape, defaults, and DB readers.
 *
 * Lives in services (not the context) so non-React callers — the local
 * scheduler, sign-out cleanup — can read prefs directly from WatermelonDB
 * without importing React context. NotificationPrefsContext re-exports the type
 * and defaults for back-compat with existing screen imports.
 */
export interface NotificationPrefs {
  pushEnabled: boolean;
  billReminders: boolean;
  billReminderDaysBefore: 0 | 1 | 2 | 3;
  billReminderHour: number; // 0–23
  budgetAlerts: boolean;
  budgetThreshold: 50 | 80 | 100;
  weeklyDigest: boolean;
  weeklyDigestDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun=0
  weeklyDigestHour: number;
  inactivityReminder: boolean;
  goalMilestones: boolean;
  paydayReminders: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // hour 0–23
  quietHoursEnd: number;
  hideAmountsOnLockscreen: boolean;
  rateLimitPerDay: number;
  timezone: string; // IANA, e.g. 'Asia/Manila'
}

const guessTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila';
  } catch {
    return 'Asia/Manila';
  }
};

export const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  billReminders: true,
  billReminderDaysBefore: 1,
  billReminderHour: 9,
  budgetAlerts: true,
  budgetThreshold: 80,
  weeklyDigest: true,
  weeklyDigestDay: 0,
  weeklyDigestHour: 20,
  inactivityReminder: false,
  goalMilestones: true,
  paydayReminders: false,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  hideAmountsOnLockscreen: true,
  rateLimitPerDay: 10,
  timezone: guessTimezone(),
};

const PREFS_TABLE = 'notification_prefs';

/** Project a WatermelonDB row onto the plain prefs object the app uses. */
export function mapModelToPrefs(m: NotificationPrefsModel): NotificationPrefs {
  return {
    pushEnabled: m.pushEnabled,
    billReminders: m.billReminders,
    billReminderDaysBefore: m.billReminderDaysBefore as 0 | 1 | 2 | 3,
    billReminderHour: m.billReminderHour,
    budgetAlerts: m.budgetAlerts,
    budgetThreshold: m.budgetThreshold as 50 | 80 | 100,
    weeklyDigest: m.weeklyDigest,
    weeklyDigestDay: m.weeklyDigestDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    weeklyDigestHour: m.weeklyDigestHour,
    inactivityReminder: m.inactivityReminder,
    goalMilestones: m.goalMilestones,
    paydayReminders: m.paydayReminders,
    quietHoursEnabled: m.quietHoursEnabled,
    quietHoursStart: m.quietHoursStart,
    quietHoursEnd: m.quietHoursEnd,
    hideAmountsOnLockscreen: m.hideAmountsOnLockscreen,
    rateLimitPerDay: m.rateLimitPerDay,
    timezone: m.timezone || DEFAULT_PREFS.timezone,
  };
}

/**
 * Read the user's prefs row (id === user_id) from WatermelonDB. Returns
 * DEFAULT_PREFS when the row doesn't exist yet (pre-migration / pre-first-sync).
 */
export async function readNotificationPrefs(
  userId: string
): Promise<NotificationPrefs> {
  if (!userId) return DEFAULT_PREFS;
  try {
    const row = await database
      .get<NotificationPrefsModel>(PREFS_TABLE)
      .find(userId);
    return mapModelToPrefs(row);
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Apply a partial prefs patch onto a WatermelonDB model instance. */
function applyPrefsToModel(
  m: NotificationPrefsModel,
  p: Partial<NotificationPrefs>
): void {
  if (p.pushEnabled !== undefined) m.pushEnabled = p.pushEnabled;
  if (p.billReminders !== undefined) m.billReminders = p.billReminders;
  if (p.billReminderDaysBefore !== undefined)
    m.billReminderDaysBefore = p.billReminderDaysBefore;
  if (p.billReminderHour !== undefined) m.billReminderHour = p.billReminderHour;
  if (p.budgetAlerts !== undefined) m.budgetAlerts = p.budgetAlerts;
  if (p.budgetThreshold !== undefined) m.budgetThreshold = p.budgetThreshold;
  if (p.weeklyDigest !== undefined) m.weeklyDigest = p.weeklyDigest;
  if (p.weeklyDigestDay !== undefined) m.weeklyDigestDay = p.weeklyDigestDay;
  if (p.weeklyDigestHour !== undefined) m.weeklyDigestHour = p.weeklyDigestHour;
  if (p.inactivityReminder !== undefined)
    m.inactivityReminder = p.inactivityReminder;
  if (p.goalMilestones !== undefined) m.goalMilestones = p.goalMilestones;
  if (p.paydayReminders !== undefined) m.paydayReminders = p.paydayReminders;
  if (p.quietHoursEnabled !== undefined)
    m.quietHoursEnabled = p.quietHoursEnabled;
  if (p.quietHoursStart !== undefined) m.quietHoursStart = p.quietHoursStart;
  if (p.quietHoursEnd !== undefined) m.quietHoursEnd = p.quietHoursEnd;
  if (p.hideAmountsOnLockscreen !== undefined)
    m.hideAmountsOnLockscreen = p.hideAmountsOnLockscreen;
  if (p.rateLimitPerDay !== undefined) m.rateLimitPerDay = p.rateLimitPerDay;
  if (p.timezone !== undefined) m.timezone = p.timezone;
}

/**
 * Create-or-update the user's prefs row (id === user_id) and kick a background
 * sync so the change reaches Supabase (and thus the dispatchers). When creating,
 * any unspecified fields fall back to DEFAULT_PREFS.
 */
export async function upsertLocalPrefs(
  userId: string,
  patch: Partial<NotificationPrefs>
): Promise<void> {
  if (!userId) return;
  const collection = database.get<NotificationPrefsModel>(PREFS_TABLE);

  let existing: NotificationPrefsModel | null = null;
  try {
    existing = await collection.find(userId);
  } catch {
    existing = null;
  }

  await database.write(async () => {
    if (existing) {
      await existing.update((m) => applyPrefsToModel(m, patch));
    } else {
      await collection.create((m) => {
        // eslint-disable-next-line no-underscore-dangle
        m._raw.id = userId; // id === user_id (singleton-per-user invariant)
        m.userId = userId;
        applyPrefsToModel(m, { ...DEFAULT_PREFS, ...patch });
      });
    }
  });

  triggerSync().catch((err) => {
    if (__DEV__) console.warn('[notificationPrefs] sync failed:', err);
  });
}
