import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { colors } from '../constants/theme';

export type ToastType = 'success' | 'undo';

interface ToastProps {
  visible: boolean;
  title: string;
  subtitle: string;
  type?: ToastType;
  onUndo?: () => void;
}

export default function Toast({ 
  visible, 
  title, 
  subtitle, 
  type = 'success', 
  onUndo 
}: ToastProps) {
  // Animation values
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Replicates: cubic-bezier(0.34, 1.56, 0.64, 1) ease-in animation
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -80,
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

  const isSuccess = type === 'success';

  return (
    <Animated.View 
      style={[
        styles.toastContainer, 
        { 
          opacity, 
          transform: [{ translateY }],
          // Ensure it doesn't block touches when invisible
          pointerEvents: visible ? 'auto' : 'none' 
        }
      ]}
    >
      {/* ── ICON ── */}
      <View style={[
        styles.toastIcon, 
        isSuccess ? styles.toastIconSuccess : styles.toastIconUndo
      ]}>
        <Text style={[
          styles.toastIconText, 
          isSuccess ? { color: colors.primary } : { color: colors.coral }
        ]}>
          {isSuccess ? '✓' : '↩'}
        </Text>
      </View>

      {/* ── CONTENT ── */}
      <View style={styles.content}>
        <Text style={styles.toastTitle}>{title}</Text>
        <Text style={styles.toastSub}>{subtitle}</Text>
      </View>

      {/* ── UNDO ACTION ── */}
      {onUndo && (
        <TouchableOpacity activeOpacity={0.6} onPress={onUndo} style={styles.undoBtn}>
          <Text style={styles.toastUndoText}>Undo</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 56, // Adjust for iOS notch/safe area
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
    backgroundColor: colors.primaryLight, // #EBF2EE
    borderColor: colors.primary, // #5B8C6E
  },
  toastIconUndo: {
    backgroundColor: colors.coralLight, // #FBF0EC
    borderColor: colors.coral, // #E8856A
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