import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ACCENT_THEMES, AccentKey } from '../constants/theme';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accent: AccentKey;
  setAccent: (accent: AccentKey) => void;
  isDark: boolean;
  colors: typeof lightColors;
}

const STORAGE_MODE_KEY   = '@fino_theme_mode';
const STORAGE_ACCENT_KEY = '@fino_theme_accent';

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [mode,   setModeState]   = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<AccentKey>('forest');

  // Load persisted preferences once on mount
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_MODE_KEY, STORAGE_ACCENT_KEY]).then((pairs) => {
      const savedMode   = pairs[0][1] as ThemeMode | null;
      const savedAccent = pairs[1][1] as AccentKey | null;
      if (savedMode)   setModeState(savedMode);
      if (savedAccent) setAccentState(savedAccent);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_MODE_KEY, m);
  };

  const setAccent = (a: AccentKey) => {
    setAccentState(a);
    AsyncStorage.setItem(STORAGE_ACCENT_KEY, a);
  };

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';

  // Merge accent overrides on top of the base palette
  const accentTheme = ACCENT_THEMES.find(t => t.key === accent);
  const baseColors  = isDark ? darkColors : lightColors;
  const overrides   = accentTheme ? (isDark ? accentTheme.dark : accentTheme.light) : {};
  const colors      = { ...baseColors, ...overrides };

  return (
    <ThemeContext.Provider value={{ mode, setMode, accent, setAccent, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
