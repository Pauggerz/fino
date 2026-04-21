import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
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

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [syncVersion, setSyncVersion] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const failStreak = useRef(0);

  const triggerSync = useCallback(async (isConnected: boolean) => {
    if (!isConnected) {
      setStatus('offline');
      return;
    }

    setStatus('syncing');
    try {
      await runSync();
      failStreak.current = 0;
      setStatus('synced');
      setLastSyncedAt(new Date());
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
    const unsubscribe = NetInfo.addEventListener((state) => {
      triggerSync(checkIsOnline(state));
    });
    NetInfo.fetch().then((state) => triggerSync(checkIsOnline(state)));

    const interval = setInterval(() => {
      NetInfo.fetch().then((state) => triggerSync(checkIsOnline(state)));
    }, 30_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [triggerSync]);

  return (
    <SyncContext.Provider
      value={{
        status,
        forceSync: () => triggerSync(true),
        syncVersion,
        lastSyncedAt,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);
