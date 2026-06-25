import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Fino local-first schema.
 *
 * Every table mirrors a row from the matching Supabase table so sync can
 * round-trip records 1:1. WatermelonDB's `id` column is reused as the
 * canonical Supabase UUID — keeping them in sync avoids having to track a
 * separate `remote_id` and simplifies the pushChanges implementation.
 *
 * `updated_at` is stored as a Unix millisecond timestamp (number) so
 * WatermelonDB can compare it cheaply during pullChanges.
 */
export default appSchema({
  version: 11,
  tables: [
    // Local-only chat history for the Fino chatbot. Deliberately NOT in
    // SYNCED_TABLES (src/services/watermelonSync.ts) — conversations stay on
    // device and never reach Supabase. No updated_at/deleted_at because the
    // table never round-trips through the sync engine.
    tableSchema({
      name: 'chat_messages',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'role', type: 'string' },
        { name: 'text', type: 'string' },
        // JSON blob for non-text message shapes (e.g. the TxConfirmCard's
        // txData). Null for plain text messages.
        { name: 'payload', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'notifications',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'kind', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'message', type: 'string' },
        { name: 'action_route', type: 'string', isOptional: true },
        // JSON-encoded deep-link params (e.g. {"id":"…"} for SavingsGoal) so an
        // inbox-card tap routes identically to the push tap. Local-only.
        { name: 'action_params', type: 'string', isOptional: true },
        { name: 'action_label', type: 'string', isOptional: true },
        { name: 'is_read', type: 'boolean', isIndexed: true },
        { name: 'is_dismissed', type: 'boolean' },
        // Snooze (§6.25): while > now, useNotifications hides the row and a
        // one-off local notification is scheduled to re-surface it.
        { name: 'snoozed_until', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    // Per-user notification preferences. Synced (id === user_id). Mirrors the
    // server public.notification_prefs table so dispatchers honour the same
    // toggles. See src/contexts/NotificationPrefsContext.tsx.
    tableSchema({
      name: 'notification_prefs',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'push_enabled', type: 'boolean' },
        { name: 'bill_reminders', type: 'boolean' },
        { name: 'bill_reminder_days_before', type: 'number' },
        { name: 'bill_reminder_hour', type: 'number' },
        { name: 'budget_alerts', type: 'boolean' },
        { name: 'budget_threshold', type: 'number' },
        { name: 'weekly_digest', type: 'boolean' },
        { name: 'weekly_digest_day', type: 'number' },
        { name: 'weekly_digest_hour', type: 'number' },
        { name: 'inactivity_reminder', type: 'boolean' },
        { name: 'goal_milestones', type: 'boolean' },
        { name: 'payday_reminders', type: 'boolean' },
        { name: 'quiet_hours_enabled', type: 'boolean' },
        { name: 'quiet_hours_start', type: 'number' },
        { name: 'quiet_hours_end', type: 'number' },
        { name: 'hide_amounts_on_lockscreen', type: 'boolean' },
        { name: 'rate_limit_per_day', type: 'number' },
        { name: 'timezone', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'accounts',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'brand_colour', type: 'string' },
        { name: 'letter_avatar', type: 'string' },
        { name: 'balance', type: 'number' },
        { name: 'starting_balance', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'is_deletable', type: 'boolean' },
        { name: 'sort_order', type: 'number' },
        { name: 'last_reconciled_at', type: 'string', isOptional: true },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'type', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'merchant_name', type: 'string', isOptional: true },
        { name: 'display_name', type: 'string', isOptional: true },
        { name: 'transaction_note', type: 'string', isOptional: true },
        { name: 'signal_source', type: 'string', isOptional: true },
        { name: 'date', type: 'string', isIndexed: true },
        { name: 'transaction_datetime', type: 'string', isOptional: true },
        { name: 'receipt_url', type: 'string', isOptional: true },
        { name: 'account_deleted', type: 'boolean' },
        { name: 'is_transfer', type: 'boolean' },
        { name: 'merchant_confidence', type: 'number', isOptional: true },
        { name: 'amount_confidence', type: 'number', isOptional: true },
        { name: 'date_confidence', type: 'number', isOptional: true },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'categories',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'emoji', type: 'string', isOptional: true },
        { name: 'tile_bg_colour', type: 'string', isOptional: true },
        { name: 'text_colour', type: 'string', isOptional: true },
        { name: 'budget_limit', type: 'number', isOptional: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'is_default', type: 'boolean' },
        { name: 'sort_order', type: 'number' },
        { name: 'category_type', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'debts',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'debtor_name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'total_amount', type: 'number' },
        { name: 'amount_paid', type: 'number' },
        // 'owed_to_me' (receivable) | 'i_owe' (payable). Optional so existing
        // rows (null) and older sync payloads round-trip; readers treat
        // anything that isn't 'i_owe' as a receivable.
        { name: 'direction', type: 'string', isOptional: true },
        { name: 'due_date', type: 'string', isOptional: true },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'savings_goals',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'target_amount', type: 'number' },
        { name: 'current_amount', type: 'number' },
        { name: 'target_date', type: 'string', isOptional: true },
        { name: 'icon', type: 'string' },
        { name: 'color', type: 'string' },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'bill_reminders',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'amount', type: 'number', isOptional: true },
        { name: 'merchant_name', type: 'string', isOptional: true },
        { name: 'due_date', type: 'string' },
        { name: 'is_recurring', type: 'boolean' },
        { name: 'is_paid', type: 'boolean' },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'recurring_incomes',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'amount', type: 'number' },
        {
          name: 'account_id',
          type: 'string',
          isOptional: true,
          isIndexed: true,
        },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'cadence', type: 'string' },
        { name: 'anchor_date', type: 'string' },
        { name: 'next_due_at', type: 'string', isIndexed: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'last_posted_at', type: 'string', isOptional: true },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'recurring_bills',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'amount', type: 'number' },
        {
          name: 'account_id',
          type: 'string',
          isOptional: true,
          isIndexed: true,
        },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'cadence', type: 'string' },
        { name: 'anchor_date', type: 'string' },
        { name: 'next_due_at', type: 'string', isIndexed: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'last_paid_at', type: 'string', isOptional: true },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'merchant_mappings',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'merchant_raw', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'server_created_at', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
