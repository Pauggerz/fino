import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { radius } from '@/constants/theme';
import type { Account } from '@/types';
import { saveAdjustment } from '@/services/transactionMutations';

interface AdjustBalanceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account: Account;
  colors: any;
  isDark: boolean;
}

function fmtPeso(n: number): string {
  return `₱${Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdjustBalanceSheet({
  visible,
  onClose,
  onSuccess,
  account,
  colors,
  isDark,
}: AdjustBalanceSheetProps) {
  const [newBalance, setNewBalance] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const currentBalance = account.balance;

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(newBalance);
    if (Number.isNaN(parsed) || parsed === currentBalance) return;
    setSaving(true);
    try {
      await saveAdjustment({
        account,
        currentBalance,
        newBalance: parsed,
        note: adjustNote,
      });
      setNewBalance('');
      setAdjustNote('');
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [account, currentBalance, newBalance, adjustNote, onSuccess, onClose]);

  const handleClose = useCallback(() => {
    setNewBalance('');
    setAdjustNote('');
    onClose();
  }, [onClose]);

  if (!visible) return null;

  const addBg = isDark ? 'rgba(106,158,127,0.15)' : 'rgba(91,140,110,0.08)';
  const removeBg = isDark ? 'rgba(255,107,107,0.15)' : 'rgba(192,80,58,0.08)';

  const parsedNew = parseFloat(newBalance);
  const diff =
    !Number.isNaN(parsedNew) && newBalance !== ''
      ? parsedNew - currentBalance
      : null;
  const isAdd = diff !== null && diff > 0;
  const isSaveDisabled =
    saving ||
    !newBalance ||
    Number.isNaN(parseFloat(newBalance)) ||
    parseFloat(newBalance) === currentBalance;

  return (
    <BottomSheet
      index={0}
      snapPoints={['60%']}
      enablePanDownToClose
      keyboardBehavior={Platform.OS === 'ios' ? 'interactive' : 'fillParent'}
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustPan"
      backdropComponent={({ animatedIndex, animatedPosition, style }) => (
        <BottomSheetBackdrop
          animatedIndex={animatedIndex}
          animatedPosition={animatedPosition}
          style={style}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
      backgroundStyle={{ backgroundColor: colors.white }}
      handleIndicatorStyle={{ backgroundColor: isDark ? '#555' : '#ccc' }}
      onClose={handleClose}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
      >
        <Text style={styles.title}>Reconcile Balance</Text>
        <Text style={styles.sub}>
          Enter your actual wallet amount. We&apos;ll log the difference
          automatically.
        </Text>

        <View style={styles.compareRow}>
          <View style={styles.compareBox}>
            <Text style={styles.compareLabel}>Current</Text>
            <Text style={styles.compareValue}>{fmtPeso(currentBalance)}</Text>
          </View>
          <Text style={styles.compareArrow}>→</Text>
          <View style={[styles.compareBox, styles.compareBoxNew]}>
            <Text style={styles.compareLabel}>New</Text>
            <Text
              style={[
                styles.compareValue,
                {
                  color: (() => {
                    if (Number.isNaN(parsedNew) || newBalance === '')
                      return colors.textSecondary;
                    return parsedNew >= currentBalance
                      ? colors.incomeGreen
                      : colors.expenseRed;
                  })(),
                },
              ]}
            >
              {Number.isNaN(parsedNew) || newBalance === ''
                ? '₱ —'
                : fmtPeso(parsedNew)}
            </Text>
          </View>
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.inputPrefix}>₱</Text>
          <BottomSheetTextInput
            style={styles.inputField}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            value={newBalance}
            onChangeText={setNewBalance}
            returnKeyType="done"
          />
        </View>

        {diff !== null && newBalance !== '' && diff !== 0 && (
          <View
            style={[
              styles.diffCard,
              {
                backgroundColor: isAdd ? addBg : removeBg,
                borderColor: isAdd ? colors.incomeGreen : colors.expenseRed,
              },
            ]}
          >
            <Text
              style={[
                styles.diffText,
                { color: isAdd ? colors.incomeGreen : colors.expenseRed },
              ]}
            >
              {isAdd ? '▲' : '▼'} {fmtPeso(Math.abs(diff))} will be recorded as{' '}
              <Text style={{ fontFamily: 'Inter_700Bold' }}>
                {isAdd ? 'income' : 'expense'}
              </Text>
            </Text>
          </View>
        )}

        <BottomSheetTextInput
          style={styles.noteInput}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textSecondary}
          value={adjustNote}
          onChangeText={setAdjustNote}
          returnKeyType="done"
        />

        <TouchableOpacity
          style={[styles.saveBtn, { opacity: isSaveDisabled ? 0.45 : 1 }]}
          onPress={handleSave}
          disabled={isSaveDisabled}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving…' : 'Save Adjustment'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    content: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
    title: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 24,
    },
    compareRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 20,
    },
    compareBox: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: radius.card,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
    },
    compareBoxNew: {
      borderColor: isDark ? '#444444' : 'rgba(30,30,46,0.14)',
      borderStyle: 'dashed',
    },
    compareLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    compareValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.textPrimary,
    },
    compareArrow: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 18,
      color: colors.textSecondary,
    },
    inputWrap: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: radius.card,
      borderWidth: 1.5,
      borderColor: colors.primary,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    inputPrefix: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 20,
      color: colors.primary,
      marginRight: 6,
    },
    inputField: {
      flex: 1,
      fontFamily: 'DMMono_500Medium',
      fontSize: 24,
      color: colors.textPrimary,
      paddingVertical: 14,
    },
    diffCard: {
      width: '100%',
      borderRadius: radius.card,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    diffText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    noteInput: {
      width: '100%',
      backgroundColor: colors.background,
      borderRadius: radius.card,
      paddingVertical: 11,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.1)',
      marginBottom: 20,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      width: '100%',
      paddingVertical: 16,
      borderRadius: radius.button,
      alignItems: 'center',
      marginBottom: 4,
    },
    saveBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#FFFFFF',
    },
    cancelBtn: { width: '100%', paddingVertical: 16, alignItems: 'center' },
    cancelBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: colors.textSecondary,
    },
  });
