import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { hasUnsyncedChanges } from '@nozbe/watermelondb/sync';

import { database } from '@/db';
import { triggerSync as runSync } from '@/services/watermelonSync';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

interface SyncContextProps {
  status: SyncStatus;
  forceSync: () => Promise<void>;
  syncVersion: number;
  lastSyncedAt: Date | null;
}

const SyncContext = createContext<SyncContextProps>({
  status: 'synced',
  forceSync: async () => {},
  syncVersion: 0,
  lastSyncedAt: null,
});

const checkIsOnline = (state: NetInfoState) =>
  state.isConnected === true && state.isInternetReachable !== false;

const SYNC_INTERVAL_MS = 30_000;

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [syncVersion, setSyncVersion] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const failStreak = useRef(0);
  const lastSyncedAtRef = useRef<number>(0);

  const triggerSync = useCallback(async (isConnected: boolean, force = false) => {
    if (!isConnected) {
      setStatus('offline');
      return;
    }
    // Skip redundant ticks — three triggers fire on startup (mount + NetInfo
    // event + interval) and the single-flight wrapper only dedupes concurrent
    // calls, not sequential ones a few ms apart.
    if (!force && Date.now() - lastSyncedAtRef.current < SYNC_INTERVAL_MS) {
      return;
    }

    setStatus('syncing');
    try {
      await runSync();
      failStreak.current = 0;
      setStatus('synced');
      const now = new Date();
      lastSyncedAtRef.current = now.getTime();
      setLastSyncedAt(now);
      setSyncVersion((v) => v + 1);
    } catch (err) {
      failStreak.current += 1;
      setStatus('error');
      if (__DEV__) console.warn('[SyncContext] sync failed:', err);
      if (failStreak.current === 2) {
        const pending = await hasUnsyncedChanges({ database });
        if (pending) {
          Alert.alert(
            'Sync failed',
            'Some changes could not reach the server. They are stored locally and will retry automatically.',
            [{ text: 'OK' }],
          );
        }
      }
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => {
        NetInfo.fetch().then((state) => triggerSync(checkIsOnline(state)));
      }, SYNC_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      triggerSync(checkIsOnline(state));
    });
    NetInfo.fetch().then((state) => triggerSync(checkIsOnline(state), true));
    startInterval();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        // Resume + immediate pull on foreground — but only if it's been a while.
        NetInfo.fetch().then((s) => triggerSync(checkIsOnline(s)));
        startInterval();
      } else {
        stopInterval();
      }
    };
    const appStateSub = AppState.addEventListener('change', onAppState);

    return () => {
      unsubscribeNet();
      stopInterval();
      appStateSub.remove();
    };
  }, [triggerSync]);

  return (
    <SyncContext.Provider
      value={{
        status,
        forceSync: () => triggerSync(true, true),
        syncVersion,
        lastSyncedAt,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);
