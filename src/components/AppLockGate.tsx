import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAppLock } from '../contexts/AppLockContext';

/**
 * Covers the app with a lock screen whenever app-lock is enabled and the app is
 * locked (cold start / returned from background). Children stay mounted behind
 * the overlay so navigation state survives a lock/unlock cycle.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { enabled, isLocked, unlock } = useAppLock();
  // Auto-prompt once each time the lock engages; the button re-triggers after
  // a cancel without looping.
  const promptedFor = useRef(false);

  const locked = enabled && isLocked;

  useEffect(() => {
    if (!locked) {
      promptedFor.current = false;
      return;
    }
    if (promptedFor.current) return;
    promptedFor.current = true;
    unlock();
  }, [locked, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.center}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: colors.accentMuted },
              ]}
            >
              <Ionicons
                name="lock-closed"
                size={34}
                color={colors.accentMutedOn}
              />
            </View>
            <Text style={[styles.wordmark, { color: colors.textPrimary }]}>
              Fino
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Locked for your privacy
            </Text>
          </View>
          <TouchableOpacity
            onPress={unlock}
            activeOpacity={0.85}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Ionicons
              name="finger-print"
              size={20}
              color={colors.accentOn}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.buttonLabel, { color: colors.accentOn }]}>
              Unlock
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  wordmark: {
    fontFamily: 'Nunito_900Black',
    fontSize: 34,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginTop: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  buttonLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
});
