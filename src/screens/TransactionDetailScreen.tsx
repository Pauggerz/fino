import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, spacing } from '../constants/theme';
import { supabase } from '@/services/supabase';
import type { Transaction } from '@/types';
import type { FeedStackParamList } from '../navigation/RootNavigator';

// ─── Category → hero background colour ──────────────────────────────────────

const CAT_BG_MAP: Record<string, string> = {
  food: colors.catFoodBg,
  transport: colors.catTransportBg,
  shopping: colors.catShoppingBg,
  bills: colors.catBillsBg,
  health: colors.catHealthBg,
};

function heroBg(category: string | null): string {
  if (!category) return '#F5F5F5';
  return CAT_BG_MAP[category.toLowerCase()] ?? '#F5F5F5';
}

// ─── Types ───────────────────────────────────────────────────────────────────

type DetailRouteProp = RouteProp<FeedStackParamList, 'TransactionDetail'>;

interface TransactionWithAccount extends Transaction {
  account_name: string;
  account_brand_colour: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<DetailRouteProp>();
  const transactionId = route.params?.id;

  const [tx, setTx] = useState<TransactionWithAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const [isReceiptVisible, setIsReceiptVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editedName, setEditedName] = useState('');
  const [editedNote, setEditedNote] = useState('');

  // ── Fetch transaction ──
  const fetchTx = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('transactions')
      .select('*, accounts(name, brand_colour)')
      .eq('id', transactionId)
      .single();

    if (!error && data) {
      const row: TransactionWithAccount = {
        ...data,
        accounts: undefined,
        account_name: (data.accounts as any)?.name ?? '',
        account_brand_colour: (data.accounts as any)?.brand_colour ?? '#888',
      };
      setTx(row);
      setEditedName(row.display_name ?? row.merchant_name ?? '');
      setEditedNote(row.transaction_note ?? '');
    }

