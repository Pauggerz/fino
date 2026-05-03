import { synchronize } from '@nozbe/watermelondb/sync';
import type { SyncPullResult, SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';

import { database } from '../db';
import { supabase } from './supabase';

/**
 * Bidirectional sync between WatermelonDB (local SQLite) and Supabase.
 *
 * Design notes
 * ─────────────
 * • WatermelonDB `id` === Supabase `id`. Every locally-created row uses a UUID
 *   generated client-side so sync round-trips don't need id translation.
 * • Supabase is treated as the source of truth for timestamps. Every synced
 *   table has `updated_at` (bumped by a DB trigger) and `deleted_at` (soft
 *   delete). See `supabase/watermelon_sync_migration.sql`.
 * • `pullChanges` asks Supabase for every row where `updated_at > lastPulledAt`
 *   and classifies each into created / updated / deleted based on
 *   `created_at` and `deleted_at`.
 * • `pushChanges` upserts locally-created/-updated rows and soft-deletes rows
 *   marked for deletion.
 */

type RemoteRow = Record<string, unknown> & {
  id: string;
  updated_at: string;
  created_at?: string | null;
  deleted_at?: string | null;
};

type TableName =
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'debts'
  | 'savings_goals'
  | 'bill_reminders'
  | 'merchant_mappings'
  | 'recurring_incomes'
  | 'recurring_bills';

const SYNCED_TABLES: TableName[] = [
  'accounts',
  'transactions',
  'categories',
  'debts',
  'savings_goals',
  'bill_reminders',
  'merchant_mappings',
  'recurring_incomes',
  'recurring_bills',
];

/**
 * Columns that are local-only on the Watermelon side but stored as
 * `created_at` on Supabase. We surface them as `server_created_at` locally so
 * `updated_at` (ms number) stays reserved for Watermelon's own dirty tracking.
 */
const SERVER_CREATED_COLUMN: Record<TableName, boolean> = {
  accounts: true,
  transactions: true,
  categories: false,
  debts: true,
  savings_goals: true,
  bill_reminders: true,
  merchant_mappings: true,
  recurring_incomes: true,
  recurring_bills: true,
};

const toMs = (iso?: string | null): number => (iso ? new Date(iso).getTime() : 0);

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Midnight UTC means Supabase stored a date-only value — no real time info.
  // Return null so the UI doesn't show a misleading "8:00 AM" in UTC+8.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return null;
  }
  return d.toISOString();
}

// Columns that must be stored locally as 'YYYY-MM-DD' so Q.where comparisons
// against date-only literals work. Server stores these as TIMESTAMPTZ/DATE,
// the client treats them as day strings.
const DATE_ONLY_COLUMNS: Partial<Record<TableName, readonly string[]>> = {
  transactions: ['date'],
  debts: ['due_date'],
  savings_goals: ['target_date'],
  bill_reminders: ['due_date'],
  recurring_incomes: ['anchor_date', 'next_due_at', 'last_posted_at'],
  recurring_bills: ['anchor_date', 'next_due_at', 'last_paid_at'],
};

// When a date-only column is truncated, keep the full ISO timestamp in a
// companion column so the UI can display the real time.
const DATETIME_COMPANION: Partial<Record<TableName, Record<string, string>>> = {
  transactions: { date: 'transaction_datetime' },
};

function toDayString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  // Already 'YYYY-MM-DD'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a Supabase row into the shape WatermelonDB expects in its
 * `rawRecords` array for pullChanges. Numbers stay numbers, strings stay
 * strings, and timestamps get unified:
 *   - `updated_at` (Supabase timestamptz) → number (ms)
 *   - `created_at` (Supabase timestamptz) → `server_created_at` (ISO string)
 *   - date-only columns → 'YYYY-MM-DD' regardless of how Postgres returned them
 */
function remoteRowToRaw(table: TableName, row: RemoteRow): Record<string, unknown> {
  const raw: Record<string, unknown> = { id: row.id };
  const dateCols = DATE_ONLY_COLUMNS[table];
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'created_at' || key === 'deleted_at') continue;
    if (key === 'updated_at') {
      raw.updated_at = toMs(row.updated_at);
      continue;
    }
    if (dateCols && dateCols.includes(key)) {
      // Preserve full timestamp in companion column before truncating to day.
      const companions = DATETIME_COMPANION[table];
      if (companions && companions[key]) {
        raw[companions[key]] = toIsoString(value);
      }
      raw[key] = toDayString(value);
      continue;
    }
    raw[key] = value;
  }
  if (SERVER_CREATED_COLUMN[table] && row.created_at) {
    raw.server_created_at = toIsoString(row.created_at) ?? row.created_at;
  }
  return raw;
}

/**
 * Columns the client must never push — Supabase recomputes them from
 * authoritative data (e.g. `accounts.balance` is derived from the sum of
 * transactions via a server trigger). Pushing them would reintroduce a
 * last-write-wins race when multiple devices sync concurrent transactions.
 */
const SERVER_OWNED_COLUMNS: Partial<Record<TableName, readonly string[]>> = {
  accounts: ['balance'],
};

