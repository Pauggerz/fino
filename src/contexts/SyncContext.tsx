import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { processQueue, addToQueue, getPendingQueue } from '@/services/syncService';

export type SyncStatus = 'synced' | 'syncing' | 'offline';

interface SyncContextProps {
  status: SyncStatus;
  addOfflineTransaction: (tx: any) => Promise<void>;
  forceSync: () => Promise<void>;
  syncVersion: number;
}

const SyncContext = createContext<SyncContextProps>({
  status: 'synced',
  addOfflineTransaction: async () => {},
  forceSync: async () => {},
  syncVersion: 0,
});

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [syncVersion, setSyncVersion] = useState(0);
  const isSyncing = useRef(false); 

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
      setSyncVersion((v) => v + 1); // Trigger the UI to auto-refresh!
    } else {
      setStatus('offline'); // Failed (e.g. server down) -> Red
    }
  }, []);

  useEffect(() => {
    // 1. Listens for instant Wi-Fi toggles
    const unsubscribe = NetInfo.addEventListener((state) => {
      triggerSync(state.isConnected === true);
    });

    // 2. Check once on boot
    NetInfo.fetch().then((state) => {
      triggerSync(state.isConnected === true);
    });

    // 3. Robust Polling Fallback (Every 8 seconds)
    // This perfectly solves the issue where the network reconnects but Supabase 
    // hasn't loaded its auth token yet. It will automatically catch it on the next tick.
    const interval = setInterval(() => {
      NetInfo.fetch().then((state) => {
        if (state.isConnected) {
          triggerSync(true);
        }
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
    
    if (state.isConnected === true) {
      await triggerSync(true);
    } else {
      setStatus('offline');
    }
  };

  return (
    <SyncContext.Provider value={{ status, addOfflineTransaction, forceSync: () => triggerSync(true), syncVersion }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);