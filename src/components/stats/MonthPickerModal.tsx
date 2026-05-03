import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2);

function opacityFor(distance: number) {
  if (distance === 0) return 1;
  if (distance === 1) return 0.45;
  if (distance === 2) return 0.2;
  return 0.1;
}

function WheelPicker({
  data,
  selectedValue,
  onValueChange,
  colors,
}: {
  data: { label: string; value: number }[];
  selectedValue: number;
  onValueChange: (val: number) => void;
  colors: any;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const initialIdx = Math.max(0, data.findIndex((d) => d.value === selectedValue));
  const [activeIndex, setActiveIndex] = useState(initialIdx);
  const lastHapticIndex = useRef(initialIdx);
  const isReady = useRef(false);

  const paddedData = useMemo(
    () => [
      ...Array(PADDING_ITEMS).fill({ label: '', value: -1 }),
      ...data,
      ...Array(PADDING_ITEMS).fill({ label: '', value: -1 }),
    ],
    [data]
  );

  useEffect(() => {
    const idx = data.findIndex((d) => d.value === selectedValue);
    if (idx >= 0) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
        // Settle window so the programmatic scroll doesn't fire haptics.
        setTimeout(() => { isReady.current = true; }, 120);
      }, 50);
      return () => clearTimeout(t);
    } else {
      isReady.current = true;
    }
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(Math.round(y / ITEM_HEIGHT), data.length - 1));
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      if (isReady.current && idx !== lastHapticIndex.current) {
        lastHapticIndex.current = idx;
        Haptics.selectionAsync();
      }
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(
      0,
      Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT), data.length - 1)
    );
    onValueChange(data[idx].value);
  };

  return (
    <View style={{ flex: 1, height: ITEM_HEIGHT * VISIBLE_ITEMS, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={32}
        onScroll={onScroll}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
      >
        {paddedData.map((item, i) => {
          const dataIndex = i - PADDING_ITEMS;
          const isPadding = dataIndex < 0 || dataIndex >= data.length;
          if (isPadding) {
            return <View key={`pad-${i}`} style={{ height: ITEM_HEIGHT }} />;
          }
          const distance = Math.abs(dataIndex - activeIndex);
          return (
            <View
              key={`${dataIndex}-${item.value}`}
              style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: 'Inter_400Regular',
                  color: colors.textPrimary,
                  opacity: opacityFor(distance),
                }}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MonthPickerModal({
  visible,
  year,
  month,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  year: number;
  month: number;
  onConfirm: (y: number, m: number) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);

  useEffect(() => {
    if (visible) {
      setDraftYear(year);
      setDraftMonth(month);
    }
  }, [visible, year, month]);

  const currentYear = new Date().getFullYear();
  const YEARS = useMemo(() => {
    const arr = [];
    for (let i = currentYear - 10; i <= currentYear + 5; i++) {
      arr.push({ label: String(i), value: i });
    }
    return arr;
  }, [currentYear]);

  const MONTHS = useMemo(
    () => MONTH_NAMES.map((name, index) => ({ label: name, value: index })),
    []
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Tap-outside catcher sits under the sheet (rendered first = lower z) */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}
        >
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={onClose} style={styles.toolbarBtn} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onConfirm(draftYear, draftMonth)}
              style={styles.toolbarBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmText}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pickerContainer}>
            {/* Selection bar spans both columns */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { justifyContent: 'center', paddingHorizontal: 16, pointerEvents: 'none' },
              ]}
            >
              <View
                style={{
                  height: ITEM_HEIGHT,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                  borderRadius: 10,
                }}
              />
            </View>

            {visible && (
              <>
                <WheelPicker
                  data={MONTHS}
                  selectedValue={draftMonth}
                  onValueChange={setDraftMonth}
                  colors={colors}
                />
                <WheelPicker
                  data={YEARS}
                  selectedValue={draftYear}
                  onValueChange={setDraftYear}
                  colors={colors}
                />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      backgroundColor: colors.white,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardBorderTransparent,
    },
    toolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.cardBorderTransparent,
    },
    toolbarBtn: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    cancelText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 16,
      color: colors.textSecondary,
    },
    confirmText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: colors.primary,
    },
    pickerContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
    },
  });
}
