import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

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
            { name: 'account_id', type: 'string', isOptional: true, isIndexed: true },
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
            { name: 'account_id', type: 'string', isOptional: true, isIndexed: true },
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
          columns: [{ name: 'transaction_datetime', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
