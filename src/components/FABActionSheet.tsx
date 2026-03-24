import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../constants/theme';
import { transitions } from '../constants/transitions';
import type { RootStackParamList } from '../navigation/RootNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const ACTIONS = [
  {
    key: 'expense',
    icon: '↓',
    iconBg: '#fde8e0',
    iconColor: '#c0391a',
    title: 'Log expense',
    sub: 'Record money you spent',
  },
  {
    key: 'income',
    icon: '↑',
    iconBg: '#e8f5ee',
    iconColor: '#27500A',
    title: 'Log income',
    sub: 'Record money received',
  },
  {
    key: 'scan',
    icon: '⊙',
    iconBg: '#EEEDFE',
    iconColor: '#4B2DA3',
    title: 'Scan receipt',
    sub: 'Auto-fill from a photo',
  },
] as const;

export default function FABActionSheet() {
  const navigation = useNavigation<NavProp>();
  const slideAnim = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: transitions.SHEET_OPEN.duration,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const dismiss = (afterDismiss?: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 320,
      duration: transitions.SHEET_DISMISS_SAVE.duration,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      navigation.goBack();
      afterDismiss?.();
    });
  };

  const handleAction = (key: (typeof ACTIONS)[number]['key']) => {
    if (key === 'expense' || key === 'income') {
      // Slide down this sheet, then replace with AddTransaction in the chosen mode
      Animated.timing(slideAnim, {
        toValue: 320,
        duration: transitions.SHEET_DISMISS_SAVE.duration,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        navigation.replace('AddTransaction', { mode: key });
      });
    } else if (key === 'scan') {
      // Dismiss the sheet, then smoothly transition to the AI scanning screen
      dismiss(() => {
        navigation.navigate('ScreenshotScreen');
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Dimmed backdrop — tap to dismiss */}
      <TouchableWithoutFeedback onPress={() => dismiss()}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        <Text style={styles.sheetLabel}>QUICK ADD</Text>

        {ACTIONS.map((action, idx) => (
          <TouchableOpacity
            key={action.key}
            activeOpacity={0.7}
            onPress={() => handleAction(action.key)}
            style={[styles.row, idx < ACTIONS.length - 1 && styles.rowBorder]}
          >
            {/* Icon container — 40px as per spec */}
            <View style={[styles.iconWrap, { backgroundColor: action.iconBg }]}>
              <Text style={[styles.iconText, { color: action.iconColor }]}>
                {action.icon}
              </Text>
            </View>

            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{action.title}</Text>
              <Text style={styles.rowSub}>{action.sub}</Text>
            </View>

            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,30,46,0.4)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#D8D6D0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,30,46,0.06)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rowChevron: {
    fontSize: 20,
    color: colors.textSecondary,
    marginTop: -1,
  },
});
