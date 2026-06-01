import React, { useEffect } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * Notification bell for the Home hero header.
 *
 * Owns its own notifications subscription so count changes re-render only this
 * component, never the whole HomeScreen (§6.33). Pulses gently while there is an
 * unread high-priority warning, drawing the eye without nagging.
 */
export default function HomeBellButton({ color }: { color: string }) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { notifications, unreadCount } = useNotifications();

  const hasUnreadWarning = notifications.some(
    (n) => !n.isRead && n.type === 'warning'
  );

  const scale = useSharedValue(1);
  useEffect(() => {
    if (hasUnreadWarning) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(scale);
  }, [hasUnreadWarning, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate('Notifications')}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={`Notifications, ${unreadCount} unread`}
    >
      <Animated.View style={animStyle}>
        <Ionicons name="notifications-outline" size={22} color={color} />
        {unreadCount > 0 && (
          <View
            style={[styles.badge, { backgroundColor: colors.expenseRed }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 13,
  },
});
