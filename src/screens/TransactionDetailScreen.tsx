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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, radius, spacing } from '../constants/theme';
import type { FeedStackParamList } from '../navigation/RootNavigator';

const MOCK_DB: Record<string, any> = {
  '1': {
    id: '1',
    merchant: 'Jollibee Drive Thru',
    category: 'Food',
    emoji: '🍔',
    amount: 185.0,
    account: 'GCash',
    date: 'March 26, 2026',
    time: '12:30 PM',
    isExpense: true,
    note: 'Lunch with the dev team',
    receipt_url:
      'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&q=80',
    categoryBg: '#FFF3E0',
  },
  '2': {
    id: '2',
    merchant: 'Freelance Payout',
    category: 'Income',
    emoji: '💰',
    amount: 25000.0,
    account: 'BDO',
    date: 'March 26, 2026',
    time: '09:00 AM',
    isExpense: false,
    note: 'Phase 2 UI Milestone',
    categoryBg: '#E8F5EE',
  },
};

type DetailRouteProp = RouteProp<FeedStackParamList, 'TransactionDetail'>;

export default function TransactionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<DetailRouteProp>();

  const transactionId = route.params?.id || '1';
  const tx = MOCK_DB[transactionId];

  const [isReceiptVisible, setIsReceiptVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);

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

  return (
    <View style={styles.container}>
      <View style={[styles.detailHero, { backgroundColor: tx.categoryBg }]}>
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
          <Text style={styles.heroEmoji}>{tx.emoji}</Text>
          <Text style={styles.txAmount}>
            {tx.isExpense ? '-' : '+'}₱{tx.amount.toFixed(2)}
          </Text>
          <Text style={styles.merchantName}>{tx.merchant}</Text>
          <Text style={styles.heroMeta}>
            {tx.date} at {tx.time}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailCard}>
          <DetailRow label="Account" value={tx.account} />
          <DetailRow label="Date & time" value={`${tx.date}, ${tx.time}`} />
          <DetailRow label="Category" value={tx.category} />
          <DetailRow label="Note" value={tx.note || '—'} isLast />
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
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('AddTransaction', {
                mode: tx.isExpense ? 'expense' : 'income',
              })
            }
          >
            <Text style={styles.editBtnText}>Edit Transaction</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtnTextWrapper}
            activeOpacity={0.6}
            onPress={() => setIsDeleteConfirmVisible(true)}
          >
            <Text style={styles.deleteBtnText}>Delete transaction</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
              <Text style={styles.sheetCopyBold}>₱{tx.amount.toFixed(2)}</Text>{' '}
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

const DetailRow = ({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) => (
  <View style={[styles.detailRow, !isLast && styles.detailRowBorder]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

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
  heroEmoji: { fontSize: 40, marginBottom: 12 },
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
  heroMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  scrollContent: { padding: spacing.screenPadding, paddingBottom: 60 },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0EFEA' },
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
  actionsContainer: { alignItems: 'center' },
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
  deleteBtnTextWrapper: { marginTop: 28, padding: 8 },
  deleteBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#E57373',
    textDecorationLine: 'underline',
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
