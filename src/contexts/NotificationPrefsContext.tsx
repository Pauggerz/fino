import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPrefs {
  pushEnabled: boolean;
  billReminders: boolean;
  billReminderDaysBefore: 0 | 1 | 2 | 3;
  billReminderHour: number; // 0–23
  budgetAlerts: boolean;
  budgetThreshold: 50 | 80 | 100;
  weeklyDigest: boolean;
  weeklyDigestDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun=0
  weeklyDigestHour: number;
  inactivityReminder: boolean;
  goalMilestones: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // hour 0–23
  quietHoursEnd: number;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  billReminders: true,
  billReminderDaysBefore: 1,
  billReminderHour: 9,
  budgetAlerts: true,
  budgetThreshold: 80,
  weeklyDigest: true,
  weeklyDigestDay: 0,
  weeklyDigestHour: 20,
  inactivityReminder: false,
  goalMilestones: true,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

const STORAGE_KEY = '@fino_notification_prefs';

interface NotificationPrefsContextType {
  prefs: NotificationPrefs;
  updatePref: <K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K]
  ) => void;
  reset: () => void;
}

const NotificationPrefsContext = createContext<NotificationPrefsContextType>({
  prefs: DEFAULT_PREFS,
  updatePref: () => {},
  reset: () => {},
});

export function NotificationPrefsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as Partial<NotificationPrefs>;
        // Merge with defaults so new prefs added in updates get sane values.
        setPrefs({ ...DEFAULT_PREFS, ...parsed });
      } catch {
        // ignore bad JSON
      }
    });
  }, []);

  const persist = useCallback((next: NotificationPrefs) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const updatePref = useCallback(
    <K extends keyof NotificationPrefs>(
      key: K,
      value: NotificationPrefs[K]
    ) => {
      setPrefs((curr) => {
        const next = { ...curr, [key]: value };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const reset = useCallback(() => {
    setPrefs(DEFAULT_PREFS);
    persist(DEFAULT_PREFS);
  }, [persist]);

  const value = useMemo(() => ({ prefs, updatePref, reset }), [prefs, updatePref, reset]);

  return (
    <NotificationPrefsContext.Provider value={value}>
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export const useNotificationPrefs = () => useContext(NotificationPrefsContext);
