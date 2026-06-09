import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/constants/theme';
import type { NotificationItem } from '@/hooks/useNotifications';

interface Props {
  item: NotificationItem;
  onPress?: () => void;
  onAction?: () => void;
  onDismiss?: () => void;
  onSnooze?: () => void;
}

type Visual = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  stripe: string;
};

function getVisual(
  type: NotificationItem['type'],
  colors: ThemeColors,
  isDark: boolean
): Visual {
  switch (type) {
    case 'warning':
      return {
        icon: 'alert-circle',
        iconColor: colors.expenseRed,
        iconBg: isDark ? 'rgba(224,92,92,0.14)' : '#FCECE9',
        stripe: colors.expenseRed,
      };
    case 'insight':
      return {
        icon: 'sparkles',
        iconColor: colors.insightPurple,
        iconBg: colors.lavenderLight,
        stripe: colors.insightPurple,
      };
    case 'tip':
      return {
        icon: 'bulb-outline',
        iconColor: colors.coral,
        iconBg: isDark ? 'rgba(232,133,106,0.14)' : colors.coralLight,
        stripe: colors.coral,
      };
    case 'achievement':
      return {
        icon: 'flame-outline',
        iconColor: colors.statWarnBar,
        iconBg: isDark ? '#3A2E1D' : '#FBF3E4',
        stripe: colors.statWarnBar,
      };
    case 'reminder':
    default:
      return {
        icon: 'receipt-outline',
        iconColor: colors.primary,
        iconBg: colors.primaryLight,
        stripe: colors.primary,
      };
  }
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

export default function NotificationCard({
  item,
  onPress,
  onAction,
  onDismiss,
  onSnooze,
}: Props) {
  const { colors, isDark } = useTheme();
  const visual = getVisual(item.type, colors, isDark);
  const styles = createStyles(colors, isDark);

  const isInsight = item.type === 'insight';
  // Snooze only makes sense for time-bound nudges; offer it on unread
  // reminders / warnings (bills, payday, budget) where deferring is meaningful.
  const canSnooze =
    !!onSnooze &&
    !item.isRead &&
    (item.type === 'reminder' || item.type === 'warning');

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        item.isRead && styles.cardRead,
        !item.isRead && { borderLeftColor: visual.stripe, borderLeftWidth: 3 },
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.iconBox, { backgroundColor: visual.iconBg }]}>
          <Ionicons name={visual.icon} size={20} color={visual.iconColor} />
        </View>
        <View style={styles.body}>
          {isInsight && (
            <View style={styles.intelBadge}>
              <Ionicons
                name="sparkles"
                size={10}
                color={colors.insightPurple}
              />
              <Text style={styles.intelBadgeText}>Fino Intelligence</Text>
            </View>
          )}
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.message}>{item.message}</Text>
        </View>
      </View>

      {(item.actionLabel || onDismiss || canSnooze) && (
        <View style={styles.actions}>
          {item.actionLabel && onAction && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onAction}
              style={[
                styles.actionBtn,
                item.type === 'warning' && {
                  backgroundColor: colors.expenseRed,
                },
                item.type === 'reminder' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  (item.type === 'warning' || item.type === 'reminder') && {
                    color: '#fff',
                  },
                ]}
              >
                {item.actionLabel}
              </Text>
            </TouchableOpacity>
          )}
          {canSnooze && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onSnooze}
              style={styles.dismissBtn}
              accessibilityLabel="Snooze for 1 hour"
            >
              <Text style={styles.dismissText}>Snooze 1h</Text>
            </TouchableOpacity>
          )}
          {onDismiss && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onDismiss}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.white,
      borderRadius: 16,
      padding: 14,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    cardRead: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      shadowOpacity: 0,
      opacity: 0.75,
    },
    top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    body: { flex: 1, minWidth: 0 },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    title: {
      flex: 1,
      fontFamily: 'Inter_700Bold',
      fontSize: 14.5,
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    time: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textSecondary,
    },
    message: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    intelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      backgroundColor: colors.lavenderLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginBottom: 5,
    },
    intelBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9.5,
      color: colors.insightPurple,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingLeft: 52,
    },
    actionBtn: {
      backgroundColor: isDark ? colors.surfaceSubdued : '#F0EFEA',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    actionText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    dismissBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    dismissText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
