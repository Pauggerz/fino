import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { processQueue, addToQueue, getPendingQueue } from '@/services/syncService';

export type SyncStatus = 'synced' | 'pending' | 'failed';

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

  // Simply checks if the local storage has items
  const checkQueue = useCallback(async () => {
    const queue = await getPendingQueue();
    if (queue.length > 0) {
      setStatus('pending');
    } else {
      setStatus('synced');
    }
  }, []);

  // Fires the sync event dynamically checking the live network status
  const attemptSync = useCallback(async () => {
    const queue = await getPendingQueue();
    if (queue.length === 0) {
      setStatus('synced');
      return;
    }

    // Fetch live network state directly to avoid React state closure traps
    const networkState = await NetInfo.fetch();
    
    // We use isConnected because it is instantaneous. 
    if (!networkState.isConnected) {
      setStatus('pending');
      return;
    }

    const success = await processQueue();
    setStatus(success ? 'synced' : 'failed');
  }, []);

  useEffect(() => {
    // This listener triggers immediately when Wi-Fi is toggled
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        attemptSync(); // Internet restored -> Push to DB
      } else {
        checkQueue(); // Internet lost -> Instantly turn amber if queue has items
      }
    });

    // Initial check on app boot
    attemptSync();

    return () => unsubscribe();
  }, [attemptSync, checkQueue]);

  const addOfflineTransaction = async (tx: any) => {
    await addToQueue(tx);
    setStatus('pending');
    // Instantly attempt a sync. If offline, attemptSync aborts cleanly.
    await attemptSync();
  };

  return (
    <SyncContext.Provider value={{ status, addOfflineTransaction, forceSync: attemptSync }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);