    setLoading(false);
  }, [transactionId]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  // ── Save edits ──
  const handleSave = async () => {
    if (!tx) return;
    setIsSaving(true);

    await supabase
      .from('transactions')
      .update({
        display_name: editedName || null,
        transaction_note: editedNote || null,
      })
      .eq('id', tx.id);

    setTx({ ...tx, display_name: editedName, transaction_note: editedNote });
    setIsSaving(false);
    setIsEditing(false);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!tx) return;
    setIsDeleting(true);

    // Delete the transaction
    await supabase.from('transactions').delete().eq('id', tx.id);

    // Restore account balance
    if (!tx.account_deleted) {
      const { data: acct } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', tx.account_id)
        .single();

      if (acct) {
        const restored =
          tx.type === 'expense'
            ? acct.balance + tx.amount
            : acct.balance - tx.amount;
        await supabase
          .from('accounts')
          .update({ balance: restored })
          .eq('id', tx.account_id);
      }
    }

    setIsDeleting(false);
    setIsDeleteConfirmVisible(false);
    navigation.goBack();
  };

  // ── Loading / not found ──
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!tx) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontFamily: 'Inter_400Regular', color: colors.textSecondary }}>
          Transaction not found.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isExpense = tx.type === 'expense';
  const displayName = tx.display_name ?? tx.merchant_name ?? tx.category ?? '—';
  const date = new Date(tx.date);
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const bgColor = heroBg(tx.category);

  return (
    <View style={styles.container}>
      {/* ─── DYNAMIC HERO ─── */}
      <View style={[styles.detailHero, { backgroundColor: bgColor }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.heroContent}>
          <View style={[styles.heroIconBox, { backgroundColor: colors.white }]}>
            <Text style={{ fontSize: 28 }}>
              {isExpense ? '💸' : '💵'}
            </Text>
          </View>

          {isEditing ? (
            <View style={styles.editAmountRow}>
              <Text style={styles.txAmount}>{isExpense ? '-' : '+'}₱</Text>
              <Text style={styles.txAmount}>
                {tx.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          ) : (
            <Text style={styles.txAmount}>
              {isExpense ? '-' : '+'}₱
              {tx.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Text>
          )}

          {isEditing ? (
            <TextInput
              style={[styles.merchantName, styles.heroInput]}
              value={editedName}
              onChangeText={setEditedName}
            />
          ) : (
            <Text style={styles.merchantName}>{displayName}</Text>
          )}

          <Text style={styles.heroMeta}>{dateStr} at {timeStr}</Text>
        </View>
      </View>

      {/* ─── DETAIL CARD & ACTIONS ─── */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailCard}>
          <DetailRow label="Account" value={tx.account_name} />
          <DetailRow label="Date & time" value={`${dateStr}, ${timeStr}`} />
          <DetailRow label="Category" value={tx.category ?? '—'} />

          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Note</Text>
            {isEditing ? (
              <TextInput
                style={styles.rowInput}
                value={editedNote}
                onChangeText={setEditedNote}
                placeholder="Add a note..."
                placeholderTextColor={colors.textSecondary}
              />
            ) : (
              <Text style={styles.rowValue}>{tx.transaction_note || '—'}</Text>
            )}
          </View>
        </View>

        {tx.receipt_url ? (
          <View style={styles.receiptContainer}>
            <Text style={styles.sectionLabel}>Receipt</Text>
            <TouchableOpacity onPress={() => setIsReceiptVisible(true)} activeOpacity={0.8}>
              <Image source={{ uri: tx.receipt_url }} style={styles.receiptThumbnail} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.actionsContainer}>
          {isEditing ? (
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
              activeOpacity={0.8}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.editBtn}
              activeOpacity={0.8}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.editBtnText}>Edit Transaction</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.deleteBtnBox}
            activeOpacity={0.7}
            onPress={() => setIsDeleteConfirmVisible(true)}
          >
            <Ionicons name="trash-outline" size={18} color="#E57373" />
            <Text style={styles.deleteBtnBoxText}>Delete transaction</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ─── RECEIPT MODAL ─── */}
      <Modal visible={isReceiptVisible} transparent animationType="fade">
        <View style={styles.receiptModalBg}>
          <TouchableOpacity
            style={styles.receiptModalClose}
            onPress={() => setIsReceiptVisible(false)}
          >
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          <Image
            source={{ uri: tx.receipt_url! }}
            style={styles.receiptFullscreen}
            resizeMode="contain"
          />
        </View>
      </Modal>

      {/* ─── DELETE CONFIRM MODAL ─── */}
      <Modal visible={isDeleteConfirmVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetDismissArea}
            onPress={() => !isDeleting && setIsDeleteConfirmVisible(false)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Delete Transaction?</Text>
            <Text style={styles.sheetCopy}>
              This will remove{' '}
              <Text style={styles.sheetCopyBold}>
                ₱{tx.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Text>{' '}
              from your{' '}
              <Text style={styles.sheetCopyBold}>{tx.category ?? 'Other'}</Text>{' '}
              category and restore it to your{' '}
              <Text style={styles.sheetCopyBold}>{tx.account_name}</Text> balance.
              This cannot be undone.
            </Text>
            <TouchableOpacity
              style={[styles.sheetConfirmBtn, isDeleting && { opacity: 0.6 }]}
              activeOpacity={0.8}
              onPress={handleDelete}
              disabled={isDeleting}
            >
              <Text style={styles.sheetConfirmText}>
                {isDeleting ? 'Deleting…' : 'Yes, delete it'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setIsDeleteConfirmVisible(false)}
              disabled={isDeleting}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Reusable row ────────────────────────────────────────────────────────────

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F5F2' },
  detailHero: {
    paddingTop: 60,
    paddingBottom: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 24,
  },
  backBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  heroContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  heroIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  editAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 32,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  merchantName: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  heroInput: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 0,
    minWidth: 100,
    textAlign: 'center',
  },
  heroMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  scrollContent: { padding: spacing.screenPadding },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFEA',
  },
  rowLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
  },
  rowValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
    maxWidth: '65%',
    textAlign: 'right',
  },
  rowInput: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.primary,
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  receiptContainer: { marginBottom: 32 },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    marginLeft: 4,
  },
  receiptThumbnail: {
    width: 80,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#EAE8E3',
  },
  actionsContainer: { alignItems: 'center', marginTop: 8 },
  editBtn: {
    backgroundColor: '#EBE9FE',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  editBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#4B2DA3',
  },
  saveBtn: {
    backgroundColor: colors.primary,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.white,
  },
  deleteBtnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    backgroundColor: '#FFF5F5',
    marginTop: 16,
    gap: 6,
  },
  deleteBtnBoxText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#E57373',
  },
  receiptModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptModalClose: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  receiptFullscreen: { width: '100%', height: '80%' },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetDismissArea: { flex: 1 },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0DFD7',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetTitle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  sheetCopy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 32,
  },
  sheetCopyBold: { fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  sheetConfirmBtn: {
    backgroundColor: '#E57373',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetConfirmText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  sheetCancelBtn: { paddingVertical: 16, alignItems: 'center' },
  sheetCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textSecondary,
  },
});
