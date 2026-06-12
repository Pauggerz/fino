import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * App-lock (biometric / device-credential) gate.
 *
 * When enabled, the app is covered by AppLockGate until the user passes a
 * biometric / passcode check. The preference is per-device (AsyncStorage, like
 * the theme) — it is not a synced account setting. The app re-locks whenever it
 * is sent to the background so a glance at the app switcher never reveals
 * balances.
 */

const STORAGE_KEY = '@fino_app_lock';

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'no-hardware' | 'not-enrolled' | 'auth-failed' };

interface AppLockContextType {
  /** Whether app-lock is turned on. */
  enabled: boolean;
  /** True while the lock screen should cover the app. */
  isLocked: boolean;
  /** Turn the lock on/off. Turning on requires a successful auth + enrolment. */
  setEnabled: (on: boolean) => Promise<EnableResult>;
  /** Prompt for biometrics; clears the lock on success. */
  unlock: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextType>({
  enabled: false,
  isLocked: false,
  setEnabled: async () => ({ ok: true }),
  unlock: async () => true,
});

async function authenticate(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Fino',
    cancelLabel: 'Cancel',
    // Allow the device passcode as a fallback so users without biometrics
    // enrolled (or after failed scans) can still get in.
    disableDeviceFallback: false,
  });
  return result.success;
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  // Mirror of `enabled` for the AppState listener (registered once).
  const enabledRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Load the persisted preference once. If lock is on, start locked.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'true') {
        setEnabledState(true);
        setIsLocked(true);
      }
    });
  }, []);

  // Re-lock when the app is backgrounded (not merely 'inactive', which fires for
  // the system biometric sheet / control-center swipe on iOS).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && enabledRef.current) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    const ok = await authenticate();
    if (ok) setIsLocked(false);
    return ok;
  }, []);

  const setEnabled = useCallback(async (on: boolean): Promise<EnableResult> => {
    if (!on) {
      setEnabledState(false);
      setIsLocked(false);
      await AsyncStorage.setItem(STORAGE_KEY, 'false');
      return { ok: true };
    }
    if (Platform.OS !== 'web') {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return { ok: false, reason: 'no-hardware' };
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return { ok: false, reason: 'not-enrolled' };
      const ok = await authenticate();
      if (!ok) return { ok: false, reason: 'auth-failed' };
    }
    setEnabledState(true);
    setIsLocked(false);
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({ enabled, isLocked, setEnabled, unlock }),
    [enabled, isLocked, setEnabled, unlock]
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export const useAppLock = () => useContext(AppLockContext);
