import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';
import { _setActiveCurrencyCode, _setPrivacyMode } from '../utils/format';
import {
  CurrencyMeta,
  SUPPORTED_CURRENCIES,
  getCurrencyMeta,
} from '../utils/currency';

export type { CurrencyMeta } from '../utils/currency';
export { SUPPORTED_CURRENCIES, getCurrencyMeta } from '../utils/currency';

const STORAGE_KEY = '@fino_currency';
// Privacy mode is a per-device display preference (not synced) — like the theme.
const PRIVACY_KEY = '@fino_privacy_mode';
const DEFAULT_CODE = 'PHP';

interface CurrencyContextType {
  code: string;
  meta: CurrencyMeta;
  setCurrency: (code: string) => Promise<void>;
  format: (
    n: number,
    opts?: { withDecimals?: boolean; privacy?: boolean }
  ) => string;
  /** When true, every amount is masked (₱***) until the user turns it off. */
  privacyMode: boolean;
  setPrivacyMode: (on: boolean) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType>({
  code: DEFAULT_CODE,
  meta: getCurrencyMeta(DEFAULT_CODE),
  setCurrency: async () => {},
  format: (n) => `₱${Math.abs(n)}`,
  privacyMode: false,
  setPrivacyMode: async () => {},
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [privacyMode, setPrivacyModeState] = useState(false);
  const { user, profile, refreshProfile, isLocal } = useAuth();

  // Local cache first (instant), then reconcile with server profile.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && SUPPORTED_CURRENCIES.some((c) => c.code === stored)) {
        setCode(stored);
      }
    });
    AsyncStorage.getItem(PRIVACY_KEY).then((stored) => {
      if (stored === 'true') setPrivacyModeState(true);
    });
  }, []);

  // Keep the non-React fmtPeso() shim in sync with the active code.
  useEffect(() => {
    _setActiveCurrencyCode(code);
  }, [code]);

  // Mirror privacy mode into the non-React fmtPeso() shim so the ~94 call sites
  // that use it mask without per-call changes.
  useEffect(() => {
    _setPrivacyMode(privacyMode);
  }, [privacyMode]);

  useEffect(() => {
    // Local mode: AsyncStorage is the single source of truth — the synthesized
    // local profile mirrors it, so don't let it drive `code` (the value can lag
    // a `setCurrency` and would revert the user's choice).
    if (isLocal) return;
    if (profile?.currency && profile.currency !== code) {
      setCode(profile.currency);
      AsyncStorage.setItem(STORAGE_KEY, profile.currency);
    }
  }, [profile?.currency, isLocal]);

  const setCurrency = useCallback(
    async (next: string) => {
      setCode(next);
      await AsyncStorage.setItem(STORAGE_KEY, next);
      if (user) {
        await supabase
          .from('users')
          .update({ currency: next })
          .eq('id', user.id);
        await refreshProfile();
      }
    },
    [user, refreshProfile]
  );

  const setPrivacyMode = useCallback(async (on: boolean) => {
    setPrivacyModeState(on);
    await AsyncStorage.setItem(PRIVACY_KEY, on ? 'true' : 'false');
  }, []);

  const meta = useMemo(() => getCurrencyMeta(code), [code]);

  const format = useCallback(
    (n: number, opts?: { withDecimals?: boolean; privacy?: boolean }) => {
      // An explicit privacy:false overrides the global toggle (rare call sites
      // that must always show the value, e.g. an amount the user is editing).
      const mask = opts?.privacy ?? privacyMode;
      if (mask) return `${meta.symbol}***`;
      const decimals = opts?.withDecimals ? meta.decimals : 0;
      const formatted = Math.abs(n).toLocaleString(meta.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return `${meta.symbol}${formatted}`;
    },
    [meta, privacyMode]
  );

  const value = useMemo(
    () => ({ code, meta, setCurrency, format, privacyMode, setPrivacyMode }),
    [code, meta, setCurrency, format, privacyMode, setPrivacyMode]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
