import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

/**
 * Per-user notification preferences.
 *
 * Synced 1:1 with the Supabase `notification_prefs` table so server-side
 * dispatchers (Edge Functions) honour the same toggles the user set on-device.
 * There is exactly one row per user and its WatermelonDB `id` is the user id
 * (id === user_id === Supabase id) — see notification_prefs.sql for why.
 */
export default class NotificationPrefs extends Model {
  static table = 'notification_prefs';

  @text('user_id') userId!: string;

  @field('push_enabled') pushEnabled!: boolean;

  @field('bill_reminders') billReminders!: boolean;

  @field('bill_reminder_days_before') billReminderDaysBefore!: number;

  @field('bill_reminder_hour') billReminderHour!: number;

  @field('budget_alerts') budgetAlerts!: boolean;

  @field('budget_threshold') budgetThreshold!: number;

  @field('weekly_digest') weeklyDigest!: boolean;

  @field('weekly_digest_day') weeklyDigestDay!: number;

  @field('weekly_digest_hour') weeklyDigestHour!: number;

  @field('inactivity_reminder') inactivityReminder!: boolean;

  @field('goal_milestones') goalMilestones!: boolean;

  @field('payday_reminders') paydayReminders!: boolean;

  @field('quiet_hours_enabled') quietHoursEnabled!: boolean;

  @field('quiet_hours_start') quietHoursStart!: number;

  @field('quiet_hours_end') quietHoursEnd!: number;

  @field('hide_amounts_on_lockscreen') hideAmountsOnLockscreen!: boolean;

  @field('rate_limit_per_day') rateLimitPerDay!: number;

  @text('timezone') timezone!: string;

  @date('updated_at') updatedAt!: Date;
}
