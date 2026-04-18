import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { radius } from '@/constants/theme';
import type { Account } from '@/types';
import { saveTransfer } from '@/services/transactionMutations';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sourceAccount: Account;
  otherAccounts: Account[];
  colors: any;
  isDark: boolean;
}

function fmtPeso(n: number): string {
  return `₱${Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function TransferModal({
  visible,
  onClose,
  onSuccess,
  sourceAccount,
  otherAccounts,
  colors,
  isDark,
}: TransferModalProps) {
  const [transferDestId, setTransferDestId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(transferAmount);
    if (!transferDestId || Number.isNaN(parsed) || parsed <= 0) return;
    const destAccount = otherAccounts.find((a) => a.id === transferDestId);
    if (!destAccount) return;
    setSaving(true);
    try {
      await saveTransfer({ sourceAccount, destAccount, amount: parsed });
      setTransferAmount('');
      setTransferDestId('');
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    transferDestId,
    transferAmount,
    otherAccounts,
    sourceAccount,
    onSuccess,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    setTransferAmount('');
    setTransferDestId('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={() => {
        setTimeout(() => inputRef.current?.focus(), 150);
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Transfer Money</Text>
          <Text style={styles.sub}>
            Move funds from{' '}
            <Text style={{ fontFamily: 'Inter_700Bold' }}>
              {sourceAccount.name}
            </Text>{' '}
            to another account.
          </Text>

          {otherAccounts.length === 0 ? (
            <Text style={styles.emptyText}>No other accounts available.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accountsContent}
              style={styles.accountsWrap}
            >
              {otherAccounts.map((acct) => {
                const isSelected = transferDestId === acct.id;
                return (
                  <TouchableOpacity
                    key={acct.id}
                    style={[
                      styles.acctChip,
                      isSelected && {
                        borderColor: acct.brand_colour,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => setTransferDestId(acct.id)}
                  >
                    <View
                      style={[
                        styles.acctAvatar,
                        { backgroundColor: acct.brand_colour },
                      ]}
                    >
                      <Text style={styles.acctLetter}>
                        {acct.letter_avatar}
                      </Text>
                    </View>
                    <Text style={styles.acctName} numberOfLines={1}>
                      {acct.name}
                    </Text>
                    <Text style={styles.acctBal}>{fmtPeso(acct.balance)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TextInput
            ref={inputRef}
            style={[styles.input, { marginTop: 16 }]}
            placeholder="Amount to transfer"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            value={transferAmount}
            onChangeText={setTransferAmount}
          />

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              { marginTop: 20, opacity: saving || !transferDestId ? 0.6 : 1 },
            ]}
            onPress={handleSave}
            disabled={saving || !transferDestId}
          >
            <Text style={styles.confirmBtnText}>
              {saving ? 'Transferring…' : 'Confirm Transfer'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      padding: 24,
      paddingBottom: 40,
      alignItems: 'center',
    },
    title: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    sub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    accountsWrap: { width: '100%', marginBottom: 4 },
    accountsContent: { gap: 10, paddingVertical: 4 },
    acctChip: {
      width: 100,
      backgroundColor: colors.background,
      borderRadius: radius.card,
      padding: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
    },
    acctAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acctLetter: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
    acctName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    acctBal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 10,
      color: colors.textSecondary,
    },
    input: {
      width: '100%',
      backgroundColor: colors.background,
      borderRadius: radius.card,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.1)',
    },
    confirmBtn: {
      backgroundColor: colors.primary,
      width: '100%',
      paddingVertical: 16,
      borderRadius: radius.button,
      alignItems: 'center',
      marginBottom: 12,
    },
    confirmBtnText: {
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
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 24,
    },
  });
