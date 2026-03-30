import React, { useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, radius, spacing } from '../constants/theme';
import type { FeedStackParamList } from '../navigation/RootNavigator';

// ─── MOCK DATABASE WITH ICONS ───────────────────────────────────────────────
const MOCK_DB: Record<string, any> = {
  '1': {
    id: '1',
    merchant: 'Jollibee Drive Thru',
    category: 'Food',
    icon: 'fast-food',
    iconBg: colors.pillFoodBg,
    iconColor: colors.pillFoodText,
    amount: '185.00',
    account: 'GCash',
    date: 'March 26, 2026',
    time: '12:30 PM',
    isExpense: true,
    note: 'Lunch with the dev team',
    receipt_url:
      'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&q=80',
  },
  '2': {
    id: '2',
    merchant: 'Freelance Payout',
    category: 'Income',
    icon: 'cash',
    iconBg: '#E8F5EE',
    iconColor: '#27500A',
    amount: '25000.00',
    account: 'BDO',
    date: 'March 26, 2026',
    time: '09:00 AM',
    isExpense: false,
    note: 'Phase 2 UI Milestone',
  },
};

type DetailRouteProp = RouteProp<FeedStackParamList, 'TransactionDetail'>;

export default function TransactionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<DetailRouteProp>();

  const transactionId = route.params?.id || '1';
  const initialTx = MOCK_DB[transactionId];

  // Modals & Edit States
  const [isReceiptVisible, setIsReceiptVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Editable Form State
  const [tx, setTx] = useState(initialTx);
  const [editedMerchant, setEditedMerchant] = useState(initialTx?.merchant);
  const [editedAmount, setEditedAmount] = useState(initialTx?.amount);
  const [editedNote, setEditedNote] = useState(initialTx?.note);

  if (!tx) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <Text>Transaction not found.</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSave = () => {
    setTx({
      ...tx,
      merchant: editedMerchant,
      amount: editedAmount,
      note: editedNote,
    });
    setIsEditing(false);
  };

  return (
    <View style={styles.container}>
      {/* ─── DYNAMIC HERO SECTION ─── */}
      <View style={[styles.detailHero, { backgroundColor: tx.iconBg }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.heroContent}>
          <View style={[styles.heroIconBox, { backgroundColor: colors.white }]}>
            <Ionicons name={tx.icon} size={32} color={tx.iconColor} />
          </View>

          {isEditing ? (
            <View style={styles.editAmountRow}>
              <Text style={styles.txAmount}>{tx.isExpense ? '-' : '+'}₱</Text>
              <TextInput
                style={[styles.txAmount, styles.heroInput, { flex: 0 }]}
                value={editedAmount}
                onChangeText={setEditedAmount}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
          ) : (
            <Text style={styles.txAmount}>
              {tx.isExpense ? '-' : '+'}₱{parseFloat(tx.amount).toFixed(2)}
            </Text>
          )}

          {isEditing ? (
            <TextInput
              style={[styles.merchantName, styles.heroInput]}
              value={editedMerchant}
              onChangeText={setEditedMerchant}
            />
          ) : (
            <Text style={styles.merchantName}>{tx.merchant}</Text>
          )}

          <Text style={styles.heroMeta}>
            {tx.date} at {tx.time}
          </Text>
        </View>
      </View>

      {/* ─── DETAIL CARD & ACTIONS ─── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailCard}>
          <DetailRow label="Account" value={tx.account} />
          <DetailRow label="Date & time" value={`${tx.date}, ${tx.time}`} />
          <DetailRow label="Category" value={tx.category} />

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
              <Text style={styles.rowValue}>{tx.note || '—'}</Text>
            )}
          </View>
        </View>

        {tx.receipt_url ? (
          <View style={styles.receiptContainer}>
            <Text style={styles.sectionLabel}>Receipt</Text>
            <TouchableOpacity
              onPress={() => setIsReceiptVisible(true)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: tx.receipt_url }}
                style={styles.receiptThumbnail}
              />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.actionsContainer}>
          {isEditing ? (
            <TouchableOpacity
              style={styles.saveBtn}
              activeOpacity={0.8}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>Save Changes</Text>
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

      {/* ─── MODALS ─── */}
      <Modal visible={isReceiptVisible} transparent={true} animationType="fade">
        <View style={styles.receiptModalBg}>
          <TouchableOpacity
            style={styles.receiptModalClose}
            onPress={() => setIsReceiptVisible(false)}
          >
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          <Image
            source={{ uri: tx.receipt_url }}
            style={styles.receiptFullscreen}
            resizeMode="contain"
          />
        </View>
      </Modal>

      <Modal
        visible={isDeleteConfirmVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetDismissArea}
            onPress={() => setIsDeleteConfirmVisible(false)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Delete Transaction?</Text>
            <Text style={styles.sheetCopy}>
              This will remove{' '}
              <Text style={styles.sheetCopyBold}>
                ₱{parseFloat(tx.amount).toFixed(2)}
              </Text>{' '}
              from your <Text style={styles.sheetCopyBold}>{tx.category}</Text>{' '}
              category and restore it to your{' '}
              <Text style={styles.sheetCopyBold}>{tx.account}</Text> balance.
              This cannot be undone.
            </Text>
            <TouchableOpacity
              style={styles.sheetConfirmBtn}
              activeOpacity={0.8}
              onPress={() => {
                setIsDeleteConfirmVisible(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.sheetConfirmText}>Yes, delete it</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setIsDeleteConfirmVisible(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── REUSABLE ROW COMPONENT ───
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

// ─── STYLES ─────────────────────────────────────────────────────────────────
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
