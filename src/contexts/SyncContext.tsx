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
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Check initial queue state
  const checkQueue = useCallback(async () => {
    const queue = await getPendingQueue();
    if (queue.length > 0) setStatus('pending');
  }, []);

  const attemptSync = useCallback(async () => {
    const queue = await getPendingQueue();
    if (queue.length === 0) {
      setStatus('synced');
      return;
    }

    if (!isOnline) {
      setStatus('pending');
      return;
    }

    const success = await processQueue();
    setStatus(success ? 'synced' : 'failed');
  }, [isOnline]);

  // Listen for network changes
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected && !!state.isInternetReachable;
      setIsOnline(connected);
      if (connected) {
        attemptSync();
      }
    });

    checkQueue();

    return () => unsubscribe();
  }, [attemptSync, checkQueue]);

  const addOfflineTransaction = async (tx: any) => {
    await addToQueue(tx);
    setStatus('pending');
    if (isOnline) {
      await attemptSync();
    }
  };

  return (
    <SyncContext.Provider value={{ status, addOfflineTransaction, forceSync: attemptSync }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);