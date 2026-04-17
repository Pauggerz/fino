import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Dynamic Theme Hook
import type { RootStackParamList } from '../navigation/RootNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function FABActionSheet() {
  const navigation = useNavigation<NavProp>();
  const bottomSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  // 🌙 Dynamic Theme Injection
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // ─── DYNAMIC ACTIONS ARRAY ───
  // Moved inside useMemo so the colors adapt instantly when theme changes
  const ACTIONS = useMemo(
    () => [
      {
        key: 'expense' as const,
        icon: '↓',
        iconBg: isDark ? 'rgba(192,57,42,0.15)' : '#fde8e0',
        iconColor: isDark ? colors.expenseRed : '#c0391a',
        title: 'Log expense',
        sub: 'Record money you spent',
      },
      {
        key: 'income' as const,
        icon: '↑',
        iconBg: isDark ? 'rgba(45,106,79,0.15)' : '#e8f5ee',
        iconColor: isDark ? colors.incomeGreen : '#27500A',
        title: 'Log income',
        sub: 'Record money received',
      },
      {
        key: 'scan' as const,
        icon: '⊙',
        iconBg: isDark ? 'rgba(201,184,245,0.1)' : '#EEEDFE',
        iconColor: isDark ? colors.lavenderDark : '#4B2DA3',
        title: 'Scan receipt',
        sub: 'Auto-fill from a photo',
      },
    ],
    [colors, isDark]
  );

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        navigation.goBack();
      }
    },
    [navigation]
  );

  const handleAction = useCallback(
    (key: (typeof ACTIONS)[number]['key']) => {
      if (key === 'expense' || key === 'income') {
        navigation.replace('AddTransaction', { mode: key });
      } else if (key === 'scan') {
        navigation.replace('ScreenshotScreen');
      }
    },
    [navigation]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <View style={styles.container}>
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        enableDynamicSizing={true}
        enablePanDownToClose
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetLabel}>QUICK ADD</Text>

          {ACTIONS.map((action, idx) => (
            <TouchableOpacity
              key={action.key}
              activeOpacity={0.7}
              onPress={() => handleAction(action.key)}
              style={[styles.row, idx < ACTIONS.length - 1 && styles.rowBorder]}
              accessibilityRole="button"
              accessibilityLabel={action.title}
            >
              <View
                style={[styles.iconWrap, { backgroundColor: action.iconBg }]}
              >
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
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

// ─── DYNAMIC STYLES ───────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    sheetBackground: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetContent: {
      paddingTop: 10,
      paddingBottom: 40,
      paddingHorizontal: 20,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: isDark ? '#333333' : '#D8D6D0',
      borderRadius: 2,
      marginTop: 10,
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
      borderBottomColor: isDark ? '#333333' : 'rgba(30,30,46,0.06)',
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
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