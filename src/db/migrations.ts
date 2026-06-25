import {
  schemaMigrations,
  addColumns,
  createTable,
} from '@nozbe/watermelondb/Schema/migrations';

/**
 * WatermelonDB schema migration registry.
 *
 * When you bump the schema `version` in `schema.ts`, append a `{ toVersion, steps }`
 * entry here describing the structural change. Without this hook, every schema bump
 * forces a full local-DB reset on existing installs (data loss until next sync).
 */
export default schemaMigrations({
  migrations: [
    {
      // v2 — add is_transfer flag to transactions so account-to-account
      // balance moves can be filtered out of spend/budget/trend math without
      // string-matching the 'transfer' category. Backfilled on the server by
      // backend migration 013; existing local rows come in as false and get
      // corrected on the next pull.
      toVersion: 2,
      steps: [
        addColumns({
          table: 'transactions',
          columns: [{ name: 'is_transfer', type: 'boolean' }],
        }),
      ],
    },
    {
      // v3 — recurring tables.
      // NOTE: do not add steps here. An earlier revision of this entry also
      // added `transaction_datetime` to `transactions`, but devices that
      // already ran v3 against the original (pre-amend) version skip this
      // block on relaunch, leaving the column missing. The column is added
      // in v4 instead so those devices pick it up.
      toVersion: 3,
      steps: [
        createTable({
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
            { name: 'cadence', type: 'string' },
            { name: 'anchor_date', type: 'string' },
            { name: 'next_due_at', type: 'string', isIndexed: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'last_posted_at', type: 'string', isOptional: true },
            { name: 'server_created_at', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
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
      ],
    },
    {
      // v4 — add transaction_datetime to transactions. Split out from v3 so
      // devices already stamped at v3 (which never received this column)
      // pick it up on next launch.
      toVersion: 4,
      steps: [
        addColumns({
          table: 'transactions',
          columns: [
            { name: 'transaction_datetime', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v5 — add category to recurring_incomes (incomes can now carry a
      // category like 'Salary' that flows into the transaction created when
      // the user taps "Mark Received").
      toVersion: 5,
      steps: [
        addColumns({
          table: 'recurring_incomes',
          columns: [{ name: 'category', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      // v6 — promote category_type from an implicit name/key filter to a
      // first-class column on categories. Server already has it (via
      // supabase/add_income_categories.sql); the next sync pull fills local
      // rows. Until then, missing values are treated as 'expense'.
      toVersion: 6,
      steps: [
        addColumns({
          table: 'categories',
          columns: [
            { name: 'category_type', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v7 — local-only notifications table. Holds derived insights/warnings
      // (e.g. "you're at 90% of your Shopping budget"). Not synced to Supabase
      // — these are device-local computations regenerated on app load, and
      // syncing them would just create cross-device duplicates.
      toVersion: 7,
      steps: [
        createTable({
          name: 'notifications',
          columns: [
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'kind', type: 'string', isIndexed: true },
            { name: 'type', type: 'string' },
            { name: 'title', type: 'string' },
            { name: 'message', type: 'string' },
            { name: 'action_route', type: 'string', isOptional: true },
            { name: 'action_label', type: 'string', isOptional: true },
            { name: 'is_read', type: 'boolean', isIndexed: true },
            { name: 'is_dismissed', type: 'boolean' },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v8 — push notifications subsystem.
      //   • notification_prefs: synced per-user settings (id === user_id) so
      //     server dispatchers honour the same toggles. Replaces the
      //     AsyncStorage-only NotificationPrefsContext (migrated on first load).
      //   • notifications.snoozed_until: supports the snooze flow (§6.25).
      toVersion: 8,
      steps: [
        createTable({
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
        addColumns({
          table: 'notifications',
          columns: [{ name: 'snoozed_until', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      // v9 — local-only chat history for the Fino chatbot. The chat is now
      // offline-first (replies come from src/intelligence/convo/brain.ts, not
      // Gemini) and the thread persists on device. NOT synced to Supabase —
      // it's intentionally absent from SYNCED_TABLES, so conversations never
      // leave the device.
      toVersion: 9,
      steps: [
        createTable({
          name: 'chat_messages',
          columns: [
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'role', type: 'string' },
            { name: 'text', type: 'string' },
            { name: 'payload', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
          ],
        }),
      ],
    },
    {
      // v10 — notifications.action_params: JSON-encoded deep-link params so an
      // inbox-card tap routes identically to a push tap (e.g. SavingsGoal needs
      // { id }). Local-only table — no server column to round-trip.
      toVersion: 10,
      steps: [
        addColumns({
          table: 'notifications',
          columns: [{ name: 'action_params', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      // v11 — debts.direction: the Debt Tracker now models both receivables
      // ('owed_to_me') and the user's own payables ('i_owe'). Optional column;
      // existing rows come in as null and are treated as receivables (the
      // pre-migration meaning). Server backfills to 'owed_to_me' via
      // supabase/add_debt_direction.sql; the next sync pull fills it in.
      toVersion: 11,
      steps: [
        addColumns({
          table: 'debts',
          columns: [{ name: 'direction', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
