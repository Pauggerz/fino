import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../constants/theme';
import { transitions } from '../constants/transitions';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  onHide: () => void;
}

export default function Toast({ visible, message, type = 'success', onHide }: ToastProps) {
  // Start slightly below the screen for a smooth slide-up effect
  const translateY = useRef(new Animated.Value(50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Enter animation
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: transitions.TOAST_ENTER.duration, // 220ms
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: transitions.TOAST_ENTER.duration, // 220ms
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss timer
      const timer = setTimeout(() => {
        hideToast();
      }, transitions.TOAST_AUTO_DISMISS); // 3500ms

      return () => clearTimeout(timer);
    }
  }, [visible, translateY, opacity]);

  const hideToast = () => {
    // Exit animation
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 50,
        duration: transitions.TOAST_ENTER.duration,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: transitions.TOAST_ENTER.duration,
        useNativeDriver: true,
      }),
    ]).start(() => onHide());
  };

  // Do not render anything if not visible and animation is done
  if (!visible && opacity.valueOf() === 0) return null;

  // Map icon and color based on the toast type
  let iconName: keyof typeof Ionicons.glyphMap = 'checkmark-circle';
  let iconColor = colors.mint; // #A8D5B5

  if (type === 'error') {
    iconName = 'alert-circle';
    iconColor = colors.expenseRed; // #C0503A
  } else if (type === 'info') {
    iconName = 'information-circle';
    iconColor = colors.accountGCash; // #007DFF
  }

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.content}>
        <Ionicons name={iconName} size={20} color={iconColor} style={styles.icon} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 110, // Sits comfortably above the TabBar (82px) + padding
    left: spacing.screenPadding, // 20px
    right: spacing.screenPadding, // 20px
    alignItems: 'center',
    zIndex: 9999, // Ensure it floats above modals and screens
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textPrimary, // #1E1E2E (High contrast dark pill)
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.pill, // 9999
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  icon: {
    marginRight: 10,
  },
  message: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});