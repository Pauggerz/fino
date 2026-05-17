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
import { _setActiveCurrencyCode } from '../utils/format';
import {
  CurrencyMeta,
  SUPPORTED_CURRENCIES,
  getCurrencyMeta,
} from '../utils/currency';

export type { CurrencyMeta } from '../utils/currency';
export { SUPPORTED_CURRENCIES, getCurrencyMeta } from '../utils/currency';

const STORAGE_KEY = '@fino_currency';
const DEFAULT_CODE = 'PHP';

interface CurrencyContextType {
  code: string;
  meta: CurrencyMeta;
  setCurrency: (code: string) => Promise<void>;
  format: (n: number, opts?: { withDecimals?: boolean; privacy?: boolean }) => string;
}

const CurrencyContext = createContext<CurrencyContextType>({
  code: DEFAULT_CODE,
  meta: getCurrencyMeta(DEFAULT_CODE),
  setCurrency: async () => {},
  format: (n) => `₱${Math.abs(n)}`,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const { user, profile, refreshProfile } = useAuth();

  // Local cache first (instant), then reconcile with server profile.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && SUPPORTED_CURRENCIES.some((c) => c.code === stored)) {
        setCode(stored);
      }
    });
  }, []);

  // Keep the non-React fmtPeso() shim in sync with the active code.
  useEffect(() => {
    _setActiveCurrencyCode(code);
  }, [code]);

  useEffect(() => {
    if (profile?.currency && profile.currency !== code) {
      setCode(profile.currency);
      AsyncStorage.setItem(STORAGE_KEY, profile.currency);
    }
  }, [profile?.currency]);

  const setCurrency = useCallback(
    async (next: string) => {
      setCode(next);
      await AsyncStorage.setItem(STORAGE_KEY, next);
      if (user) {
        await supabase.from('users').update({ currency: next }).eq('id', user.id);
        await refreshProfile();
      }
    },
    [user, refreshProfile]
  );

  const meta = useMemo(() => getCurrencyMeta(code), [code]);

  const format = useCallback(
    (n: number, opts?: { withDecimals?: boolean; privacy?: boolean }) => {
      if (opts?.privacy) return `${meta.symbol}***`;
      const decimals = opts?.withDecimals ? meta.decimals : 0;
      const formatted = Math.abs(n).toLocaleString(meta.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return `${meta.symbol}${formatted}`;
    },
    [meta]
  );

  const value = useMemo(
    () => ({ code, meta, setCurrency, format }),
    [code, meta, setCurrency, format]
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
