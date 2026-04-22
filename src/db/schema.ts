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
  version: 2,
  tables: [
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
