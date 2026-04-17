import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { processQueue, addToQueue, getPendingQueue } from '@/services/syncService';

export type SyncStatus = 'synced' | 'syncing' | 'offline';

interface SyncContextProps {
  status: SyncStatus;
  addOfflineTransaction: (tx: any) => Promise<void>;
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
  
  const isSyncing = useRef(false);
  const lastTriggerAt = useRef(0);

  const triggerSync = useCallback(async (isConnected: boolean) => {
    // Debounce rapid re-entries (NetInfo listener + 8s polling can fire near-simultaneously).
    const now = Date.now();
    if (now - lastTriggerAt.current < 500) return;
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
      setStatus('synced'); // Success -> Green
      setLastSyncedAt(new Date()); 
      setSyncVersion((v) => v + 1); // Trigger the UI to auto-refresh
    } else {
      setStatus('offline'); // Failed (e.g. server down) -> Red
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

  const addOfflineTransaction = async (tx: any) => {
    await addToQueue(tx);
    const state = await NetInfo.fetch();
    
    if (state.isConnected === true && state.isInternetReachable !== false) {
      await triggerSync(true);
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