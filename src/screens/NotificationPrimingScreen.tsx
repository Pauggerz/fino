import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { registerForPushNotificationsAsync } from '@/services/pushTokens';

/**
 * Permission priming (§5.2). Industry best practice: never call
 * requestPermissionsAsync cold. This screen explains the value first, then
 * requests on the primary action. On grant it captures the push token so the
 * device is immediately reachable.
 */

const BENEFITS: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
}[] = [
  {
    icon: 'calendar-outline',
    title: 'Never miss a bill',
    sub: 'A heads-up before each due date so late fees stay off your statement.',
  },
  {
    icon: 'trending-up-outline',
    title: 'Budget guardrails',
    sub: "We'll nudge you when a category is close to its cap — before you blow past it.",
  },
  {
    icon: 'flag-outline',
    title: 'Goal milestones',
    sub: 'Little wins along the way as your savings goals fill up.',
  },
];

export default function NotificationPrimingScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = createStyles(colors, isDark);
  const [requesting, setRequesting] = useState(false);

  const enable = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          provideAppNotificationSettings: true,
          // provisional: true is a softer iOS 12+ alternative — left off so the
          // user makes an explicit choice here.
          allowProvisional: false,
        },
      });
      if (status === 'granted' && user?.id) {
        await registerForPushNotificationsAsync(user.id);
      }
    } catch {
      // Swallow — the Settings screen surfaces the resulting permission state.
    } finally {
      setRequesting(false);
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.close}
        accessibilityLabel="Close"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={24} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={styles.bellCircle}>
          <Ionicons name="notifications" size={44} color={colors.primary} />
        </View>
        <Text style={styles.title}>Stay on top of your money</Text>
        <Text style={styles.subtitle}>
          Turn on notifications and Fino will quietly look out for your bills,
          budgets, and goals.
        </Text>
      </View>

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.benefitRow}>
            <View style={styles.benefitIcon}>
              <Ionicons name={b.icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.benefitSub}>{b.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={enable}
          activeOpacity={0.85}
          disabled={requesting}
          accessibilityRole="button"
          accessibilityLabel="Turn on notifications"
        >
          {requesting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Turn on notifications</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>Not now</Text>
        </TouchableOpacity>
        {Platform.OS === 'ios' && (
          <Text style={styles.fine}>
            You can change this anytime in Settings.
          </Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
    },
    close: { alignSelf: 'flex-end', padding: 6 },
    hero: { alignItems: 'center', marginTop: 12, gap: 12 },
    bellCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: isDark ? colors.primaryLight : '#E8F4EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 26,
      color: colors.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    subtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 320,
    },
    benefits: { marginTop: 32, gap: 20 },
    benefitRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    benefitIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? colors.primaryLight : '#E8F4EC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    benefitTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    benefitSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    footer: { gap: 10 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
    },
    primaryBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
      color: colors.white,
    },
    secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
    secondaryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: colors.textSecondary,
    },
    fine: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
