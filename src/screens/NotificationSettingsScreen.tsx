import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function daysBeforeLabel(d: number): string {
  if (d === 0) return 'On the day';
  if (d === 1) return '1 day before';
  return `${d} days before`;
}

export default function NotificationSettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { prefs, updatePref } = useNotificationPrefs();

  const enabled = prefs.pushEnabled;
  const dim = (on: boolean) => ({ opacity: enabled ? 1 : on ? 0.5 : 0.45 });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
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
          <SectionTitle>Reminders</SectionTitle>
          <Group>
            <Row
              icon="calendar-outline"
              title={t('settings.notifications.bills')}
              subtitle={t('settings.notifications.billsSub', {
                when: daysBeforeLabel(prefs.billReminderDaysBefore),
                time: formatHour(prefs.billReminderHour),
              })}
              trailing={
                <ThemedSwitch
                  value={prefs.billReminders}
                  onValueChange={(v) => updatePref('billReminders', v)}
                />
              }
            />
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
                />
              }
              isLast
            />
          </Group>

          <SectionTitle>Insights & goals</SectionTitle>
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
                />
              }
            />
            <Row
              icon="flag-outline"
              title={t('settings.notifications.goals')}
              trailing={
                <ThemedSwitch
                  value={prefs.goalMilestones}
                  onValueChange={(v) => updatePref('goalMilestones', v)}
                />
              }
              isLast
            />
          </Group>

          <SectionTitle>Quiet hours</SectionTitle>
          <Group>
            <Row
              icon="moon-outline"
              title={t('settings.notifications.quiet')}
              subtitle={
                prefs.quietHoursEnabled
                  ? `${formatHour(prefs.quietHoursStart)} — ${formatHour(prefs.quietHoursEnd)}`
                  : 'Off'
              }
              trailing={
                <ThemedSwitch
                  value={prefs.quietHoursEnabled}
                  onValueChange={(v) => updatePref('quietHoursEnabled', v)}
                />
              }
              isLast
            />
          </Group>
        </View>

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
          Notifications respect your device-level permissions for Fino. If push
          isn't working, check Settings → Notifications → Fino on your device.
        </Text>
      </ScrollView>
    </View>
  );
}
