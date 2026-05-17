import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  TKey,
  translate,
} from '../i18n/strings';

const STORAGE_KEY = '@fino_language';
const DEFAULT_LANG: LanguageCode = 'en';

interface I18nContextType {
  lang: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: DEFAULT_LANG,
  setLanguage: async () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<LanguageCode>(DEFAULT_LANG);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
        setLang(stored as LanguageCode);
      }
    });
  }, []);

  const setLanguage = useCallback(async (next: LanguageCode) => {
    setLang(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang]
  );

  const value = useMemo(() => ({ lang, setLanguage, t }), [lang, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useTranslation = () => useContext(I18nContext);
