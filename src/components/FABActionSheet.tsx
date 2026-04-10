import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Keyboard,
  InteractionManager,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { colors } from '../constants/theme';
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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const nextActionRef = useRef<(() => void) | null>(null);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        const action = nextActionRef.current;
        nextActionRef.current = null;

        if (action) {
          InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(action);
          });
        } else {
          navigation.goBack();
        }
      }
    },
    [navigation]
  );

  const dismiss = useCallback((action?: () => void) => {
    Keyboard.dismiss();
    nextActionRef.current = action ?? null;
    bottomSheetRef.current?.close();
  }, []);

  const handleAction = useCallback(
    (key: (typeof ACTIONS)[number]['key']) => {
      if (key === 'expense' || key === 'income') {
        dismiss(() => {
          navigation.replace('AddTransaction', { mode: key });
        });
      } else if (key === 'scan') {
        dismiss(() => {
          navigation.replace('ScreenshotScreen');
        });
      }
    },
    [dismiss, navigation]
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
        onChange={
          handleSheetChanges
        } /* 👈 FIX: Uses onChange instead of onClose */
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

const styles = StyleSheet.create({
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
    backgroundColor: '#D8D6D0',
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
