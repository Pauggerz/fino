import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
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
 * Unread-notification indicator overlaid on the Home greeting avatar.
 *
 * Owns its own notifications subscription so count changes re-render only this
 * dot, never the whole HomeScreen (§6.33). Pulses gently while there is an
 * unread high-priority warning, drawing the eye without nagging. Renders
 * nothing when nothing is unread. Tapping is owned by the avatar it sits on,
 * which opens the profile sidebar (the sidebar links through to the inbox).
 *
 * `borderColor` should match the surface behind the avatar so the dot reads as
 * cleanly cut out from it.
 */
export default function HomeNotificationDot({
  borderColor,
}: {
  borderColor: string;
}) {
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
          withTiming(1.25, { duration: 600 }),
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

  if (unreadCount === 0) return null;

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: colors.expenseRed, borderColor },
        animStyle,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