/**
 * Convert a WatermelonDB raw record into the payload Supabase expects. Drops
 * Watermelon-only fields and restores the Supabase `created_at` column from
 * `server_created_at`.
 */
// Companion columns are local-only — collect their names so pushChanges skips them.
const LOCAL_ONLY_COLUMNS = new Set<string>();
for (const companions of Object.values(DATETIME_COMPANION)) {
  if (companions) for (const col of Object.values(companions)) LOCAL_ONLY_COLUMNS.add(col);
}

function rawToRemoteRow(table: TableName, raw: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const dateCols = DATE_ONLY_COLUMNS[table];
  const serverOwned = SERVER_OWNED_COLUMNS[table];
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_status' || key === '_changed') continue;
    if (serverOwned && serverOwned.includes(key)) continue;
    if (LOCAL_ONLY_COLUMNS.has(key)) continue;
    if (key === 'server_created_at') {
      if (value) body.created_at = toIsoString(value) ?? value;
      continue;
    }
    if (key === 'updated_at') continue; // Supabase trigger owns this column
    if (dateCols && dateCols.includes(key)) {
      body[key] = toDayString(value) ?? value;
      continue;
    }
    body[key] = value;
  }
  return body;
}

export async function syncDatabase(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Not authenticated — cannot sync.');

  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }): Promise<SyncPullResult> => {
      const sinceIso = new Date(lastPulledAt ?? 0).toISOString();
      const changes: SyncDatabaseChangeSet = {} as SyncDatabaseChangeSet;
      // Seed the watermark with `lastPulledAt` (never the local wall clock).
      // A device whose clock is skewed into the future must not be allowed to
      // stamp a future `serverNow` — the next pull would then miss real
      // server changes until the server's clock caught up. We only advance
      // `serverNow` based on timestamps Postgres actually produced.
      let serverNow = lastPulledAt ?? 0;

      for (const table of SYNCED_TABLES) {
        // Pull both normal changes and tombstones separately. Some rows are
        // only visible in the deleted_at window and would be missed otherwise.
        const [{ data: changedRows, error: changedError }, { data: tombstoneRows, error: tombstoneError }] =
          await Promise.all([
            supabase
              .from(table)
              .select('*')
              .eq('user_id', userId)
              .gt('updated_at', sinceIso),
            supabase
              .from(table)
              .select('*')
              .eq('user_id', userId)
              .gt('deleted_at', sinceIso),
          ]);
        if (changedError) throw changedError;
        if (tombstoneError) throw tombstoneError;

        // Merge by id in case one row is returned by both queries.
        const rowsById = new Map<string, RemoteRow>();
        for (const row of (changedRows ?? []) as RemoteRow[]) rowsById.set(row.id, row);
        for (const row of (tombstoneRows ?? []) as RemoteRow[]) rowsById.set(row.id, row);

        // `sendCreatedAsUpdated: true` on synchronize() requires that every
        // row pulled from the server land in `updated` — never `created`.
        // Watermelon emits a diagnostic error otherwise. Locally-new rows
        // still get inserted because updating a non-existent id falls back
        // to create.
        const updated: Record<string, unknown>[] = [];
        const deleted: string[] = [];

        for (const row of rowsById.values()) {
          serverNow = Math.max(
            serverNow,
            toMs(row.updated_at),
            toMs(row.created_at),
            toMs(row.deleted_at),
          );
          // Any row with a tombstone is a delete. The server-side
          // `updated_at > lastPulledAt` filter already guarantees freshness,
          // so we must not re-check `deleted_at` against the client clock —
          // a slow local clock would otherwise resurrect deleted rows.
          if (row.deleted_at) {
            deleted.push(row.id);
            continue;
          }
          updated.push(remoteRowToRaw(table, row));
        }

        (changes as Record<string, { created: unknown[]; updated: unknown[]; deleted: string[] }>)[table] = {
          created: [],
          updated,
          deleted,
        };
      }

      return { changes, timestamp: serverNow };
    },

    pushChanges: async ({ changes }) => {
      for (const table of SYNCED_TABLES) {
        const tableChanges = (
          changes as Record<string, { created: Record<string, unknown>[]; updated: Record<string, unknown>[]; deleted: string[] }>
        )[table];
        if (!tableChanges) continue;

        const upserts = [...tableChanges.created, ...tableChanges.updated].map((raw) =>
          rawToRemoteRow(table, { ...raw, user_id: userId }),
        );

        if (upserts.length > 0) {
          const { error } = await supabase.from(table).upsert(upserts, { onConflict: 'id' });
          if (error) throw error;
        }

        if (tableChanges.deleted.length > 0) {
          const { error } = await supabase
            .from(table)
            .update({ deleted_at: new Date().toISOString() })
            .in('id', tableChanges.deleted);
          if (error) throw error;
        }
      }
    },

    sendCreatedAsUpdated: true,
  });
}

let inflight: Promise<void> | null = null;

/**
 * Single-flight wrapper — multiple triggers during one sync cycle collapse
 * into one network round-trip.
 */
export function triggerSync(): Promise<void> {
  if (inflight) return inflight;
  inflight = syncDatabase().finally(() => {
    inflight = null;
  });
  return inflight;
}
