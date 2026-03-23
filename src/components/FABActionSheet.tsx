import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../constants/theme';
import { transitions } from '../constants/transitions';

const { height } = Dimensions.get('window');

interface FABActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onManualEntry: () => void;
  onScanReceipt: () => void;
}

export default function FABActionSheet({
  visible,
  onClose,
  onManualEntry,
  onScanReceipt,
}: FABActionSheetProps) {
  const translateY = useRef(new Animated.Value(height)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide up and fade in background
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: transitions.SHEET_OPEN.duration, // 340ms
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: transitions.SHEET_OPEN.duration,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide down and fade out
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: height,
          duration: transitions.SHEET_DISMISS_SAVE.duration, // 280ms
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: transitions.SHEET_DISMISS_SAVE.duration,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  // Wrap the onClose trigger to allow the exit animation to play before unmounting
  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: height,
        duration: transitions.SHEET_DISMISS_SAVE.duration,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: transitions.SHEET_DISMISS_SAVE.duration,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        {/* Dark dimming backdrop */}
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.backdrop, { opacity }]} />
        </TouchableWithoutFeedback>

        {/* Sliding Sheet */}
        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}>
          <View style={styles.handleBar} />
          
          <Text style={styles.title}>Add Transaction</Text>

          <View style={styles.actionRow}>
            {/* Manual Entry Action */}
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: colors.primaryLight }]} 
              activeOpacity={0.8}
              onPress={() => {
                handleClose();
                setTimeout(onManualEntry, transitions.SHEET_DISMISS_SAVE.duration);
              }}
            >
              <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
                <Ionicons name="pencil" size={24} color={colors.white} />
              </View>
              <Text style={styles.actionText}>Manual Entry</Text>
            </TouchableOpacity>

            {/* Scan Receipt Action (AI Surface) */}
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: colors.lavenderLight }]} 
              activeOpacity={0.8}
              onPress={() => {
                handleClose();
                setTimeout(onScanReceipt, transitions.SHEET_DISMISS_SAVE.duration);
              }}
            >
              <View style={[styles.iconContainer, { backgroundColor: colors.lavenderDark }]}>
                <Ionicons name="camera" size={24} color={colors.white} />
              </View>
              <Text style={styles.actionText}>Scan Receipt</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>✦ AI</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheetContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet, // 24
    borderTopRightRadius: radius.sheet, // 24
    paddingHorizontal: spacing.screenPadding, // 20
    paddingBottom: 40, // Extra padding for iOS safe area
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sectionGap, // 28
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary, // #1E1E2E
    marginBottom: spacing.sectionGap, // 28
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.card, // 16
    padding: spacing.cardPadding, // 20
    alignItems: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  badge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.lavenderDark, // #4B2DA3
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill, // 9999
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});