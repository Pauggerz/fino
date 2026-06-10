import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/constants/theme';
import {
  useNotifications,
  type NotificationItem,
} from '@/hooks/useNotifications';
import NotificationCard from '@/components/NotificationCard';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { routeFromNotification } from '@/services/notificationRouter';
import { syncBadgeCount } from '@/services/notificationHandlers';

export default function NotificationsScreen() {
  const { colors, isDark } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, isDark);

  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    dismiss,
    snooze,
    clearAll,
  } = useNotifications();

  // Shared with the push-tap handler so an inbox tap and a notification tap
  // land on exactly the same screen — params included (§5.4).
  const handleAction = useCallback(
    (item: NotificationItem) => {
      markAsRead(item.id).then(syncBadgeCount);
      if (!item.actionRoute) return;
      routeFromNotification({
        route: item.actionRoute,
        params: item.actionParams,
      });
    },
    [markAsRead]
  );

  const handleSnooze = useCallback(
    (item: NotificationItem) => {
      snooze(item).then(syncBadgeCount);
    },
    [snooze]
  );

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead().then(syncBadgeCount);
  }, [markAllAsRead]);

  const handleClearAll = useCallback(() => {
    if (notifications.length === 0) return;
    Alert.alert(
      'Clear notifications?',
      'This will dismiss all current notifications. New ones will continue to appear.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: clearAll },
      ]
    );
  }, [clearAll, notifications.length]);

  const unread = notifications.filter((n) => !n.isRead);
  const read = notifications.filter((n) => n.isRead);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              style={styles.iconButton}
              activeOpacity={0.7}
              accessibilityLabel="Mark all as read"
            >
              <Ionicons
                name="checkmark-done-outline"
                size={20}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              onPress={handleClearAll}
              style={styles.iconButton}
              activeOpacity={0.7}
              accessibilityLabel="Clear all"
            >
              <Ionicons
                name="trash-outline"
                size={19}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!loading && notifications.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIllo}>
            <Ionicons
              name="notifications-off-outline"
              size={52}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
          <Text style={styles.emptyMsg}>
            No new alerts or insights right now. We&apos;ll let you know when
            there&apos;s something worth seeing.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
            gap: 10,
          }}
          showsVerticalScrollIndicator={false}
        >
          {unread.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>New</Text>
              {unread.map((item) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  onPress={() => markAsRead(item.id)}
                  onAction={() => handleAction(item)}
                  onDismiss={() => dismiss(item.id)}
                  onSnooze={() => handleSnooze(item)}
                />
              ))}
            </>
          )}
          {read.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                Earlier
              </Text>
              {read.map((item) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  onDismiss={() => dismiss(item.id)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 22,
      color: colors.textPrimary,
      letterSpacing: -0.5,
      marginLeft: 2,
    },
    countBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      minWidth: 22,
      marginLeft: 8,
      alignItems: 'center',
    },
    countBadgeText: {
      color: '#fff',
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
    },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: 12,
      marginBottom: 2,
      marginLeft: 4,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      gap: 12,
    },
    emptyIllo: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: isDark ? colors.primaryLight : '#E8F4EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
    },
    emptyMsg: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },
  });
