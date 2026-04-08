import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // 👈 Added this import
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { colors, radius, spacing } from '../constants/theme';
import type { Transaction, Account } from '@/types';
import { supabase } from '@/services/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { Skeleton } from '@/components/Skeleton';
import type { MoreStackParamList } from '../navigation/RootNavigator';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_CONFIG: Record<
  string,
  { letter: string; color: string; label: string }
> = {
  gcash: { letter: 'G', color: colors.accountGCash, label: 'GCash' },
  cash: { letter: '₱', color: colors.accountCash, label: 'Cash' },
  bdo: { letter: 'B', color: colors.accountBDO, label: 'BDO' },
  maya: { letter: 'M', color: colors.accountMaya, label: 'Maya' },
};

function fmtPeso(n: number): string {
  return `₱${Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AccountDetailScreen() {
  const insets = useSafeAreaInsets(); // 👈 Added hook to get safe area measurements
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'AccountDetail'>>();
  const { id } = route.params;

  const { accounts } = useAccounts();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const selectedAccount = useMemo<Account | null>(() => {
    if (!accounts.length) return null;
    return (
      accounts.find((a) => a.id === id) ??
      accounts.find((a) => a.name.toLowerCase() === id.toLowerCase()) ??
      null
    );
  }, [accounts, id]);

  const fetchAccountTransactions = useCallback(async () => {
    if (!selectedAccount?.id) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', selectedAccount.id)
      .order('date', { ascending: false });

    if (!error && data) setTransactions(data as Transaction[]);
    setLoading(false);
  }, [selectedAccount?.id]);

  useEffect(() => {
    fetchAccountTransactions();
  }, [fetchAccountTransactions]);

  // ─── Data Extraction ───
  const config = {
    letter: selectedAccount?.letter_avatar ?? '?',
    color: selectedAccount?.brand_colour ?? '#333',
    label: selectedAccount?.name ?? id,
  };
  const balance = selectedAccount?.balance ?? 0;

  // 1. Filter txns to this account
  const accountTxns = transactions;

  // 2. 3 Most Recent
  const recentTxns = accountTxns.slice(0, 3);

  // 3. Stats logic
  const { monthIn, monthOut } = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return accountTxns.reduce(
      (acc, tx) => {
        const d = new Date(tx.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          if (tx.type === 'income') acc.monthIn += tx.amount;
          else acc.monthOut += tx.amount;
        }
        return acc;
      },
      { monthIn: 0, monthOut: 0 }
    );
  }, [accountTxns]);

  // ─── UI Rendering ───

  const renderTxn: ListRenderItem<Transaction> = ({ item }) => {
    const isInc = item.type === 'income';
    const categoryLabel = item.category ?? 'other';
    return (
      <View style={styles.txItem}>
        <View style={styles.txLeft}>
          <View style={styles.txAvatar}>
            <Text style={styles.txAvatarLetter}>
              {categoryLabel.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.txCategory}>
              {categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1)}
            </Text>
            <Text style={styles.txDate}>
              {new Date(item.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.txAmount, isInc ? { color: colors.incomeGreen } : {}]}
        >
          {isInc ? '+' : '−'}
          {fmtPeso(item.amount)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingTopBar}>
          <Skeleton width={72} height={16} />
          <Skeleton width={120} height={16} />
        </View>

        <View
          style={[
            styles.hero,
            {
              backgroundColor: '#D7E4DB',
              paddingTop: Math.max(insets.top, 16) + 10,
            },
          ]}
        >
          <View style={styles.loadingHeroInner}>
            <Skeleton
              width={64}
              height={64}
              borderRadius={32}
              style={{ marginBottom: 12 }}
            />
            <Skeleton width={120} height={18} style={{ marginBottom: 8 }} />
            <Skeleton width={160} height={36} />
          </View>
        </View>

        <View style={styles.statsRow}>
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={`acct-stat-skel-${index}`} style={styles.statChip}>
              <Skeleton width={72} height={10} style={{ marginBottom: 8 }} />
              <Skeleton width={58} height={14} />
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Skeleton width={130} height={14} />
          <Skeleton width={64} height={14} />
        </View>

        <View style={styles.listWrap}>
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={`acct-txn-skel-${index}`} style={styles.txItem}>
              <View style={styles.txLeft}>
                <Skeleton
                  width={44}
                  height={44}
                  borderRadius={22}
                  style={{ marginRight: 14 }}
                />
                <View>
                  <Skeleton width={110} height={14} style={{ marginBottom: 6 }} />
                  <Skeleton width={72} height={12} />
                </View>
              </View>
              <Skeleton width={84} height={16} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!selectedAccount) {
    return (
      <View style={styles.containerCenter}>
        <Text style={styles.emptyText}>Account not found.</Text>
        <TouchableOpacity
          style={styles.backGhostBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backGhostBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    // 👈 Removed SafeAreaView wrapper, just using standard View
    <View style={styles.container}>
      {/* ════════════════ HERO CARD ════════════════ */}
      {/* 👈 Dynamic padding added here to perfectly dodge the notch */}
      <View
        style={[
          styles.hero,
          {
            backgroundColor: config.color,
            paddingTop: Math.max(insets.top, 16) + 10,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.heroBody}>
          <View style={styles.avatarWrap}>
            <Text style={[styles.avatarLetter, { color: config.color }]}>
              {config.letter}
            </Text>
          </View>
          <Text style={styles.accountName}>{config.label}</Text>
          <Text style={styles.accountBalance}>{fmtPeso(balance)}</Text>
        </View>
      </View>

      {/* ════════════════ 3 STAT CHIPS ════════════════ */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>In (This Month)</Text>
          <Text style={[styles.statValue, { color: colors.incomeGreen }]}>
            +{fmtPeso(monthIn)}
          </Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Out (This Month)</Text>
          <Text style={[styles.statValue, { color: colors.expenseRed }]}>
            −{fmtPeso(monthOut)}
          </Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Transactions</Text>
          <Text style={styles.statValue}>{accountTxns.length}</Text>
        </View>
      </View>

      {/* ════════════════ RECENT TRANSACTIONS ════════════════ */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('Tabs', {
              screen: 'feed',
              params: {
                screen: 'FeedMain',
                params: { filterCategory: undefined, filterAccount: id },
              },
            })
          }
        >
          <Text style={styles.seeAll}>See all →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        <FlashList<Transaction>
          data={recentTxns}
          renderItem={renderTxn}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No recent transactions</Text>
          }
        />
      </View>

      {/* ════════════════ EDIT / DELETE ACTIONS ════════════════ */}
      <View style={styles.actionWrap}>
        <TouchableOpacity style={styles.editBtn}>
          <Text style={styles.editBtnText}>Edit Account Details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteLink}
          onPress={() => setShowDeleteModal(true)}
        >
          <Text style={styles.deleteLinkText}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      {/* ════════════════ DELETE CONFIRMATION MODAL ════════════════ */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Delete {config.label}?</Text>
            <Text style={styles.modalSub}>
              This will remove the account and all its transaction history. This
              action cannot be undone.
            </Text>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => {
                setShowDeleteModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.confirmBtnText}>Yes, Delete Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowDeleteModal(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // 👈 Ensures background matches theme entirely
  },
  containerCenter: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  backGhostBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(30,30,46,0.15)',
  },
  backGhostBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  loadingTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    marginBottom: 8,
  },
  loadingHeroInner: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  // ── Hero ──
  hero: {
    padding: spacing.screenPadding,
    // paddingTop is now handled dynamically inline
    borderBottomLeftRadius: radius.cardLg,
    borderBottomRightRadius: radius.cardLg,
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    marginBottom: 20,
  },
  backBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.white,
  },
  heroBody: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  accountName: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  accountBalance: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 40,
    color: colors.white,
    letterSpacing: -1.5,
  },

  // ── 3 Stat Chips ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenPadding,
    marginTop: 24,
    gap: 8,
  },
  statChip: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.card,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 13,
    color: colors.textPrimary,
  },

  // ── Recent List ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  seeAll: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },
  listWrap: {
    minHeight: 200,
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 30,
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 12,
    borderRadius: radius.card,
    marginBottom: 10,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txAvatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  txCategory: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  txDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },

  // ── Actions ──
  actionWrap: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 40,
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: colors.lavenderLight,
    width: '100%',
    paddingVertical: 16,
    borderRadius: radius.button,
    alignItems: 'center',
  },
  editBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.lavenderDark,
  },
  deleteLink: {
    marginTop: 28,
  },
  deleteLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.coralDark,
  },

  // ── Modal Sheet ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  modalSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmBtn: {
    backgroundColor: colors.coralDark,
    width: '100%',
    paddingVertical: 16,
    borderRadius: radius.button,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.white,
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textSecondary,
  },
});
