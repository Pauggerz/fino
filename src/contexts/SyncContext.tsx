import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { processQueue, addToQueue, getPendingQueue } from '@/services/syncService';
import type { OfflineTransaction } from '@/types';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

interface SyncContextProps {
  status: SyncStatus;
  addOfflineTransaction: (tx: OfflineTransaction) => Promise<void>;
  forceSync: () => Promise<void>;
  syncVersion: number;
  lastSyncedAt: Date | null;
}

const SyncContext = createContext<SyncContextProps>({
  status: 'synced',
  addOfflineTransaction: async () => {},
  forceSync: async () => {},
  syncVersion: 0,
  lastSyncedAt: null,
});

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [syncVersion, setSyncVersion] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(new Date());
  const syncFailStreak = useRef(0);

  const isSyncing = useRef(false);
  const lastTriggerAt = useRef(0);

  const triggerSync = useCallback(async (isConnected: boolean, force = false) => {
    // Debounce rapid re-entries from NetInfo listener + 8s polling.
    // `force=true` bypasses the debounce — used when we know there's fresh
    // work to flush (e.g. a just-added offline transaction).
    const now = Date.now();
    if (!force && now - lastTriggerAt.current < 500) return;
    lastTriggerAt.current = now;

    if (!isConnected) {
      setStatus('offline'); // Instantly Red
      return;
    }

    const queue = await getPendingQueue();
    if (queue.length === 0) {
      setStatus('synced'); // Instantly Green
      setLastSyncedAt(new Date());
      return;
    }

    if (isSyncing.current) return;
    isSyncing.current = true;
    setStatus('syncing'); // Turn Orange while working

    const success = await processQueue();

    isSyncing.current = false;
    if (success) {
      syncFailStreak.current = 0;
      setStatus('synced');
      setLastSyncedAt(new Date());
      setSyncVersion((v) => v + 1);
    } else {
      syncFailStreak.current += 1;
      setStatus('error');
      // Alert the user after 2 consecutive failures so a single blip isn't noisy
      if (syncFailStreak.current === 2) {
        Alert.alert(
          'Sync failed',
          'Some transactions could not be saved to the server. They are stored locally and will retry automatically.',
          [{ text: 'OK' }],
        );
      }
    }
  }, []);

  useEffect(() => {
    // Helper function to accurately determine if we are online
    const checkIsOnline = (state: NetInfoState) => {
      // isInternetReachable can be null while it's still verifying.
      // We assume online if connected, unless explicitly told unreachable.
      return state.isConnected === true && state.isInternetReachable !== false;
    };

    // 1. Listens for instant Wi-Fi/Cellular toggles
    const unsubscribe = NetInfo.addEventListener((state) => {
      triggerSync(checkIsOnline(state));
    });

    // 2. Check once on boot
    NetInfo.fetch().then((state) => {
      triggerSync(checkIsOnline(state));
    });

    // 3. Robust Polling Fallback (Every 8 seconds)
    // This actively pushes the 'offline' state if the listener missed it
    const interval = setInterval(() => {
      NetInfo.fetch().then((state) => {
        triggerSync(checkIsOnline(state));
      });
    }, 8000); 

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [triggerSync]);

  const addOfflineTransaction = async (tx: OfflineTransaction) => {
    try {
      await addToQueue(tx);
    } catch {
      Alert.alert(
        'Transaction not saved',
        'Could not save your transaction to local storage. Please try again.',
        [{ text: 'OK' }],
      );
      return;
    }

    // Small delay before sync so the AsyncStorage write has fully committed on
    // slower devices. Without this, processQueue may read a stale queue and
    // the tx gets picked up on the next 8s poll instead of immediately.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const state = await NetInfo.fetch();

    if (state.isConnected === true && state.isInternetReachable !== false) {
      await triggerSync(true, true);
    } else {
      setStatus('offline');
    }
  };

  return (
    <SyncContext.Provider 
      value={{ 
        status, 
        addOfflineTransaction, 
        forceSync: () => triggerSync(true), 
        syncVersion,
        lastSyncedAt 
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);