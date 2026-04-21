import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

/**
 * WatermelonDB schema migration registry.
 *
 * When you bump the schema `version` in `schema.ts`, append a `{ toVersion, steps }`
 * entry here describing the structural change. Without this hook, every schema bump
 * forces a full local-DB reset on existing installs (data loss until next sync).
 *
 * Example:
 *   migrations: [
 *     {
 *       toVersion: 2,
 *       steps: [
 *         addColumns({ table: 'transactions', columns: [{ name: 'is_transfer', type: 'boolean' }] }),
 *       ],
 *     },
 *   ],
 */
export default schemaMigrations({ migrations: [] });
