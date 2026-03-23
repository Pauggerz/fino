import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { colors } from '../constants/theme';
import { transitions } from '../constants/transitions';

export type ToastType = 'success' | 'undo';

interface ToastProps {
  visible: boolean;
  title: string;
  subtitle: string;
  type?: ToastType;
  onUndo?: () => void;
  /** Called after the 3500 ms auto-dismiss timer fires. Parent should set visible=false. */
  onDismiss?: () => void;
}

export default function Toast({
  visible,
  title,
  subtitle,
  type = 'success',
  onUndo,
  onDismiss,
}: ToastProps) {
  // spec: entry slides from translateY(-40) → 0, 220ms spring overshoot
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // ── Enter / exit animation ──
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: transitions.TOAST_ENTER.duration, // 220 ms
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -40,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  // ── Auto-dismiss after 3500 ms ──
  useEffect(() => {
    const timer = visible
      ? setTimeout(() => {
          onDismiss?.();
        }, transitions.TOAST_AUTO_DISMISS) // 3500 ms
      : null;
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [visible, onDismiss]);

  const isSuccess = type === 'success';

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity,
          transform: [{ translateY }],
          pointerEvents: visible ? 'auto' : 'none',
        },
      ]}
    >
      {/* ── Icon ── */}
      <View
        style={[
          styles.toastIcon,
          isSuccess ? styles.toastIconSuccess : styles.toastIconUndo,
        ]}
      >
        <Text
          style={[
            styles.toastIconText,
            { color: isSuccess ? colors.primary : colors.coral },
          ]}
        >
          {isSuccess ? '✓' : '↩'}
        </Text>
      </View>

      {/* ── Content ── */}
      <View style={styles.content}>
        <Text style={styles.toastTitle}>{title}</Text>
        <Text style={styles.toastSub}>{subtitle}</Text>
      </View>

      {/* ── Undo action — hidden on undo-variant toast ── */}
      {onUndo && (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={onUndo}
          style={styles.undoBtn}
        >
          <Text style={styles.toastUndoText}>Undo</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    // spec: top:56 — using platform offset for safe area
    top: Platform.OS === 'ios' ? 56 : 56,
    left: 12,
    right: 12,
    backgroundColor: colors.textPrimary, // #1E1E2E
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 300,
  },
  toastIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  toastIconSuccess: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  toastIconUndo: {
    backgroundColor: colors.coralLight,
    borderColor: colors.coral,
  },
  toastIconText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  toastTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.white,
  },
  toastSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
  undoBtn: {
    marginLeft: 'auto',
    paddingLeft: 8,
  },
  toastUndoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'underline',
  },
});
