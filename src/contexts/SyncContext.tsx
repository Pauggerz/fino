import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus, InteractionManager } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { hasUnsyncedChanges } from '@nozbe/watermelondb/sync';

import { database } from '@/db';
import { triggerSync as runSync } from '@/services/watermelonSync';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

interface SyncStatusContextValue {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  forceSync: () => Promise<void>;
}

interface SyncVersionContextValue {
  syncVersion: number;
}

const SyncStatusContext = createContext<SyncStatusContextValue>({
  status: 'synced',
  lastSyncedAt: null,
  forceSync: async () => {},
});

const SyncVersionContext = createContext<SyncVersionContextValue>({
  syncVersion: 0,
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

  // Wrap every automatic sync invocation in runAfterInteractions so the pull
  // never competes with an in-progress gesture for JS-thread time.
  const scheduleSync = useCallback(
    (isConnected: boolean, force = false) => {
      InteractionManager.runAfterInteractions(() => {
        triggerSync(isConnected, force);
      });
    },
    [triggerSync],
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => {
        NetInfo.fetch().then((state) => scheduleSync(checkIsOnline(state)));
      }, SYNC_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      scheduleSync(checkIsOnline(state));
    });
    NetInfo.fetch().then((state) => scheduleSync(checkIsOnline(state), true));
    startInterval();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        // Resume + immediate pull on foreground — but only if it's been a while.
        NetInfo.fetch().then((s) => scheduleSync(checkIsOnline(s)));
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
  }, [scheduleSync]);

  const forceSync = useCallback(() => triggerSync(true, true), [triggerSync]);

  // Status + forceSync live in one context (consumed by UI badges).
  // syncVersion lives in a separate context (consumed only by hooks that
  // invalidate caches on successful pulls). Splitting prevents status-pill
  // consumers from re-rendering every time syncVersion bumps.
  const statusValue = useMemo<SyncStatusContextValue>(
    () => ({ status, lastSyncedAt, forceSync }),
    [status, lastSyncedAt, forceSync],
  );
  const versionValue = useMemo<SyncVersionContextValue>(
    () => ({ syncVersion }),
    [syncVersion],
  );

  return (
    <SyncStatusContext.Provider value={statusValue}>
      <SyncVersionContext.Provider value={versionValue}>
        {children}
      </SyncVersionContext.Provider>
    </SyncStatusContext.Provider>
  );
};

// Back-compat shape for existing callers that want the whole thing. Prefer the
// narrower hooks below for perf-sensitive consumers.
export const useSync = () => {
  const statusCtx = useContext(SyncStatusContext);
  const versionCtx = useContext(SyncVersionContext);
  return {
    status: statusCtx.status,
    lastSyncedAt: statusCtx.lastSyncedAt,
    forceSync: statusCtx.forceSync,
    syncVersion: versionCtx.syncVersion,
  };
};

export const useSyncStatus = () => useContext(SyncStatusContext);
export const useSyncVersion = () => useContext(SyncVersionContext).syncVersion;
