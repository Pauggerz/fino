import { Q } from '@nozbe/watermelondb';
import type Model from '@nozbe/watermelondb/Model';

import { database } from '../db';
import { supabase } from './supabase';
import { SYNCED_TABLES, setSyncPaused, triggerSync } from './watermelonSync';

/**
 * Claim device-local data into a freshly-created cloud account.
 *
 * Offline-first onboarding stamps every local row with a device-local UUID and
 * never reaches Supabase. When the user later creates an account, the local
 * data must move under the new auth uid. The WatermelonDB push already stamps
 * `user_id = authUid` on every dirty row, but the *local* `user_id` field must
 * also be rewritten so on-device queries (all filtered by `user_id`) keep
 * finding the rows once `currentUserId` flips to the auth uid.
 *
 * This is deliberately scoped to **fresh** accounts. If the account already has
 * data, we do NOT merge — the local data stays on the device (just not shown
 * while signed in) and the user sees their cloud data. A true two-way merge is
 * out of scope.
 */
export type ClaimReason = 'no-local-data' | 'account-has-data' | 'invalid';

export interface ClaimResult {
  claimed: boolean;
  reason?: ClaimReason;
}

// `notification_prefs` is keyed id === user_id, so it can't be re-stamped (the
// id is immutable). It's dropped here and re-created for the auth uid by
// NotificationPrefsContext after sign-in.
const RESTAMP_TABLES = SYNCED_TABLES.filter((t) => t !== 'notification_prefs');

async function hasLocalRows(localUserId: string): Promise<boolean> {
  for (const table of RESTAMP_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const count = await database
      .get(table)
      .query(Q.where('user_id', localUserId))
      .fetchCount();
    if (count > 0) return true;
  }
  return false;
}

/**
 * True when the cloud account is brand-new — only the server-seeded defaults
 * (Cash + "Others"), no transactions and no user-created categories.
 */
async function isFreshCloudAccount(authUid: string): Promise<boolean> {
  const [{ count: txCount }, { count: userCatCount }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUid)
      .is('deleted_at', null),
    supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUid)
      .eq('is_default', false)
      .is('deleted_at', null),
  ]);
  return (txCount ?? 0) === 0 && (userCatCount ?? 0) === 0;
}

export async function claimLocalData(
  authUid: string,
  localUserId: string
): Promise<ClaimResult> {
  if (!authUid || !localUserId || authUid === localUserId) {
    return { claimed: false, reason: 'invalid' };
  }

  if (!(await hasLocalRows(localUserId))) {
    return { claimed: false, reason: 'no-local-data' };
  }

  if (!(await isFreshCloudAccount(authUid))) {
    // Existing account with real data — adopt the cloud account and discard the
    // throwaway local setup. We can't just early-return: the local rows are
    // unsynced `created` records, and the push stamps them with `authUid`
    // regardless of their stored user_id, so they'd land as duplicates. Marking
    // them deleted removes them with no server tombstone (they were never
    // synced). Local-only tables (chat/notifications) are untouched. Offline
    // data made before signing into a populated account is not merged.
    setSyncPaused(true);
    try {
      await database.write(async () => {
        for (const table of RESTAMP_TABLES) {
          // eslint-disable-next-line no-await-in-loop
          const rows = await database
            .get(table)
            .query(Q.where('user_id', localUserId))
            .fetch();
          if (rows.length > 0) {
            // eslint-disable-next-line no-await-in-loop
            await database.batch(
              ...rows.map((r: Model) => r.prepareMarkAsDeleted())
            );
          }
        }
      });
    } finally {
      setSyncPaused(false);
    }
    await triggerSync();
    return { claimed: false, reason: 'account-has-data' };
  }

  setSyncPaused(true);
  try {
    // De-dupe: soft-delete the server's freshly-seeded Cash + "Others" so the
    // local copies (pushed below) don't land as duplicates. Safe because the
    // freshness check guarantees nothing references them yet.
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabase
        .from('accounts')
        .update({ deleted_at: nowIso })
        .eq('user_id', authUid)
        .is('deleted_at', null),
      supabase
        .from('categories')
        .update({ deleted_at: nowIso })
        .eq('user_id', authUid)
        .is('deleted_at', null),
    ]);

    // Re-stamp every local row's user_id, and drop the local-keyed
    // notification_prefs singleton.
    await database.write(async () => {
      for (const table of RESTAMP_TABLES) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await database
          .get(table)
          .query(Q.where('user_id', localUserId))
          .fetch();
        if (rows.length > 0) {
          const updates = rows.map((row: Model) =>
            row.prepareUpdate((rec) => {
              // eslint-disable-next-line no-param-reassign
              (rec as unknown as { userId: string }).userId = authUid;
            })
          );
          // eslint-disable-next-line no-await-in-loop
          await database.batch(...updates);
        }
      }

      const prefs = await database
        .get('notification_prefs')
        .query(Q.where('user_id', localUserId))
        .fetch();
      if (prefs.length > 0) {
        await database.batch(
          ...prefs.map((p: Model) => p.prepareMarkAsDeleted())
        );
      }
    });
  } finally {
    setSyncPaused(false);
  }

  // Push the re-stamped rows up and pull the cleaned server state.
  await triggerSync();
  return { claimed: true };
}
