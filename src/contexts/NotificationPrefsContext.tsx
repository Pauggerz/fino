import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/db';
import NotificationPrefsModel from '@/db/models/NotificationPrefs';
import { useAuth } from './AuthContext';
import {
  DEFAULT_PREFS,
  mapModelToPrefs,
  upsertLocalPrefs,
  type NotificationPrefs,
} from '@/services/notificationPrefs';
import { syncScheduledNotifications } from '@/services/localPushScheduler';

/**
 * Two-way bridge over the synced `notification_prefs` WatermelonDB table.
 *
 * Prefs now roam across devices and are visible to server dispatchers. The
 * legacy AsyncStorage blob is migrated once (§6.17) and thereafter only mirrored
 * for rollback safety. Every change kicks local-schedule reconciliation so OS
 * reminders track the new settings (§5.3).
 */

// Re-exported for back-compat with existing screen imports.
export type { NotificationPrefs };
export { DEFAULT_PREFS };

const STORAGE_KEY = '@fino_notification_prefs';
const MIGRATED_KEY = '@fino_notification_prefs_migrated';

interface NotificationPrefsContextType {
  prefs: NotificationPrefs;
  updatePref: <K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K]
  ) => void;
  reset: () => void;
}

const NotificationPrefsContext = createContext<NotificationPrefsContextType>({
  prefs: DEFAULT_PREFS,
  updatePref: () => {},
  reset: () => {},
});

async function readLegacyAsyncStoragePrefs(): Promise<Partial<NotificationPrefs> | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as Partial<NotificationPrefs>;
  } catch {
    return null;
  }
}

export function NotificationPrefsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  // Guards a one-shot row-creation so repeated observe emissions before the
  // write commits don't spawn duplicate create attempts.
  const seedingRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      setPrefs(DEFAULT_PREFS);
      return undefined;
    }
    seedingRef.current = false;

    const sub = database
      .get<NotificationPrefsModel>('notification_prefs')
      .query(Q.where('user_id', userId))
      .observe()
      .subscribe((rows) => {
        if (rows.length > 0) {
          setPrefs(mapModelToPrefs(rows[0]));
          return;
        }
        // No local row yet — migrate from AsyncStorage (once) or seed defaults.
        if (seedingRef.current) return;
        seedingRef.current = true;
        (async () => {
          const legacy = await readLegacyAsyncStoragePrefs();
          const seed: Partial<NotificationPrefs> = legacy ?? {};
          await upsertLocalPrefs(userId, { ...DEFAULT_PREFS, ...seed });
          await AsyncStorage.setItem(MIGRATED_KEY, 'true');
        })().catch(() => {
          seedingRef.current = false; // allow retry on next emission
        });
      });

    return () => sub.unsubscribe();
  }, [userId]);

  const updatePref = useCallback(
    <K extends keyof NotificationPrefs>(
      key: K,
      value: NotificationPrefs[K]
    ) => {
      // Optimistic local update for instant UI.
      setPrefs((curr) => {
        const next = { ...curr, [key]: value };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      if (!userId) return;
      upsertLocalPrefs(userId, { [key]: value })
        .then(() => syncScheduledNotifications(userId))
        .catch(() => {});
    },
    [userId]
  );

  const reset = useCallback(() => {
    setPrefs(DEFAULT_PREFS);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PREFS)).catch(
      () => {}
    );
    if (!userId) return;
    upsertLocalPrefs(userId, DEFAULT_PREFS)
      .then(() => syncScheduledNotifications(userId))
      .catch(() => {});
  }, [userId]);

  const value = useMemo(
    () => ({ prefs, updatePref, reset }),
    [prefs, updatePref, reset]
  );

  return (
    <NotificationPrefsContext.Provider value={value}>
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export const useNotificationPrefs = () => useContext(NotificationPrefsContext);
