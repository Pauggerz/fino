import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  BackHandler,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
} from '@react-navigation/native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { Q } from '@nozbe/watermelondb';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { Transaction, Account } from '@/types';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '@/components/Skeleton';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  CATEGORY_COLOR,
  INCOME_CATEGORIES,
} from '@/constants/categoryMappings';
import type { MoreStackParamList } from '../navigation/RootNavigator';
import WalletCard, { getCfg } from '../components/WalletCard';
import { Icon } from '../components/icons/Icon';
import TransferModal from '@/components/account/TransferModal';
import AdjustBalanceSheet from '@/components/account/AdjustBalanceSheet';
import { saveEditAccount } from '@/services/transactionMutations';
import { formatShortDate } from '@/utils/groupByDate';

// Cross-mount cache for per-account transaction lists. Without this, opening
// the same account twice replays the loading skeleton each time while the
// observable spins up. Observer overwrites on every emission.
const accountTxCache = new Map<string, Transaction[]>();
const accountTxKey = (userId: string, accountId: string) =>
  `${userId}:${accountId}`;

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'AccountDetail'>>();
  const { id, from } = route.params;

  // When this screen was opened from Home (jumping into the More tab's stack),
  // a plain goBack() lands on Tools instead of returning to Home. Pop the
  // stack and flip the tab back to Home so the user ends up where they started.
  const handleBack = useCallback(() => {
    navigation.goBack();
    if (from === 'home') {
      navigation.getParent()?.navigate('home');
    }
  }, [navigation, from]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { accounts, loading: accountsLoading, refetch: refetchAccounts } =
    useAccounts();
  const { categories } = useCategories();
  const { user } = useAuth();
  const userId = user?.id;
  const cachedTxs =
    userId ? accountTxCache.get(accountTxKey(userId, id)) : undefined;
  const [transactions, setTransactions] = useState<Transaction[]>(
    cachedTxs ?? []
  );
  const [loading, setLoading] = useState(!cachedTxs);

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

  const selectedAccount = useMemo<Account | null>(() => {
    if (!accounts.length) return null;
    return (
      accounts.find((a) => a.id === id) ??
      accounts.find((a) => a.name.toLowerCase() === id.toLowerCase()) ??
      null
    );
  }, [accounts, id]);

  useEffect(() => {
    if (!selectedAccount?.id || !userId) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    // Don't reset loading to true here — if we already have cached rows for
    // this account the screen should keep showing them while the observable
    // catches up. Only the initial mount with no cache renders the skeleton.
    const acctId = selectedAccount.id;
    const query = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('account_id', acctId),
        Q.sortBy('date', Q.desc)
      );
    const sub = query.observe().subscribe((records) => {
      const next: Transaction[] = records.map((r) => ({
        id: r.id,
        user_id: r.userId,
        account_id: r.accountId,
        amount: r.amount,
        type: r.type as Transaction['type'],
        category: r.category ?? null,
        merchant_name: r.merchantName ?? null,
        display_name: r.displayName ?? null,
        transaction_note: r.transactionNote ?? null,
        signal_source: (r.signalSource ??
          null) as Transaction['signal_source'],
        date: r.date,
        receipt_url: r.receiptUrl ?? null,
        account_deleted: r.accountDeleted,
        merchant_confidence: r.merchantConfidence ?? null,
        amount_confidence: r.amountConfidence ?? null,
        date_confidence: r.dateConfidence ?? null,
        created_at: r.serverCreatedAt ?? new Date(r.updatedAt).toISOString(),
      }));
      setTransactions(next);
      setLoading(false);
      accountTxCache.set(accountTxKey(userId, acctId), next);
    });
    return () => sub.unsubscribe();
  }, [selectedAccount?.id, userId]);

  // ── Derived data ──
  const config = {
    letter: selectedAccount?.letter_avatar ?? '?',
    color: selectedAccount?.brand_colour ?? colors.primary,
    label: selectedAccount?.name ?? id,
  };
  const cardGrad = selectedAccount
    ? getCfg(selectedAccount).grad
    : ([config.color, config.color, config.color] as [string, string, string]);
  const balance = selectedAccount?.balance ?? 0;

  // ── Monthly stats + trends ──
  const { monthIn, monthOut, prevMonthIn, prevMonthOut, curMonthCount } =
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
            if (tx.type === 'income') acc.prevMonthIn += tx.amount;
            else acc.prevMonthOut += tx.amount;
          }
          return acc;
        },
        {
          monthIn: 0,
          monthOut: 0,
          prevMonthIn: 0,
          prevMonthOut: 0,
          curMonthCount: 0,
        }
      );
    }, [transactions]);

  // ── Unique categories for filter pills ──
  const uniqueCategories = useMemo(
    () => [
      ...new Set(
        transactions.map((t) => (t.category ?? 'other').toLowerCase())
      ),
    ],
    [transactions]
  );

  // ── Share of total wealth (across all accounts) ──
  const totalAccountsBalance = useMemo(
    () => accounts.reduce((s, a) => s + (a.balance || 0), 0),
    [accounts]
  );
  const sharePct =
    totalAccountsBalance > 0 ? (balance / totalAccountsBalance) * 100 : 0;

  // ── 14-day daily flow for sparkline ──
  const dailyFlow = useMemo(() => {
    const days: { date: Date; in: number; out: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d, in: 0, out: 0 });
    }
    const startMs = days[0].date.getTime();
    transactions.forEach((t) => {
      const td = new Date(t.date);
      td.setHours(0, 0, 0, 0);
      const idx = Math.floor((td.getTime() - startMs) / 86400000);
      if (idx >= 0 && idx < 14) {
        if (t.type === 'income') days[idx].in += t.amount;
        else days[idx].out += t.amount;
      }
    });
    const max = Math.max(...days.map((d) => d.in + d.out), 1);
    return { days, max };
  }, [transactions]);

  // ── Top 3 spending categories this month ──
  const topCats = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const map = new Map<string, number>();
    let totalOut = 0;
    transactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const d = new Date(t.date);
      if (d.getMonth() !== m || d.getFullYear() !== y) return;
      const key = (t.category ?? 'other').toLowerCase();
      map.set(key, (map.get(key) ?? 0) + t.amount);
      totalOut += t.amount;
    });
    const items = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => ({
        cat,
        amt,
        pct: totalOut > 0 ? (amt / totalOut) * 100 : 0,
      }));
    const maxAmt = items.length > 0 ? items[0].amt : 1;
    return { items, totalOut, maxAmt };
  }, [transactions]);

  // ── Net flow this month ──
  const monthNet = monthIn - monthOut;

  // ── Filtered transactions ──
  const filteredTxns = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return transactions
      .filter(
        (t) =>
          !activeCategory ||
          (t.category ?? 'other').toLowerCase() === activeCategory
      )
      .filter(
        (t) =>
          !q ||
          [t.merchant_name, t.display_name, t.category].some((f) =>
            f?.toLowerCase().includes(q)
          )
      )
      .slice(0, q || activeCategory ? 5 : 3);
  }, [transactions, activeCategory, searchQuery]);

  // ── Last reconciled ──
  const lastReconciledLabel = selectedAccount?.last_reconciled_at
    ? new Date(selectedAccount.last_reconciled_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Never';

  // ── Created date ──
  const createdLabel = selectedAccount?.created_at
    ? new Date(selectedAccount.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  // ── Current month label ──
  const currentMonthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

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
      return {
        key,
        color:
          catData?.text_colour ?? CATEGORY_COLOR[key] ?? colors.textSecondary,
      };
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
        return {
          key,
          color:
            catData.text_colour ?? CATEGORY_COLOR[key] ?? colors.textSecondary,
        };
      }
      const incCat = INCOME_CATEGORIES.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (incCat) {
        return {
          key: incCat.key,
          color: CATEGORY_COLOR[incCat.key] ?? colors.incomeGreen,
        };
      }
      return { key: 'default', color: colors.textSecondary };
    },
    [categories, colors]
  );

  // ── Save Edit Account ──
  const handleSaveEdit = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!selectedAccount?.id || !trimmedName) return;
    setEditSaving(true);
    try {
      await saveEditAccount({
        accountId: selectedAccount.id,
        name: trimmedName,
        type: editType.trim(),
      });
      setEditSheetVisible(false);
      refetchAccounts();
    } finally {
      setEditSaving(false);
    }
  }, [selectedAccount, editName, editType, refetchAccounts]);

  // ─── Render transaction item ──────────────────────────────────────────────
  const renderTxn: ListRenderItem<Transaction> = ({ item }) => {
    const isInc = item.type === 'income';
    const categoryLabel = item.category ?? 'other';
    const { key, color } = getCategoryIcon(item);
    return (
      <View style={styles.txRowPad}>
        <View style={styles.txItem}>
          <View style={styles.txLeft}>
            <CategoryIcon
              categoryKey={key}
              color={color}
              wrapperSize={36}
              size={18}
            />
            <View>
              <Text style={styles.txCategory}>
                {categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1)}
              </Text>
              <Text style={styles.txDate}>{formatShortDate(item.date)}</Text>
            </View>
          </View>
          <Text
            style={[
              styles.txAmount,
              { color: isInc ? colors.incomeGreen : colors.expenseRed },
            ]}
          >
            {isInc ? '+' : '−'}
            {fmtPeso(item.amount)}
          </Text>
        </View>
      </View>
    );
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────
  // Show skeleton while either the account list or the transaction list is
  // still resolving — otherwise a cold mount briefly falls through to the
  // "Account not found" branch before useAccounts emits its first value.
  if (loading || accountsLoading) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.hero,
            {
              backgroundColor: colors.catTileEmptyBg,
              paddingTop: Math.max(insets.top, 16) + 10,
            },
          ]}
        >
          <View style={styles.heroTopBar}>
            <Skeleton width={72} height={32} borderRadius={999} />
            <Skeleton width={64} height={32} borderRadius={999} />
          </View>
          <View style={styles.loadingHeroInner}>
            <Skeleton
              width={48}
              height={48}
              borderRadius={24}
              style={{ marginBottom: 12 }}
            />
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
              <Skeleton
                width="100%"
                height={4}
                borderRadius={999}
                style={{ marginBottom: 4 }}
              />
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
        <View
          style={{
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: spacing.screenPadding,
            marginBottom: 10,
          }}
        >
          {[40, 72, 72, 72].map((w, i) => (
            <Skeleton key={i} width={w} height={30} borderRadius={999} />
          ))}
        </View>
        <View style={styles.listWrap}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.txItem}>
              <View style={styles.txLeft}>
                <Skeleton
                  width={36}
                  height={36}
                  borderRadius={18}
                  style={{ marginRight: 2 }}
                />
                <View>
                  <Skeleton
                    width={110}
                    height={14}
                    style={{ marginBottom: 6 }}
                  />
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
        <TouchableOpacity
          style={styles.backGhostBtn}
          onPress={handleBack}
        >
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={cardGrad}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.hero,
                { paddingTop: Math.max(insets.top, 16) + 8 },
              ]}
            >
              <View style={styles.heroTopBar}>
                <TouchableOpacity
                  style={styles.heroIconBtn}
                  onPress={handleBack}
                  hitSlop={8}
                >
                  <Text style={styles.heroIconArrow}>←</Text>
                </TouchableOpacity>
                <View style={styles.heroTitleWrap}>
                  <Text style={styles.heroTitleText} numberOfLines={1}>
                    {selectedAccount.name}
                  </Text>
                  <Text style={styles.heroTitleSub} numberOfLines={1}>
                    {(selectedAccount.type ?? 'ACCOUNT').toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.heroIconBtn}
                  onPress={() =>
                    navigation.navigate('Tabs', {
                      screen: 'feed',
                      params: {
                        screen: 'FeedMain',
                        params: { filterAccount: id },
                      },
                    })
                  }
                  hitSlop={8}
                >
                  <Icon name="chart" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.heroBody}>
                <View style={styles.cardWrapper}>
                  <WalletCard account={selectedAccount} />
                </View>

                {totalAccountsBalance > 0 && (
                  <View style={styles.shareWrap}>
                    <View style={styles.shareRow}>
                      <Text style={styles.shareLabel}>
                        Share of total wealth
                      </Text>
                      <Text style={styles.sharePct}>
                        {sharePct.toFixed(0)}%
                      </Text>
                    </View>
                    <View style={styles.shareTrack}>
                      <View
                        style={[
                          styles.shareFill,
                          { width: `${Math.min(Math.max(sharePct, 0), 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={styles.qaBtn}
                    onPress={() =>
                      navigation.navigate('AddTransaction', {
                        mode: 'income',
                        prefill: {
                          account: selectedAccount.id,
                          merchant: '',
                          amount: '',
                          category: '',
                        },
                      })
                    }
                  >
                    <View style={styles.qaIcon}>
                      <Icon name="add" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={styles.qaBtnText}>Add Funds</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.qaBtn}
                    onPress={() => setShowTransferModal(true)}
                  >
                    <View style={styles.qaIcon}>
                      <Text style={styles.qaIconGlyph}>↗</Text>
                    </View>
                    <Text style={styles.qaBtnText}>Transfer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.qaBtn}
                    onPress={() => setAdjustSheetVisible(true)}
                  >
                    <View style={styles.qaIcon}>
                      <Icon name="balance" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={styles.qaBtnText}>Adjust</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>

            {/* Money Flow card */}
            <View style={styles.sectionPad}>
              <View style={styles.flowCard}>
                <View style={styles.flowHead}>
                  <Text style={styles.flowTitle}>Money Flow</Text>
                  <View style={styles.monthChip}>
                    <Text style={styles.monthChipText}>
                      {currentMonthLabel}
                    </Text>
                  </View>
                </View>
                <View style={styles.flowCols}>
                  <View style={styles.flowCol}>
                    <Text style={styles.flowColLabel}>In</Text>
                    <Text
                      style={[
                        styles.flowColVal,
                        { color: colors.incomeGreen },
                      ]}
                    >
                      +{fmtPeso(monthIn)}
                    </Text>
                    <Text
                      style={[
                        styles.flowColDelta,
                        {
                          color:
                            monthIn === prevMonthIn
                              ? colors.textSecondary
                              : monthIn >= prevMonthIn
                                ? colors.incomeGreen
                                : colors.expenseRed,
                        },
                      ]}
                    >
                      {fmtTrend(monthIn, prevMonthIn) || '—'}
                    </Text>
                  </View>
                  <View style={styles.flowDivider} />
                  <View style={styles.flowCol}>
                    <Text style={styles.flowColLabel}>Out</Text>
                    <Text
                      style={[
                        styles.flowColVal,
                        { color: colors.expenseRed },
                      ]}
                    >
                      −{fmtPeso(monthOut)}
                    </Text>
                    <Text
                      style={[
                        styles.flowColDelta,
                        {
                          color:
                            monthOut === prevMonthOut
                              ? colors.textSecondary
                              : monthOut <= prevMonthOut
                                ? colors.incomeGreen
                                : colors.expenseRed,
                        },
                      ]}
                    >
                      {fmtTrend(monthOut, prevMonthOut) || '—'}
                    </Text>
                  </View>
                  <View style={styles.flowDivider} />
                  <View style={styles.flowCol}>
                    <Text style={styles.flowColLabel}>Net</Text>
                    <Text
                      style={[
                        styles.flowColVal,
                        {
                          color:
                            monthNet >= 0
                              ? colors.textPrimary
                              : colors.expenseRed,
                        },
                      ]}
                    >
                      {monthNet >= 0 ? '+' : '−'}
                      {fmtPeso(monthNet)}
                    </Text>
                    <Text style={styles.flowColDelta}>
                      {curMonthCount} txn{curMonthCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                {/* 14-day sparkline */}
                <View style={styles.sparkWrap}>
                  {dailyFlow.days.map((d, i) => {
                    const SPARK_H = 38;
                    const total = d.in + d.out;
                    const inH = total > 0 ? (d.in / dailyFlow.max) * SPARK_H : 0;
                    const outH = total > 0 ? (d.out / dailyFlow.max) * SPARK_H : 0;
                    return (
                      <View key={i} style={styles.sparkBar}>
                        <View
                          style={[
                            styles.sparkSeg,
                            {
                              height: outH,
                              backgroundColor: colors.expenseRed,
                              opacity: 0.85,
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.sparkSeg,
                            {
                              height: inH,
                              backgroundColor: colors.incomeGreen,
                              opacity: 0.9,
                              marginTop: inH > 0 && outH > 0 ? 1 : 0,
                            },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.sparkFoot}>
                  <Text style={styles.sparkFootText}>14 days ago</Text>
                  <Text style={styles.sparkFootText}>Today</Text>
                </View>
              </View>
            </View>

            {/* Top categories */}
            {topCats.items.length > 0 && (
              <View style={styles.sectionPad}>
                <View style={styles.sectionHeaderInline}>
                  <Text style={styles.sectionTitle}>Where it went</Text>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('Tabs', {
                        screen: 'feed',
                        params: {
                          screen: 'FeedMain',
                          params: { filterAccount: id },
                        },
                      })
                    }
                  >
                    <Text style={[styles.seeAll, { color: config.color }]}>
                      View breakdown →
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.catCard}>
                  {topCats.items.map((c, i) => {
                    const { key, color: catColor } = getPillIcon(c.cat);
                    const barW = (c.amt / topCats.maxAmt) * 100;
                    return (
                      <View
                        key={c.cat}
                        style={[styles.catRow, i > 0 && styles.catRowDivider]}
                      >
                        <CategoryIcon
                          categoryKey={key}
                          color={catColor}
                          wrapperSize={32}
                          size={16}
                        />
                        <View style={styles.catMeta}>
                          <Text style={styles.catName}>
                            {c.cat.charAt(0).toUpperCase() + c.cat.slice(1)}
                          </Text>
                          <View style={styles.catBar}>
                            <View
                              style={[
                                styles.catBarFill,
                                {
                                  width: `${barW}%`,
                                  backgroundColor: catColor,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <View style={styles.catRight}>
                          <Text style={styles.catAmt}>−{fmtPeso(c.amt)}</Text>
                          <Text style={styles.catPct}>
                            {c.pct.toFixed(0)}% of out
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              <View style={styles.sectionActions}>
                <TouchableOpacity
                  onPress={() => {
                    setSearchVisible((v) => !v);
                    if (searchVisible) setSearchQuery('');
                  }}
                  hitSlop={8}
                >
                  <Icon name="search" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('Tabs', {
                      screen: 'feed',
                      params: {
                        screen: 'FeedMain',
                        params: {
                          filterAccount: id,
                          filterCategory: activeCategory ?? undefined,
                        },
                      },
                    })
                  }
                >
                  <Text style={[styles.seeAll, { color: config.color }]}>
                    See all{transactions.length ? ` (${transactions.length})` : ''} →
                  </Text>
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
                    activeCategory === null && [
                      styles.filterPillActive,
                      {
                        backgroundColor: config.color,
                        borderColor: config.color,
                      },
                    ],
                  ]}
                  onPress={() => setActiveCategory(null)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      activeCategory === null && styles.filterPillTextActive,
                    ]}
                  >
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
                        isActive && [
                          styles.filterPillActive,
                          {
                            backgroundColor: config.color,
                            borderColor: config.color,
                          },
                        ],
                      ]}
                      onPress={() => setActiveCategory(isActive ? null : cat)}
                    >
                      <View style={styles.pillInner}>
                        <CategoryIcon
                          categoryKey={key}
                          color={isActive ? '#FFFFFF' : color}
                          wrapperSize={18}
                          size={10}
                        />
                        <Text
                          style={[
                            styles.filterPillText,
                            isActive && styles.filterPillTextActive,
                          ]}
                        >
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
            {searchQuery || activeCategory
              ? 'No matching transactions'
              : 'No recent transactions'}
          </Text>
        }
        ListFooterComponent={
          <>
            <View style={styles.sectionPad}>
              <View style={styles.detailsCard}>
                <View style={styles.detailsHead}>
                  <Text style={styles.detailsTitle}>Account details</Text>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: `${config.color}1F` },
                    ]}
                  >
                    <Text
                      style={[styles.typeBadgeText, { color: config.color }]}
                    >
                      {(selectedAccount.type ?? 'Account').toLowerCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsKey}>Last reconciled</Text>
                  <Text style={styles.detailsVal}>{lastReconciledLabel}</Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsKey}>Created</Text>
                  <Text style={styles.detailsVal}>{createdLabel}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.detailsRow, styles.detailsRowLast]}
                  onPress={() => {
                    setEditName(selectedAccount?.name ?? '');
                    setEditType(selectedAccount?.type ?? '');
                    setEditSheetVisible(true);
                  }}
                >
                  <Text style={styles.detailsKey}>Account name &amp; type</Text>
                  <Text
                    style={[styles.detailsEditLink, { color: config.color }]}
                  >
                    Edit →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.actionWrap}>
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => setShowDeleteModal(true)}
              >
                <Text style={styles.dangerBtnText}>Delete this account</Text>
              </TouchableOpacity>
            </View>
          </>
        }
      />

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
                handleBack();
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

      <TransferModal
        visible={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={() => {}}
        sourceAccount={selectedAccount}
        otherAccounts={otherAccounts}
        colors={colors}
        isDark={isDark}
      />

      <AdjustBalanceSheet
        visible={adjustSheetVisible}
        onClose={() => setAdjustSheetVisible(false)}
        onSuccess={() => {}}
        account={selectedAccount}
        colors={colors}
        isDark={isDark}
      />

      {/* ════ EDIT ACCOUNT ════ */}
      {editSheetVisible && (
        <BottomSheet
          index={0}
          snapPoints={['45%']}
          enablePanDownToClose
          keyboardBehavior={
            Platform.OS === 'ios' ? 'interactive' : 'fillParent'
          }
          keyboardBlurBehavior="restore"
          enableBlurKeyboardOnGesture
          android_keyboardInputMode="adjustPan"
          backdropComponent={(props) => (
            <BottomSheetBackdrop
              {...props}
              disappearsOnIndex={-1}
              appearsOnIndex={0}
              pressBehavior="close"
            />
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
            <Text style={styles.adjustSub}>
              Update the name or type for this account.
            </Text>

            <Text style={[styles.metaLabel, { marginBottom: 6, marginTop: 8 }]}>
              Account Name
            </Text>
            <BottomSheetTextInput
              style={styles.adjustInputField}
              placeholder="e.g. GCash"
              placeholderTextColor={colors.textSecondary}
              value={editName}
              onChangeText={setEditName}
              returnKeyType="next"
              autoCapitalize="words"
            />

            <Text
              style={[styles.metaLabel, { marginBottom: 6, marginTop: 16 }]}
            >
              Account Type
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 8,
              }}
            >
              {['E-WALLET', 'BANK ACCOUNT', 'CASH WALLET', 'CREDIT CARD'].map(
                (t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setEditType(t)}
                    style={[
                      styles.filterPill,
                      editType === t && [
                        styles.filterPillActive,
                        {
                          backgroundColor: config.color,
                          borderColor: config.color,
                        },
                      ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        editType === t && styles.filterPillTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.adjustSaveBtn,
                {
                  marginTop: 20,
                  opacity: editSaving || !editName.trim() ? 0.45 : 1,
                },
              ]}
              onPress={handleSaveEdit}
              disabled={editSaving || !editName.trim()}
            >
              <Text style={styles.adjustSaveBtnText}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setEditSheetVisible(false)}
            >
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
    backGhostBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textPrimary,
    },
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
      marginBottom: 14,
    },
    heroIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIconArrow: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 18,
      color: '#FFFFFF',
      lineHeight: 20,
    },
    heroTitleWrap: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    heroTitleText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    heroTitleSub: {
      fontFamily: 'Inter_500Medium',
      fontSize: 9.5,
      color: 'rgba(255,255,255,0.7)',
      letterSpacing: 1.6,
      marginTop: 2,
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
    heroEditBtnInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    backBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#FFFFFF',
    },
    // Share-of-wealth strip
    shareWrap: {
      width: '100%',
      marginTop: 16,
      gap: 6,
    },
    shareRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    shareLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: 'rgba(255,255,255,0.78)',
    },
    sharePct: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 13,
      color: '#FFFFFF',
    },
    shareTrack: {
      height: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.18)',
      overflow: 'hidden',
    },
    shareFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
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
    accountBalance: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 40,
      color: '#FFFFFF',
      letterSpacing: -1.5,
    },
    quickActionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 18,
      width: '100%',
    },
    qaBtn: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 14,
      alignItems: 'center',
      gap: 5,
    },
    qaIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    qaIconGlyph: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#FFFFFF',
      lineHeight: 15,
    },
    qaBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: '#FFFFFF',
    },
    // Section helper
    sectionPad: {
      paddingHorizontal: spacing.screenPadding,
      marginTop: 18,
    },
    sectionHeaderInline: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 4,
      marginBottom: 10,
    },
    // Money Flow card
    flowCard: {
      backgroundColor: colors.white,
      borderRadius: radius.card,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    flowHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    flowTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    monthChip: {
      backgroundColor: colors.background,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    monthChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textSecondary,
    },
    flowCols: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    flowCol: {
      flex: 1,
      paddingVertical: 4,
    },
    flowColLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 9.5,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4,
    },
    flowColVal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      color: colors.textPrimary,
    },
    flowColDelta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 9.5,
      color: colors.textSecondary,
      marginTop: 3,
    },
    flowDivider: {
      width: 1,
      height: 36,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(30,30,46,0.08)',
      marginHorizontal: 4,
    },
    // Sparkline
    sparkWrap: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 3,
      height: 40,
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(30,30,46,0.06)',
    },
    sparkBar: {
      flex: 1,
      flexDirection: 'column',
      justifyContent: 'flex-end',
    },
    sparkSeg: {
      width: '100%',
      borderRadius: 1.5,
    },
    sparkFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    sparkFootText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 9,
      color: colors.textSecondary,
    },
    // Top categories
    catCard: {
      backgroundColor: colors.white,
      borderRadius: radius.card,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
    },
    catRowDivider: {
      borderTopWidth: 1,
      borderTopColor: isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(30,30,46,0.06)',
    },
    catMeta: {
      flex: 1,
      gap: 5,
    },
    catName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    catBar: {
      height: 4,
      borderRadius: 999,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(30,30,46,0.05)',
      overflow: 'hidden',
    },
    catBarFill: {
      height: '100%',
      borderRadius: 999,
    },
    catRight: {
      alignItems: 'flex-end',
    },
    catAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 12.5,
      color: colors.textPrimary,
    },
    catPct: {
      fontFamily: 'Inter_500Medium',
      fontSize: 9.5,
      color: colors.textSecondary,
      marginTop: 1,
    },
    // Account details card
    detailsCard: {
      backgroundColor: colors.white,
      borderRadius: radius.card,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    detailsHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(30,30,46,0.06)',
    },
    detailsTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    typeBadge: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    typeBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    detailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(30,30,46,0.05)',
    },
    detailsRowLast: {
      borderBottomWidth: 0,
      paddingBottom: 0,
    },
    detailsKey: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11.5,
      color: colors.textSecondary,
    },
    detailsVal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 12,
      color: colors.textPrimary,
    },
    detailsEditLink: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.primary,
    },
    // Danger zone
    dangerBtn: {
      width: '100%',
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(192,80,58,0.35)',
      borderStyle: 'dashed',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    dangerBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.coralDark,
    },
    // Stats (legacy — kept to avoid breaking the loading skeleton)
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
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
      minHeight: 90,
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
    progressTrack: {
      width: '100%',
      height: 4,
      borderRadius: 999,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(30,30,46,0.06)',
      marginTop: 8,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 999 },
    trendText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 9,
      color: colors.textSecondary,
      marginTop: 5,
      textAlign: 'center',
    },
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
    metaLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.textSecondary,
      marginBottom: 3,
    },
    metaValue: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    adjustBadge: {
      backgroundColor: isDark
        ? 'rgba(106,158,127,0.15)'
        : 'rgba(91,140,110,0.1)',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    adjustBadgeInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    adjustBadgeText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.primary,
    },
    // Section header
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
    sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    searchIconText: { fontSize: 16 },
    seeAll: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.primary,
    },
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
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    filterPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    filterPillTextActive: { color: '#FFFFFF' },
    // Transactions
    listWrap: { minHeight: 80, paddingHorizontal: spacing.screenPadding },
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 24,
    },
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
    txAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
    actionWrap: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 24,
      alignItems: 'center',
    },
    deleteLinkText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.coralDark,
      paddingVertical: 8,
    },
    // Modals (delete + transfer)
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
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
    transferAcctAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transferAcctLetter: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#FFFFFF',
    },
    transferAcctName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    transferAcctBal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 10,
      color: colors.textSecondary,
    },
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
    adjustTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    adjustSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 24,
    },
    balanceCompareRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 20,
    },
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
    balanceCompareValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.textPrimary,
    },
    balanceArrow: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 18,
      color: colors.textSecondary,
    },
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
    adjustInputPrefix: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 20,
      color: colors.primary,
      marginRight: 6,
    },
    adjustInputField: {
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
    diffCardText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
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
    adjustSaveBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#FFFFFF',
    },
  });
