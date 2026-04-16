import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { Transaction, Account } from '@/types';
import { supabase } from '@/services/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { Skeleton } from '@/components/Skeleton';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORY_COLOR, INCOME_CATEGORIES } from '@/constants/categoryMappings';
import type { MoreStackParamList } from '../navigation/RootNavigator';
import WalletCard, { getCfg } from '../components/WalletCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeso(n: number): string {
  return `₱${Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtTrend(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '';
  if (previous === 0) return 'New this month';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(pct).toFixed(0)}% vs last mo`;
}

function fmtTrendCount(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '';
  if (previous === 0) return 'New this month';
  const diff = current - previous;
  const sign = diff >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(diff)} vs last mo`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'AccountDetail'>>();
  const { id } = route.params;

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { accounts, refetch: refetchAccounts } = useAccounts();
  const { categories } = useCategories();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Modal states ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // ── Filter / Search ──
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Edit Account ──
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Adjust Balance ──
  const [adjustSheetVisible, setAdjustSheetVisible] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  // ── Transfer ──
  const [transferDestId, setTransferDestId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const transferInputRef = useRef<TextInput>(null);

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

  // ── Derived data ──
  const config = {
    letter: selectedAccount?.letter_avatar ?? '?',
    color: selectedAccount?.brand_colour ?? colors.primary,
    label: selectedAccount?.name ?? id,
  };
  const cardGrad = selectedAccount ? getCfg(selectedAccount).grad : ([config.color, config.color, config.color] as [string, string, string]);
  const balance = selectedAccount?.balance ?? 0;

  // ── Monthly stats + trends ──
  const { monthIn, monthOut, prevMonthIn, prevMonthOut, prevMonthCount, curMonthCount } =
    useMemo(() => {
      const now = new Date();
      const curMonth = now.getMonth();
      const curYear = now.getFullYear();
      const prevDate = new Date(curYear, curMonth - 1, 1);
      const prevMonth = prevDate.getMonth();
      const prevYear = prevDate.getFullYear();

      return transactions.reduce(
        (acc, tx) => {
          const d = new Date(tx.date);
          const m = d.getMonth();
          const y = d.getFullYear();
          if (m === curMonth && y === curYear) {
            acc.curMonthCount += 1;
            if (tx.type === 'income') acc.monthIn += tx.amount;
            else acc.monthOut += tx.amount;
          } else if (m === prevMonth && y === prevYear) {
            acc.prevMonthCount += 1;
            if (tx.type === 'income') acc.prevMonthIn += tx.amount;
            else acc.prevMonthOut += tx.amount;
          }
          return acc;
        },
        { monthIn: 0, monthOut: 0, prevMonthIn: 0, prevMonthOut: 0, prevMonthCount: 0, curMonthCount: 0 }
      );
    }, [transactions]);

  // ── Unique categories for filter pills ──
  const uniqueCategories = useMemo(
    () => [...new Set(transactions.map((t) => (t.category ?? 'other').toLowerCase()))],
    [transactions]
  );

  // ── Filtered transactions ──
  const filteredTxns = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return transactions
      .filter((t) => !activeCategory || (t.category ?? 'other').toLowerCase() === activeCategory)
      .filter(
        (t) =>
          !q ||
          [t.merchant_name, t.display_name, t.category].some((f) =>
            f?.toLowerCase().includes(q)
          )
      )
      .slice(0, q || activeCategory ? 5 : 3);
  }, [transactions, activeCategory, searchQuery]);

  // ── Progress bar widths ──
  const outBarPct = monthIn > 0 ? Math.min((monthOut / monthIn) * 100, 100) : 0;
  const countBarPct =
    prevMonthCount > 0 ? Math.min((curMonthCount / prevMonthCount) * 100, 100) : 50;

  // ── Last reconciled ──
  const lastReconciledLabel = selectedAccount?.last_reconciled_at
    ? new Date(selectedAccount.last_reconciled_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Never';

  // ── Other accounts for Transfer ──
  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.id !== selectedAccount?.id),
    [accounts, selectedAccount]
  );

  // ── Category icon helpers ──
  const getCategoryIcon = useCallback(
    (tx: Transaction): { key: string; color: string } => {
      if (tx.type === 'income') {
        const incCat = INCOME_CATEGORIES.find(
          (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
        );
        const key = incCat?.key ?? 'default';
        return { key, color: CATEGORY_COLOR[key] ?? colors.incomeGreen };
      }
      const catData = categories.find(
        (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
      );
      const key = catData?.emoji ?? 'default';
      return { key, color: catData?.text_colour ?? CATEGORY_COLOR[key] ?? colors.textSecondary };
    },
    [categories, colors]
  );

  const getPillIcon = useCallback(
    (categoryName: string): { key: string; color: string } => {
      const catData = categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (catData) {
        const key = catData.emoji ?? 'default';
        return { key, color: catData.text_colour ?? CATEGORY_COLOR[key] ?? colors.textSecondary };
      }
      const incCat = INCOME_CATEGORIES.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (incCat) {
        return { key: incCat.key, color: CATEGORY_COLOR[incCat.key] ?? colors.incomeGreen };
      }
      return { key: 'default', color: colors.textSecondary };
    },
    [categories, colors]
  );

  // ── Save Adjust Balance ──
  const handleSaveAdjustment = useCallback(async () => {
    const parsed = parseFloat(newBalance);
    if (!selectedAccount?.id || isNaN(parsed)) return;

    const diff = parsed - balance;
    if (diff === 0) {
      setAdjustSheetVisible(false);
      return;
    }

    setAdjustSaving(true);
    const today = new Date().toISOString().split('T')[0];

    await supabase.from('transactions').insert({
      account_id: selectedAccount.id,
      user_id: selectedAccount.user_id,
      amount: Math.abs(diff),
      type: diff > 0 ? 'income' : 'expense',
      category: 'adjustment',
      merchant_name: null,
      display_name: adjustNote || 'Balance Reconciliation',
      transaction_note: adjustNote || null,
      date: today,
      receipt_url: null,
      account_deleted: false,
    });

    await supabase
      .from('accounts')
      .update({ last_reconciled_at: new Date().toISOString() })
      .eq('id', selectedAccount.id);

    setAdjustSaving(false);
    setAdjustSheetVisible(false);
    setNewBalance('');
    setAdjustNote('');
    fetchAccountTransactions();
  }, [selectedAccount, balance, newBalance, adjustNote, fetchAccountTransactions]);

  // ── Save Edit Account ──
  const handleSaveEdit = useCallback(async () => {
    const trimmedName = editName.trim();
    const trimmedType = editType.trim();
    if (!selectedAccount?.id || !trimmedName) return;
    setEditSaving(true);
    await supabase
      .from('accounts')
      .update({ name: trimmedName, type: trimmedType })
      .eq('id', selectedAccount.id);
    setEditSaving(false);
    setEditSheetVisible(false);
    refetchAccounts();
  }, [selectedAccount, editName, editType, refetchAccounts]);

  // ── Save Transfer ──
  const handleSaveTransfer = useCallback(async () => {
    const parsed = parseFloat(transferAmount);
    if (!selectedAccount?.id || !transferDestId || isNaN(parsed) || parsed <= 0) return;

    const destAccount = accounts.find((a) => a.id === transferDestId);
    if (!destAccount) return;

    setTransferSaving(true);
    const today = new Date().toISOString().split('T')[0];

    await supabase.from('transactions').insert([
      {
        account_id: selectedAccount.id,
        user_id: selectedAccount.user_id,
        amount: parsed,
        type: 'expense',
        category: 'transfer',
        merchant_name: null,
        display_name: `Transfer to ${destAccount.name}`,
        transaction_note: null,
        date: today,
        receipt_url: null,
        account_deleted: false,
      },
      {
        account_id: transferDestId,
        user_id: selectedAccount.user_id,
        amount: parsed,
        type: 'income',
        category: 'transfer',
        merchant_name: null,
        display_name: `Transfer from ${config.label}`,
        transaction_note: null,
        date: today,
        receipt_url: null,
        account_deleted: false,
      },
    ]);

    setTransferSaving(false);
    setShowTransferModal(false);
    setTransferAmount('');
    setTransferDestId('');
    fetchAccountTransactions();
  }, [selectedAccount, transferDestId, transferAmount, accounts, config.label, fetchAccountTransactions]);

  // ─── Render transaction item ──────────────────────────────────────────────
  const renderTxn: ListRenderItem<Transaction> = ({ item }) => {
    const isInc = item.type === 'income';
    const categoryLabel = item.category ?? 'other';
    const { key, color } = getCategoryIcon(item);
    return (
      <View style={styles.txRowPad}>
        <View style={styles.txItem}>
          <View style={styles.txLeft}>
            <CategoryIcon categoryKey={key} color={color} wrapperSize={36} size={18} />
            <View>
              <Text style={styles.txCategory}>
                {categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1)}
              </Text>
              <Text style={styles.txDate}>
                {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
          <Text style={[styles.txAmount, { color: isInc ? colors.incomeGreen : colors.expenseRed }]}>
            {isInc ? '+' : '−'}
            {fmtPeso(item.amount)}
          </Text>
        </View>
      </View>
    );
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View
          style={[styles.hero, { backgroundColor: colors.catTileEmptyBg, paddingTop: Math.max(insets.top, 16) + 10 }]}
        >
          <View style={styles.heroTopBar}>
            <Skeleton width={72} height={32} borderRadius={999} />
            <Skeleton width={64} height={32} borderRadius={999} />
          </View>
          <View style={styles.loadingHeroInner}>
            <Skeleton width={48} height={48} borderRadius={24} style={{ marginBottom: 12 }} />
            <Skeleton width={120} height={16} style={{ marginBottom: 8 }} />
            <Skeleton width={160} height={38} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Skeleton width={100} height={38} borderRadius={12} />
              <Skeleton width={100} height={38} borderRadius={12} />
            </View>
          </View>
        </View>
        <View style={styles.statsRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.statChip}>
              <Skeleton width={64} height={10} style={{ marginBottom: 6 }} />
              <Skeleton width={56} height={14} style={{ marginBottom: 8 }} />
              <Skeleton width="100%" height={4} borderRadius={999} style={{ marginBottom: 4 }} />
              <Skeleton width={72} height={9} />
            </View>
          ))}
        </View>
        <View style={[styles.metaCard, { justifyContent: 'space-between' }]}>
          <View style={{ gap: 4 }}>
            <Skeleton width={80} height={10} />
            <Skeleton width={100} height={14} />
          </View>
          <Skeleton width={120} height={34} borderRadius={10} />
        </View>
        <View style={styles.sectionHeader}>
          <Skeleton width={130} height={14} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Skeleton width={20} height={20} borderRadius={10} />
            <Skeleton width={56} height={14} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing.screenPadding, marginBottom: 10 }}>
          {[40, 72, 72, 72].map((w, i) => (
            <Skeleton key={i} width={w} height={30} borderRadius={999} />
          ))}
        </View>
        <View style={styles.listWrap}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.txItem}>
              <View style={styles.txLeft}>
                <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: 2 }} />
                <View>
                  <Skeleton width={110} height={14} style={{ marginBottom: 6 }} />
                  <Skeleton width={64} height={11} />
                </View>
              </View>
              <Skeleton width={80} height={16} />
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
        <TouchableOpacity style={styles.backGhostBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backGhostBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <FlashList<Transaction>
        data={filteredTxns}
        renderItem={renderTxn}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={cardGrad}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, { paddingTop: Math.max(insets.top, 16) + 10 }]}
            >
              <View style={styles.heroTopBar}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroEditBtn}
                  onPress={() => {
                    setEditName(selectedAccount?.name ?? '');
                    setEditType(selectedAccount?.type ?? '');
                    setEditSheetVisible(true);
                  }}
                >
                  <Text style={styles.backBtnText}>✏️ Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.heroBody}>
                <View style={styles.cardWrapper}>
                  <WalletCard account={selectedAccount} />
                </View>

                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={styles.qaBtn}
                    onPress={() =>
                      navigation.navigate('AddTransaction', {
                        mode: 'income',
                        prefill: { account: selectedAccount.id, merchant: '', amount: '', category: '' },
                      })
                    }
                  >
                    <Text style={styles.qaBtnText}>➕ Add Funds</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.qaBtn}
                    onPress={() => {
                      if (otherAccounts.length > 0) setTransferDestId(otherAccounts[0].id);
                      setShowTransferModal(true);
                    }}
                  >
                    <Text style={styles.qaBtnText}>↗ Transfer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>In (This Month)</Text>
                <Text style={[styles.statValue, { color: colors.incomeGreen }]}>+{fmtPeso(monthIn)}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: '100%', backgroundColor: colors.incomeGreen }]} />
                </View>
                {!!fmtTrend(monthIn, prevMonthIn) && (
                  <Text style={[styles.trendText, { color: monthIn >= prevMonthIn ? colors.incomeGreen : colors.expenseRed }]}>
                    {fmtTrend(monthIn, prevMonthIn)}
                  </Text>
                )}
              </View>

              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Out (This Month)</Text>
                <Text style={[styles.statValue, { color: colors.expenseRed }]}>−{fmtPeso(monthOut)}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${outBarPct}%`, backgroundColor: colors.expenseRed }]} />
                </View>
                {!!fmtTrend(monthOut, prevMonthOut) && (
                  <Text style={[styles.trendText, { color: monthOut <= prevMonthOut ? colors.incomeGreen : colors.expenseRed }]}>
                    {fmtTrend(monthOut, prevMonthOut)}
                  </Text>
                )}
              </View>

              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Transactions</Text>
                <Text style={styles.statValue}>{curMonthCount}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${countBarPct}%`, backgroundColor: colors.textSecondary }]} />
                </View>
                {!!fmtTrendCount(curMonthCount, prevMonthCount) && (
                  <Text style={styles.trendText}>{fmtTrendCount(curMonthCount, prevMonthCount)}</Text>
                )}
              </View>
            </View>

            <View style={styles.metaCard}>
              <View>
                <Text style={styles.metaLabel}>Last Reconciled</Text>
                <Text style={styles.metaValue}>{lastReconciledLabel}</Text>
              </View>
              <TouchableOpacity
                style={[styles.adjustBadge, { backgroundColor: `${config.color}22` }]}
                onPress={() => {
                  setNewBalance('');
                  setAdjustNote('');
                  setAdjustSheetVisible(true);
                }}
              >
                <Text style={[styles.adjustBadgeText, { color: config.color }]}>⚖️ Adjust Balance</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              <View style={styles.sectionActions}>
                <TouchableOpacity
                  onPress={() => {
                    setSearchVisible((v) => !v);
                    if (searchVisible) setSearchQuery('');
                  }}
                >
                  <Text style={styles.searchIconText}>🔍</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('Tabs', {
                      screen: 'feed',
                      params: {
                        screen: 'FeedMain',
                        params: { filterAccount: id, filterCategory: activeCategory ?? undefined },
                      },
                    })
                  }
                >
                  <Text style={[styles.seeAll, { color: config.color }]}>See all →</Text>
                </TouchableOpacity>
              </View>
            </View>

            {searchVisible && (
              <View style={styles.searchWrap}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search transactions…"
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  returnKeyType="search"
                />
              </View>
            )}

            {uniqueCategories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPillsContent}
                style={styles.filterPillsWrap}
              >
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    activeCategory === null && [styles.filterPillActive, { backgroundColor: config.color, borderColor: config.color }],
                  ]}
                  onPress={() => setActiveCategory(null)}
                >
                  <Text style={[styles.filterPillText, activeCategory === null && styles.filterPillTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                {uniqueCategories.map((cat) => {
                  const isActive = activeCategory === cat;
                  const { key, color } = getPillIcon(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.filterPill,
                        isActive && [styles.filterPillActive, { backgroundColor: config.color, borderColor: config.color }],
                      ]}
                      onPress={() => setActiveCategory(isActive ? null : cat)}
                    >
                      <View style={styles.pillInner}>
                        <CategoryIcon categoryKey={key} color={isActive ? '#FFFFFF' : color} wrapperSize={18} size={10} />
                        <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery || activeCategory ? 'No matching transactions' : 'No recent transactions'}
          </Text>
        }
        ListFooterComponent={
          <View style={styles.actionWrap}>
            <TouchableOpacity onPress={() => setShowDeleteModal(true)}>
              <Text style={styles.deleteLinkText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Delete {config.label}?</Text>
            <Text style={styles.modalSub}>
              This will remove the account and all its transaction history. This action cannot be undone.
            </Text>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => { setShowDeleteModal(false); navigation.goBack(); }}
            >
              <Text style={styles.confirmBtnText}>Yes, Delete Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDeleteModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTransferModal}
        transparent
        animationType="slide"
        onShow={() => { setTimeout(() => transferInputRef.current?.focus(), 150); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Transfer Money</Text>
            <Text style={styles.modalSub}>
              Move funds from{' '}
              <Text style={{ fontFamily: 'Inter_700Bold' }}>{config.label}</Text>
              {' '}to another account.
            </Text>

            {otherAccounts.length === 0 ? (
              <Text style={styles.emptyText}>No other accounts available.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.transferAccountsContent}
                style={styles.transferAccountsWrap}
              >
                {otherAccounts.map((acct) => {
                  const isSelected = transferDestId === acct.id;
                  return (
                    <TouchableOpacity
                      key={acct.id}
                      style={[styles.transferAcctChip, isSelected && { borderColor: acct.brand_colour, borderWidth: 2 }]}
                      onPress={() => setTransferDestId(acct.id)}
                    >
                      <View style={[styles.transferAcctAvatar, { backgroundColor: acct.brand_colour }]}>
                        <Text style={styles.transferAcctLetter}>{acct.letter_avatar}</Text>
                      </View>
                      <Text style={styles.transferAcctName} numberOfLines={1}>{acct.name}</Text>
                      <Text style={styles.transferAcctBal}>{fmtPeso(acct.balance)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TextInput
              ref={transferInputRef}
              style={[styles.adjustInput, { marginTop: 16 }]}
              placeholder="Amount to transfer"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={transferAmount}
              onChangeText={setTransferAmount}
            />

            <TouchableOpacity
              style={[styles.confirmBtn, { marginTop: 20, opacity: transferSaving || !transferDestId ? 0.6 : 1 }]}
              onPress={handleSaveTransfer}
              disabled={transferSaving || !transferDestId}
            >
              <Text style={styles.confirmBtnText}>
                {transferSaving ? 'Transferring…' : 'Confirm Transfer'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setShowTransferModal(false); setTransferAmount(''); setTransferDestId(''); }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════ ADJUST BALANCE — only mounted when open, so no gesture blocker at rest ════ */}
      {adjustSheetVisible && (
      <BottomSheet
        index={0}
        snapPoints={['60%']}
        enablePanDownToClose
        keyboardBehavior={Platform.OS === 'ios' ? 'interactive' : 'fillParent'}
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture
        android_keyboardInputMode="adjustPan"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
        backgroundStyle={{ backgroundColor: colors.white }}
        handleIndicatorStyle={{ backgroundColor: isDark ? '#555' : '#ccc' }}
        onClose={() => { setAdjustSheetVisible(false); setNewBalance(''); setAdjustNote(''); }}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.bsContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        >
          {/* Header */}
          <Text style={styles.adjustTitle}>Reconcile Balance</Text>
          <Text style={styles.adjustSub}>
            Enter your actual wallet amount. We'll log the difference automatically.
          </Text>

          {/* Current → New compare */}
          <View style={styles.balanceCompareRow}>
            <View style={styles.balanceCompareBox}>
              <Text style={styles.balanceCompareLabel}>Current</Text>
              <Text style={styles.balanceCompareValue}>{fmtPeso(balance)}</Text>
            </View>
            <Text style={styles.balanceArrow}>→</Text>
            <View style={[styles.balanceCompareBox, styles.balanceCompareBoxNew]}>
              <Text style={styles.balanceCompareLabel}>New</Text>
              <Text
                style={[
                  styles.balanceCompareValue,
                  {
                    color: (() => {
                      const p = parseFloat(newBalance);
                      if (isNaN(p) || newBalance === '') return colors.textSecondary;
                      return p >= balance ? colors.incomeGreen : colors.expenseRed;
                    })(),
                  },
                ]}
              >
                {(() => {
                  const p = parseFloat(newBalance);
                  return isNaN(p) || newBalance === '' ? '₱ —' : fmtPeso(p);
                })()}
              </Text>
            </View>
          </View>

          {/* Amount input using BottomSheetTextInput — fixes Android keyboard */}
          <View style={styles.adjustInputWrap}>
            <Text style={styles.adjustInputPrefix}>₱</Text>
            <BottomSheetTextInput
              style={styles.adjustInputField}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={newBalance}
              onChangeText={setNewBalance}
              returnKeyType="done"
            />
          </View>

          {/* Diff card */}
          {(() => {
            const parsed = parseFloat(newBalance);
            if (isNaN(parsed) || newBalance === '' || parsed === balance) return null;
            const diff = parsed - balance;
            const isAdd = diff > 0;
            return (
              <View
                style={[
                  styles.diffCard,
                  {
                    backgroundColor: isAdd
                      ? isDark ? 'rgba(106,158,127,0.15)' : 'rgba(91,140,110,0.08)'
                      : isDark ? 'rgba(255,107,107,0.15)' : 'rgba(192,80,58,0.08)',
                    borderColor: isAdd ? colors.incomeGreen : colors.expenseRed,
                  },
                ]}
              >
                <Text style={[styles.diffCardText, { color: isAdd ? colors.incomeGreen : colors.expenseRed }]}>
                  {isAdd ? '▲' : '▼'} {fmtPeso(Math.abs(diff))} will be recorded as{' '}
                  <Text style={{ fontFamily: 'Inter_700Bold' }}>{isAdd ? 'income' : 'expense'}</Text>
                </Text>
              </View>
            );
          })()}

          {/* Note */}
          <BottomSheetTextInput
            style={styles.adjustNoteInput}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.textSecondary}
            value={adjustNote}
            onChangeText={setAdjustNote}
            returnKeyType="done"
          />

          {/* Save */}
          <TouchableOpacity
            style={[
              styles.adjustSaveBtn,
              {
                opacity:
                  adjustSaving || !newBalance || isNaN(parseFloat(newBalance)) || parseFloat(newBalance) === balance
                    ? 0.45
                    : 1,
              },
            ]}
            onPress={handleSaveAdjustment}
            disabled={adjustSaving || !newBalance || isNaN(parseFloat(newBalance)) || parseFloat(newBalance) === balance}
          >
            <Text style={styles.adjustSaveBtnText}>{adjustSaving ? 'Saving…' : 'Save Adjustment'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setAdjustSheetVisible(false)}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>
      )}

      {/* ════ EDIT ACCOUNT ════ */}
      {editSheetVisible && (
        <BottomSheet
          index={0}
          snapPoints={['45%']}
          enablePanDownToClose
          keyboardBehavior={Platform.OS === 'ios' ? 'interactive' : 'fillParent'}
          keyboardBlurBehavior="restore"
          enableBlurKeyboardOnGesture
          android_keyboardInputMode="adjustPan"
          backdropComponent={(props) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
          )}
          backgroundStyle={{ backgroundColor: colors.white }}
          handleIndicatorStyle={{ backgroundColor: isDark ? '#555' : '#ccc' }}
          onClose={() => setEditSheetVisible(false)}
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.bsContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
          >
            <Text style={styles.adjustTitle}>Edit Account</Text>
            <Text style={styles.adjustSub}>Update the name or type for this account.</Text>

            <Text style={[styles.metaLabel, { marginBottom: 6, marginTop: 8 }]}>Account Name</Text>
            <BottomSheetTextInput
              style={styles.adjustInputField}
              placeholder="e.g. GCash"
              placeholderTextColor={colors.textSecondary}
              value={editName}
              onChangeText={setEditName}
              returnKeyType="next"
              autoCapitalize="words"
            />

            <Text style={[styles.metaLabel, { marginBottom: 6, marginTop: 16 }]}>Account Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {['E-WALLET', 'BANK ACCOUNT', 'CASH WALLET', 'CREDIT CARD'].map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setEditType(t)}
                  style={[
                    styles.filterPill,
                    editType === t && [styles.filterPillActive, { backgroundColor: config.color, borderColor: config.color }],
                  ]}
                >
                  <Text style={[styles.filterPillText, editType === t && styles.filterPillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.adjustSaveBtn,
                { marginTop: 20, opacity: editSaving || !editName.trim() ? 0.45 : 1 },
              ]}
              onPress={handleSaveEdit}
              disabled={editSaving || !editName.trim()}
            >
              <Text style={styles.adjustSaveBtnText}>{editSaving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditSheetVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </BottomSheetScrollView>
        </BottomSheet>
      )}

    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    contentContainer: { paddingBottom: 52 },
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
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.15)',
    },
    backGhostBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.textPrimary },
    loadingHeroInner: { alignItems: 'center', paddingBottom: 16 },
    // Hero
    hero: {
      padding: spacing.screenPadding,
      borderBottomLeftRadius: radius.cardLg,
      borderBottomRightRadius: radius.cardLg,
      shadowColor: isDark ? '#000000' : '#1E1E2E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    heroTopBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    backBtn: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
    },
    heroEditBtn: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
    },
    backBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },
    heroBody: { alignItems: 'center', paddingBottom: 16 },
    cardWrapper: {
      alignItems: 'center',
      width: '100%',
      marginBottom: 16,
    },
    avatarWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    avatarLetter: { fontFamily: 'Inter_700Bold', fontSize: 22 },
    accountName: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: 'rgba(255,255,255,0.9)',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    accountBalance: { fontFamily: 'DMMono_500Medium', fontSize: 40, color: '#FFFFFF', letterSpacing: -1.5 },
    quickActionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    qaBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
    qaBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },
    // Stats
    statsRow: { flexDirection: 'row', paddingHorizontal: spacing.screenPadding, marginTop: 24, gap: 8 },
    statChip: {
      flex: 1,
      backgroundColor: colors.white,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: radius.card,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
      minHeight: 90,
    },
    statLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: colors.textSecondary, marginBottom: 4, textAlign: 'center' },
    statValue: { fontFamily: 'DMMono_500Medium', fontSize: 13, color: colors.textPrimary },
    progressTrack: {
      width: '100%',
      height: 4,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(30,30,46,0.06)',
      marginTop: 8,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 999 },
    trendText: { fontFamily: 'Inter_400Regular', fontSize: 9, color: colors.textSecondary, marginTop: 5, textAlign: 'center' },
    // Meta card
    metaCard: {
      marginHorizontal: spacing.screenPadding,
      marginTop: 16,
      backgroundColor: colors.white,
      borderRadius: radius.card,
      padding: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    metaLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.textSecondary, marginBottom: 3 },
    metaValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.textPrimary },
    adjustBadge: {
      backgroundColor: isDark ? 'rgba(106,158,127,0.15)' : 'rgba(91,140,110,0.1)',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    adjustBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.primary },
    // Section header
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.screenPadding,
      marginTop: 28,
      marginBottom: 12,
    },
    sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: colors.textPrimary },
    sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    searchIconText: { fontSize: 16 },
    seeAll: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.primary },
    // Search
    searchWrap: { paddingHorizontal: spacing.screenPadding, marginBottom: 10 },
    searchInput: {
      backgroundColor: colors.white,
      borderRadius: radius.card,
      paddingVertical: 10,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    // Filter pills
    filterPillsWrap: { marginBottom: 10 },
    filterPillsContent: { paddingHorizontal: spacing.screenPadding, gap: 6 },
    filterPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    pillInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    filterPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.textSecondary },
    filterPillTextActive: { color: '#FFFFFF' },
    // Transactions
    listWrap: { minHeight: 80, paddingHorizontal: spacing.screenPadding },
    emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
    txRowPad: { paddingHorizontal: spacing.screenPadding },
    txItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.white,
      padding: 12,
      borderRadius: radius.card,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    txCategory: { fontFamily: 'Nunito_700Bold', fontSize: 14, color: colors.textPrimary },
    txDate: { fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    txAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
    actionWrap: { paddingHorizontal: spacing.screenPadding, paddingTop: 24, alignItems: 'center' },
    deleteLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.coralDark, paddingVertical: 8 },
    // Modals (delete + transfer)
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      padding: 24,
      paddingBottom: 40,
      alignItems: 'center',
    },
    modalTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.textPrimary, marginBottom: 8 },
    modalSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    confirmBtn: {
      backgroundColor: colors.coralDark,
      width: '100%',
      paddingVertical: 16,
      borderRadius: radius.button,
      alignItems: 'center',
      marginBottom: 12,
    },
    confirmBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
    cancelBtn: { width: '100%', paddingVertical: 16, alignItems: 'center' },
    cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textSecondary },
    // Transfer
    transferAccountsWrap: { width: '100%', marginBottom: 4 },
    transferAccountsContent: { gap: 10, paddingVertical: 4 },
    transferAcctChip: {
      width: 100,
      backgroundColor: colors.background,
      borderRadius: radius.card,
      padding: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
    },
    transferAcctAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    transferAcctLetter: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
    transferAcctName: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: colors.textPrimary, textAlign: 'center' },
    transferAcctBal: { fontFamily: 'DMMono_500Medium', fontSize: 10, color: colors.textSecondary },
    adjustInput: {
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
    // Adjust Balance BottomSheet
    bsContent: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
    adjustTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.textPrimary, marginBottom: 6 },
    adjustSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 24,
    },
    balanceCompareRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    balanceCompareBox: {
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
    balanceCompareBoxNew: {
      borderColor: isDark ? '#444444' : 'rgba(30,30,46,0.14)',
      borderStyle: 'dashed',
    },
    balanceCompareLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    balanceCompareValue: { fontFamily: 'DMMono_500Medium', fontSize: 15, color: colors.textPrimary },
    balanceArrow: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: colors.textSecondary },
    adjustInputWrap: {
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
    adjustInputPrefix: { fontFamily: 'DMMono_500Medium', fontSize: 20, color: colors.primary, marginRight: 6 },
    adjustInputField: {
      flex: 1,
      fontFamily: 'DMMono_500Medium',
      fontSize: 24,
      color: colors.textPrimary,
      paddingVertical: 14,
    },
    diffCard: { width: '100%', borderRadius: radius.card, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 },
    diffCardText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center', lineHeight: 18 },
    adjustNoteInput: {
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
    adjustSaveBtn: {
      backgroundColor: colors.primary,
      width: '100%',
      paddingVertical: 16,
      borderRadius: radius.button,
      alignItems: 'center',
      marginBottom: 4,
    },
    adjustSaveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
  });
