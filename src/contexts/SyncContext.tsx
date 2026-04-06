import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { processQueue, addToQueue, getPendingQueue } from '@/services/syncService';

export type SyncStatus = 'synced' | 'syncing' | 'offline';

interface SyncContextProps {
  status: SyncStatus;
  addOfflineTransaction: (tx: any) => Promise<void>;
  forceSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextProps>({
  status: 'synced',
  addOfflineTransaction: async () => {},
  forceSync: async () => {},
});

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const isSyncing = useRef(false); // Prevents duplicate syncs running at the same time

  const triggerSync = useCallback(async (isConnected: boolean) => {
    if (!isConnected) {
      setStatus('offline'); // Instantly Red
      return;
    }

    const queue = await getPendingQueue();
    if (queue.length === 0) {
      setStatus('synced'); // Instantly Green
      return;
    }

    if (isSyncing.current) return;
    isSyncing.current = true;
    setStatus('syncing'); // Turn Orange while working

    const success = await processQueue();

    isSyncing.current = false;
    if (success) {
      setStatus('synced'); // Success -> Green
    } else {
      setStatus('offline'); // Failed (e.g. server down) -> Red
    }
  }, []);

  useEffect(() => {
    // Listens for instant Wi-Fi toggles
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true;
      triggerSync(isOnline);
    });

    // Check once on boot
    NetInfo.fetch().then((state) => {
      triggerSync(state.isConnected === true);
    });

    return () => unsubscribe();
  }, [triggerSync]);

  const addOfflineTransaction = async (tx: any) => {
    await addToQueue(tx);
    const state = await NetInfo.fetch();
    
    if (state.isConnected === true) {
      await triggerSync(true);
    } else {
      setStatus('offline');
    }
  };

  return (
    <SyncContext.Provider value={{ status, addOfflineTransaction, forceSync: () => triggerSync(true) }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);