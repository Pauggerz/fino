import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Platform, Linking } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/I18nContext';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';
import {
  Group,
  Row,
  SectionTitle,
  SettingsHeader,
  ThemedSwitch,
} from '../components/settings/SettingsPrimitives';
import {
  OptionSheet,
  type SheetOption,
} from '../components/settings/OptionSheet';

type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unknown';

// Which value-picker sheet is open (null = none).
type SheetKey =
  | 'billDays'
  | 'billHour'
  | 'budgetThreshold'
  | 'digestDay'
  | 'digestHour'
  | 'quietStart'
  | 'quietEnd';

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// ── Option lists for the value pickers ───────────────────────────────────────
// HOUR + WEEKDAY labels are numeric time / weekday names (locale-formatting, not
// UI copy) and stay as-is; the day-before and threshold labels are translated
// inside the component where the `t()` translator is available.
const HOUR_OPTIONS: SheetOption<number>[] = Array.from(
  { length: 24 },
  (_, h) => ({ label: formatHour(h), value: h })
);
const WEEKDAY_OPTIONS: SheetOption<number>[] = FULL_DAYS.map((name, i) => ({
  label: name,
  value: i,
}));

/** Right-aligned current-value label for a tappable picker row. */
function ValueText({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
        color: colors.textSecondary,
      }}
    >
      {text}
    </Text>
  );
}

