import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