export default function NotificationSettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { prefs, updatePref } = useNotificationPrefs();

  const enabled = prefs.pushEnabled;
  const dim = (on: boolean) => ({ opacity: enabled ? 1 : on ? 0.5 : 0.45 });

  // Value-picker sheet state. Tapping a configurable row opens its sheet; only
  // tappable while the push master switch is on.
  const [activeSheet, setActiveSheet] = useState<SheetKey | null>(null);
  const openSheet = (key: SheetKey) => () => {
    if (enabled) setActiveSheet(key);
  };

  // Localized labels for the picker that can't live at module scope (need `t`).
  const dayLabel = useCallback(
    (d: number) => {
      if (d === 0) return t('notif.onTheDay');
      if (d === 1) return t('notif.oneDayBefore');
      return t('notif.nDaysBefore', { n: d });
    },
    [t]
  );
  const daysBeforeOptions: SheetOption<number>[] = useMemo(
    () => [0, 1, 2, 3].map((d) => ({ label: dayLabel(d), value: d })),
    [dayLabel]
  );
  const thresholdOptions: SheetOption<number>[] = useMemo(
    () =>
      [50, 80, 100].map((pct) => ({
        label: t('notif.thresholdOption', { pct }),
        value: pct,
      })),
    [t]
  );

  // OS-level permission state. Refresh on focus so returning from the system
  // settings screen or the priming flow shows the up-to-date status.
  const [permission, setPermission] = useState<PermissionState>('unknown');
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (Platform.OS === 'web') {
        setPermission('unknown');
        return undefined;
      }
      Notifications.getPermissionsAsync()
        .then((p) => {
          if (active) setPermission(p.status as PermissionState);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  const permissionMeta: {
    label: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress?: () => void;
    showChevron: boolean;
  } = (() => {
    switch (permission) {
      case 'granted':
        return {
          label: t('notif.perm.granted.title'),
          subtitle: t('notif.perm.granted.sub'),
          icon: 'checkmark-circle-outline',
          showChevron: false,
        };
      case 'denied':
        return {
          label: t('notif.perm.denied.title'),
          subtitle: t('notif.perm.denied.sub'),
          icon: 'alert-circle-outline',
          onPress: () => Linking.openSettings(),
          showChevron: true,
        };
      case 'undetermined':
        return {
          label: t('notif.perm.undetermined.title'),
          subtitle: t('notif.perm.undetermined.sub'),
          icon: 'notifications-outline',
          onPress: () => navigation.navigate('NotificationPriming'),
          showChevron: true,
        };
      default:
        return {
          label: t('notif.perm.default.title'),
          subtitle: t('notif.perm.default.sub'),
          icon: 'notifications-outline',
          showChevron: false,
        };
    }
  })();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      <SettingsHeader
        title={t('settings.section.notifications')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40 + insets.bottom,
        }}
      >
        {Platform.OS !== 'web' && (
          <Group>
            <Row
              icon={permissionMeta.icon}
              title={permissionMeta.label}
              subtitle={permissionMeta.subtitle}
              onPress={permissionMeta.onPress}
              showChevron={permissionMeta.showChevron}
              isLast
            />
          </Group>
        )}

        <Group>
          <Row
            icon="notifications-outline"
            title={t('settings.notifications.push')}
            subtitle={t('settings.notifications.pushSub')}
            trailing={
              <ThemedSwitch
                value={prefs.pushEnabled}
                onValueChange={(v) => updatePref('pushEnabled', v)}
              />
            }
            isLast
          />
        </Group>

        <View style={dim(true)}>
          <SectionTitle>{t('notif.section.reminders')}</SectionTitle>
          <Group>
            <Row
              icon="calendar-outline"
              title={t('settings.notifications.bills')}
              subtitle={t('settings.notifications.billsSub', {
                when: dayLabel(prefs.billReminderDaysBefore),
                time: formatHour(prefs.billReminderHour),
              })}
              trailing={
                <ThemedSwitch
                  value={prefs.billReminders}
                  onValueChange={(v) => updatePref('billReminders', v)}
                  disabled={!enabled}
                />
              }
              isLast={!prefs.billReminders}
            />
            {prefs.billReminders && (
              <>
                <Row
                  icon="time-outline"
                  title={t('notif.remindMe')}
                  trailing={
                    <ValueText text={dayLabel(prefs.billReminderDaysBefore)} />
                  }
                  showChevron
                  onPress={openSheet('billDays')}
                />
                <Row
                  icon="alarm-outline"
                  title={t('notif.at')}
                  trailing={
                    <ValueText text={formatHour(prefs.billReminderHour)} />
                  }
                  showChevron
                  onPress={openSheet('billHour')}
                />
              </>
            )}
            <Row
              icon="trending-up-outline"
              title={t('settings.notifications.budget')}
              subtitle={t('settings.notifications.budgetSub', {
                threshold: `${prefs.budgetThreshold}%`,
              })}
              trailing={
                <ThemedSwitch
                  value={prefs.budgetAlerts}
                  onValueChange={(v) => updatePref('budgetAlerts', v)}
                  disabled={!enabled}
                />
              }
            />
            {prefs.budgetAlerts && (
              <Row
                icon="speedometer-outline"
                title={t('notif.alertMeAt')}
                trailing={<ValueText text={`${prefs.budgetThreshold}%`} />}
                showChevron
                onPress={openSheet('budgetThreshold')}
              />
            )}
            <Row
              icon="cash-outline"
              title={t('notif.payday')}
              subtitle={t('notif.paydaySub')}
              trailing={
                <ThemedSwitch
                  value={prefs.paydayReminders}
                  onValueChange={(v) => updatePref('paydayReminders', v)}
                  disabled={!enabled}
                />
              }
            />
            <Row
              icon="alert-circle-outline"
              title={t('settings.notifications.inactivity')}
              subtitle={t('settings.notifications.inactivitySub')}
              trailing={
                <ThemedSwitch
                  value={prefs.inactivityReminder}
                  onValueChange={(v) => updatePref('inactivityReminder', v)}
                  disabled={!enabled}
                />
              }
              isLast
            />
          </Group>

          <SectionTitle>{t('notif.section.insights')}</SectionTitle>
          <Group>
            <Row
              icon="analytics-outline"
              title={t('settings.notifications.weekly')}
              subtitle={t('settings.notifications.weeklySub', {
                day: DAYS[prefs.weeklyDigestDay],
                time: formatHour(prefs.weeklyDigestHour),
              })}
              trailing={
                <ThemedSwitch
                  value={prefs.weeklyDigest}
                  onValueChange={(v) => updatePref('weeklyDigest', v)}
                  disabled={!enabled}
                />
              }
            />
            {prefs.weeklyDigest && (
              <>
                <Row
                  icon="today-outline"
                  title={t('notif.day')}
                  trailing={
                    <ValueText text={FULL_DAYS[prefs.weeklyDigestDay]} />
                  }
                  showChevron
                  onPress={openSheet('digestDay')}
                />
                <Row
                  icon="alarm-outline"
                  title={t('notif.time')}
                  trailing={
                    <ValueText text={formatHour(prefs.weeklyDigestHour)} />
                  }
                  showChevron
                  onPress={openSheet('digestHour')}
                />
              </>
            )}
            <Row
              icon="flag-outline"
              title={t('settings.notifications.goals')}
              trailing={
                <ThemedSwitch
                  value={prefs.goalMilestones}
                  onValueChange={(v) => updatePref('goalMilestones', v)}
                  disabled={!enabled}
                />
              }
              isLast
            />
          </Group>

          <SectionTitle>{t('notif.privacyHeader')}</SectionTitle>
          <Group>
            <Row
              icon="lock-closed-outline"
              title={t('notif.hideLockscreen')}
              subtitle={t('notif.hideLockscreenSub')}
              trailing={
                <ThemedSwitch
                  value={prefs.hideAmountsOnLockscreen}
                  onValueChange={(v) =>
                    updatePref('hideAmountsOnLockscreen', v)
                  }
                  disabled={!enabled}
                />
              }
              isLast
            />
          </Group>

          <SectionTitle>{t('settings.notifications.quiet')}</SectionTitle>
          <Group>
            <Row
              icon="moon-outline"
              title={t('settings.notifications.quiet')}
              subtitle={
                prefs.quietHoursEnabled
                  ? t('notif.quietOn')
                  : t('notif.quietOff')
              }
              trailing={
                <ThemedSwitch
                  value={prefs.quietHoursEnabled}
                  onValueChange={(v) => updatePref('quietHoursEnabled', v)}
                  disabled={!enabled}
                />
              }
              isLast={!prefs.quietHoursEnabled}
            />
            {prefs.quietHoursEnabled && (
              <>
                <Row
                  icon="cloudy-night-outline"
                  title={t('notif.from')}
                  trailing={
                    <ValueText text={formatHour(prefs.quietHoursStart)} />
                  }
                  showChevron
                  onPress={openSheet('quietStart')}
                />
                <Row
                  icon="sunny-outline"
                  title={t('notif.to')}
                  trailing={
                    <ValueText text={formatHour(prefs.quietHoursEnd)} />
                  }
                  showChevron
                  onPress={openSheet('quietEnd')}
                  isLast
                />
              </>
            )}
          </Group>
        </View>

        {/* Value pickers — one OptionSheet, parameterised by the open key. */}
        <OptionSheet
          visible={activeSheet === 'billDays'}
          title={t('notif.remindMe')}
          options={daysBeforeOptions}
          selected={prefs.billReminderDaysBefore}
          onSelect={(v) =>
            updatePref('billReminderDaysBefore', v as 0 | 1 | 2 | 3)
          }
          onClose={() => setActiveSheet(null)}
        />
        <OptionSheet
          visible={activeSheet === 'billHour'}
          title={t('notif.sheet.reminderTime')}
          options={HOUR_OPTIONS}
          selected={prefs.billReminderHour}
          onSelect={(v) => updatePref('billReminderHour', v)}
          onClose={() => setActiveSheet(null)}
        />
        <OptionSheet
          visible={activeSheet === 'budgetThreshold'}
          title={t('notif.sheet.threshold')}
          options={thresholdOptions}
          selected={prefs.budgetThreshold}
          onSelect={(v) => updatePref('budgetThreshold', v as 50 | 80 | 100)}
          onClose={() => setActiveSheet(null)}
        />
        <OptionSheet
          visible={activeSheet === 'digestDay'}
          title={t('notif.sheet.digestDay')}
          options={WEEKDAY_OPTIONS}
          selected={prefs.weeklyDigestDay}
          onSelect={(v) =>
            updatePref('weeklyDigestDay', v as 0 | 1 | 2 | 3 | 4 | 5 | 6)
          }
          onClose={() => setActiveSheet(null)}
        />
        <OptionSheet
          visible={activeSheet === 'digestHour'}
          title={t('notif.sheet.digestTime')}
          options={HOUR_OPTIONS}
          selected={prefs.weeklyDigestHour}
          onSelect={(v) => updatePref('weeklyDigestHour', v)}
          onClose={() => setActiveSheet(null)}
        />
        <OptionSheet
          visible={activeSheet === 'quietStart'}
          title={t('notif.sheet.quietStart')}
          options={HOUR_OPTIONS}
          selected={prefs.quietHoursStart}
          onSelect={(v) => updatePref('quietHoursStart', v)}
          onClose={() => setActiveSheet(null)}
        />
        <OptionSheet
          visible={activeSheet === 'quietEnd'}
          title={t('notif.sheet.quietEnd')}
          options={HOUR_OPTIONS}
          selected={prefs.quietHoursEnd}
          onSelect={(v) => updatePref('quietHoursEnd', v)}
          onClose={() => setActiveSheet(null)}
        />

        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            color: colors.textSecondary,
            marginHorizontal: 6,
            marginTop: 4,
            lineHeight: 18,
          }}
        >
          {t('notif.footer')}
        </Text>
      </ScrollView>
    </View>
  );
}
