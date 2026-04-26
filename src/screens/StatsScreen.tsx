import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ScrollView,
  InteractionManager,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import type CategoryModel from '@/db/models/Category';
import { useAccounts } from '@/hooks/useAccounts';
import { ErrorBanner } from '@/components/ErrorBanner';
import { CATEGORY_COLOR } from '@/constants/categoryMappings';
import fmtPeso from '@/utils/format';

import { CashFlowCard, type MonthTrendPoint } from '@/components/stats/CashFlowCard';
import { TrajectoryChart } from '@/components/stats/TrajectoryChart';
import { CategoryDonut, type DonutSlice } from '@/components/stats/CategoryDonut';
import {
  TopSpendingCard,
  type MerchantRow,
  type TopTxRow,
} from '@/components/stats/TopSpendingCard';
import { ByAccountStrip, type AccountSpend } from '@/components/stats/ByAccountStrip';
import { MoneyFlowSankey, type SankeyNode } from '@/components/stats/MoneyFlowSankey';
import { FinoHeadline, FinoChip } from '@/components/stats/FinoChip';
import { QuickScrollNav, DEFAULT_TABS } from '@/components/stats/QuickScrollNav';
import { MonthPickerModal } from '@/components/stats/MonthPickerModal';
import DowPatternChart from '@/components/stats/DowPatternChart';
import TimeOfDayChart from '@/components/stats/TimeOfDayChart';
import { getInsights, type Insights } from '@/services/IntelligenceEngine';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MERCHANT_PALETTE = [
  '#1B7A4B', '#0F5B3F', '#1F4FB6', '#0072FF', '#D31921',
  '#7A4AB8', '#E8856A', '#5B8C6E', '#C97A20', '#A0153E',
];

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MERCHANT_PALETTE[Math.abs(h) % MERCHANT_PALETTE.length];
}

function categoryColor(cat: string | null): string {
  if (!cat) return CATEGORY_COLOR.default;
  return CATEGORY_COLOR[cat.toLowerCase()] ?? CATEGORY_COLOR.default;
}

function isTransferRow(t: TransactionModel): boolean {
  return t.isTransfer || (t.category ?? '').toLowerCase() === 'transfer';
}

// ─── Types ──────────────────────────────────────────────────────────────────

type StatsBundle = {
  // Composition
  expenseTotalsByCat: { key: string; label: string; amount: number }[];
  totalExpense: number;
  totalIncome: number;
  totalBudget: number;
  // Trajectory
  cumulativeByDay: number[];
  dailySeries: { day: number; amount: number }[];
  dailyMax: number;
  dowAvg: number[];
  // Time-of-day buckets: [morning, afternoon, evening, night]
  todTotals: number[];
  todCounts: number[];
  // Cash flow
  prevTotalIncome: number;
  prevTotalExpense: number;
  trendNet: MonthTrendPoint[];
  // Composition / lists
  topMerchants: MerchantRow[];
  topTransactions: TopTxRow[];
  byAccount: AccountSpend[];
  // Stats
  largestExpense: number;
  txCount: number;
};

const EMPTY_BUNDLE: StatsBundle = {
  expenseTotalsByCat: [],
  totalExpense: 0,
  totalIncome: 0,
  totalBudget: 0,
  cumulativeByDay: [],
  dailySeries: [],
  dailyMax: 1,
  dowAvg: [0, 0, 0, 0, 0, 0, 0],
  todTotals: [0, 0, 0, 0],
  todCounts: [0, 0, 0, 0],
  prevTotalIncome: 0,
  prevTotalExpense: 0,
  trendNet: [],
  topMerchants: [],
  topTransactions: [],
  byAccount: [],
  largestExpense: 0,
  txCount: 0,
};

// ─── Main screen ────────────────────────────────────────────────────────────

function InsightsScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [, startTransition] = useTransition();

  const isInitialLoadRef = useRef(true);
  const lastFetchedAt = useRef(0);
  const lastFetchedKey = useRef('');
  const STATS_STALE_MS = 30_000;

  // ── Date state ──
  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // ── Data state ──
  const [bundle, setBundle] = useState<StatsBundle>(EMPTY_BUNDLE);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { accounts, error: accountsError, refetch: refetchAccounts } = useAccounts();

  const isCurrentMonth =
    selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
  const monthNavLabel = `${MONTHS_SHORT[selectedMonth]} ${selectedYear}`;

  const monthRange = useMemo(() => {
    const from = new Date(selectedYear, selectedMonth, 1).toISOString();
    const to = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).toISOString();
    return { from, to };
  }, [selectedYear, selectedMonth]);

  const daysInMonth = useMemo(
    () => new Date(selectedYear, selectedMonth + 1, 0).getDate(),
    [selectedYear, selectedMonth]
  );
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;

  // ── Quick-scroll nav ──
  const scrollViewRef = useRef<any>(null);
  const sectionOffsets = useRef<number[]>([0, 0, 0]);
  const [activeIndex, setActiveIndex] = useState(0);
  const navScrolled = useSharedValue(0);

  const handleSectionLayout = useCallback(
    (idx: number) => (e: LayoutChangeEvent) => {
      sectionOffsets.current[idx] = e.nativeEvent.layout.y;
    },
    []
  );

  const handleTabPress = useCallback((idx: number) => {
    const y = Math.max(0, sectionOffsets.current[idx] - 4);
    scrollViewRef.current?.scrollTo?.({ y, animated: true });
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      navScrolled.value = withTiming(y > 60 ? 1 : 0, { duration: 180 });
      // Active section: highest index whose offset is above scroll position
      let next = 0;
      const offsets = sectionOffsets.current;
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] - 80 <= y) next = i;
      }
      if (next !== activeIndex) setActiveIndex(next);
    },
    [activeIndex, navScrolled]
  );

  // ── Fetch stats ──
  const fetchStats = useCallback(
    async (force = false) => {
      if (!userId) {
        setLoading(false);
        return;
      }

      const cacheKey = `FINO_STATS_V2_CACHE_${selectedYear}_${selectedMonth}`;

      if (
        !force &&
        lastFetchedKey.current === cacheKey &&
        Date.now() - lastFetchedAt.current < STATS_STALE_MS
      ) {
        return;
      }

      // Serve cached bundle right away
      if (lastFetchedKey.current !== cacheKey) {
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            startTransition(() => {
              setBundle(JSON.parse(cached));
              setLoading(false);
            });
          }
        } catch (err) {
          if (__DEV__)
            console.warn('[StatsScreen] cache read failed:', err);
        }
      }

      try {
        if (isInitialLoadRef.current) {
          setLoading(true);
          isInitialLoadRef.current = false;
        }

        const sixMoStart = new Date(selectedYear, selectedMonth - 5, 1).toISOString();
        const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYearIdx = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const prevFrom = new Date(prevYearIdx, prevMonthIdx, 1).toISOString();
        const prevTo = new Date(prevYearIdx, prevMonthIdx + 1, 0, 23, 59, 59, 999).toISOString();

        const txCol = database.get<TransactionModel>('transactions');
        const catCol = database.get<CategoryModel>('categories');

        const [catRecords, monthTx, prevMonthTx, sixMoTx, topExpenseRecords] =
          await Promise.all([
            catCol
              .query(Q.where('user_id', userId), Q.where('is_active', true))
              .fetch(),
            txCol
              .query(
                Q.where('user_id', userId),
                Q.where('date', Q.gte(monthRange.from)),
                Q.where('date', Q.lte(monthRange.to))
              )
              .fetch(),
            txCol
              .query(
                Q.where('user_id', userId),
                Q.where('date', Q.gte(prevFrom)),
                Q.where('date', Q.lte(prevTo))
              )
              .fetch(),
            txCol
              .query(
                Q.where('user_id', userId),
                Q.where('date', Q.gte(sixMoStart)),
                Q.where('date', Q.lte(monthRange.to))
              )
              .fetch(),
            txCol
              .query(
                Q.where('user_id', userId),
                Q.where('type', 'expense'),
                Q.where('date', Q.gte(monthRange.from)),
                Q.where('date', Q.lte(monthRange.to)),
                Q.sortBy('amount', Q.desc)
              )
              .fetch(),
          ]);

        // Build category-key → display label map (for donut + breakdown)
        const catLabelByKey: Record<string, string> = {};
        let totalBudget = 0;
        catRecords.forEach((c) => {
          const key = (c.name ?? '').trim().toLowerCase();
          if (!key) return;
          catLabelByKey[key] = c.name;
          if (c.budgetLimit && c.budgetLimit > 0) totalBudget += c.budgetLimit;
        });

        // ── This month: aggregate income/expense, daily, DOW, accounts, merchants
        let totalIncome = 0;
        let totalExpense = 0;
        let largestExpense = 0;
        const expenseByCat: Record<string, number> = {};
        const dailyMap: Record<number, number> = {};
        const dowTotals = [0, 0, 0, 0, 0, 0, 0];
        const dowCounts = [0, 0, 0, 0, 0, 0, 0];
        // Time-of-day buckets, indexed [morning, afternoon, evening, night].
        // Bucket boundaries: morning 5–12, afternoon 12–17, evening 17–21, night 21–5.
        const todTotals = [0, 0, 0, 0];
        const todCounts = [0, 0, 0, 0];
        const acctExpense: Record<string, { amount: number; count: number }> = {};
        const merchantMap: Record<
          string,
          { name: string; amount: number; count: number; category: string | null }
        > = {};
        let txCount = 0;

        monthTx.forEach((t) => {
          if (isTransferRow(t)) return;
          if (t.type === 'income') {
            totalIncome += t.amount;
            return;
          }
          if (t.type !== 'expense') return;
          totalExpense += t.amount;
          txCount += 1;
          if (t.amount > largestExpense) largestExpense = t.amount;

          const catKey = (t.category ?? '').trim().toLowerCase();
          if (catKey) expenseByCat[catKey] = (expenseByCat[catKey] ?? 0) + t.amount;

          // Daily
          const day = new Date(t.date).getDate();
          dailyMap[day] = (dailyMap[day] ?? 0) + t.amount;

          // DOW
          const txDate = new Date(t.date);
          const dow = (txDate.getDay() + 6) % 7;
          dowTotals[dow] += t.amount;
          dowCounts[dow] += 1;

          // Time-of-day bucket from local hour. Indexes match the chart:
          // 0 morning (5–12), 1 afternoon (12–17), 2 evening (17–21), 3 night.
          const hr = txDate.getHours();
          const todIdx =
            hr >= 5 && hr < 12 ? 0
            : hr >= 12 && hr < 17 ? 1
            : hr >= 17 && hr < 21 ? 2
            : 3;
          todTotals[todIdx] += t.amount;
          todCounts[todIdx] += 1;

          // Accounts
          const acct = acctExpense[t.accountId] ?? { amount: 0, count: 0 };
          acct.amount += t.amount;
          acct.count += 1;
          acctExpense[t.accountId] = acct;

          // Merchants — group by merchant_name with display_name fallback
          const rawKey =
            (t.merchantName ?? '').trim() ||
            (t.displayName ?? '').trim() ||
            'Unknown';
          const groupKey = rawKey.toLowerCase();
          const m = merchantMap[groupKey] ?? {
            name: rawKey,
            amount: 0,
            count: 0,
            category: null as string | null,
          };
          m.amount += t.amount;
          m.count += 1;
          if (!m.category && t.category) m.category = t.category;
          merchantMap[groupKey] = m;
        });

        const dowAvg = dowTotals.map((sum, i) =>
          dowCounts[i] > 0 ? sum / dowCounts[i] : 0
        );

        // Materialise the category aggregation. Filter steps:
        //   1. Drop NaN / non-finite (defensive against bad rows from sync).
        //   2. Drop zero / negative amounts — they break donut + sankey math.
        //   3. Sort desc so downstream slicing (top 8 / top 6) keeps the leaders.
        const expenseTotalsByCat: { key: string; label: string; amount: number }[] =
          Object.entries(expenseByCat)
            .filter(
              ([, amount]) => Number.isFinite(amount) && amount > 0
            )
            .map(([key, amount]) => ({
              key,
              label: catLabelByKey[key] ?? cap(key),
              amount,
            }))
            .sort((a, b) => b.amount - a.amount);

        // Cumulative by day (1..daysInMonth)
        const cumulativeByDay: number[] = [];
        let running = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          running += dailyMap[d] ?? 0;
          cumulativeByDay.push(running);
        }

        // Daily series for drill-down chart
        const dailySeries: { day: number; amount: number }[] = [];
        let dailyMax = 1;
        for (let d = 1; d <= daysInMonth; d++) {
          const v = dailyMap[d] ?? 0;
          dailySeries.push({ day: d, amount: v });
          if (v > dailyMax) dailyMax = v;
        }

        // Top merchants
        const topMerchants: MerchantRow[] = Object.entries(merchantMap)
          .map(([key, m]) => ({
            key,
            name: m.name,
            count: m.count,
            category: m.category,
            amount: m.amount,
            color: hashColor(m.name),
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10);

        // Top single transactions (top 5 by amount)
        const topTransactions: TopTxRow[] = topExpenseRecords
          .filter((t) => !isTransferRow(t))
          .slice(0, 5)
          .map((t) => {
            const name = t.displayName ?? t.merchantName ?? cap(t.category ?? 'Expense');
            return {
              key: t.id,
              name,
              category: t.category ?? null,
              amount: t.amount,
              date: t.date,
              color: categoryColor(t.category ?? null),
            };
          });

        // By account
        const byAccount: AccountSpend[] = accounts
          .map((a) => {
            const e = acctExpense[a.id];
            return {
              id: a.id,
              name: a.name,
              brandColour: a.brand_colour ?? null,
              letterAvatar: a.letter_avatar ?? null,
              expense: e?.amount ?? 0,
              txCount: e?.count ?? 0,
            };
          })
          .filter((a) => a.expense > 0)
          .sort((a, b) => b.expense - a.expense);

        // ── Prev month totals (for cash-flow delta) ──
        let prevTotalIncome = 0;
        let prevTotalExpense = 0;
        prevMonthTx.forEach((t) => {
          if (isTransferRow(t)) return;
          if (t.type === 'income') prevTotalIncome += t.amount;
          else if (t.type === 'expense') prevTotalExpense += t.amount;
        });

        // ── 6-month trend ──
        const trendMap: Record<string, { income: number; expense: number }> = {};
        sixMoTx.forEach((t) => {
          if (isTransferRow(t)) return;
          const ym = t.date.slice(0, 7);
          const m = trendMap[ym] ?? { income: 0, expense: 0 };
          if (t.type === 'income') m.income += t.amount;
          else if (t.type === 'expense') m.expense += t.amount;
          trendMap[ym] = m;
        });
        const trendNet: MonthTrendPoint[] = [];
        for (let i = 5; i >= 0; i--) {
          const dt = new Date(selectedYear, selectedMonth - i, 1);
          const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          const m = trendMap[ym] ?? { income: 0, expense: 0 };
          trendNet.push({
            label: MONTHS_SHORT[dt.getMonth()],
            net: m.income - m.expense,
            isCurrent: i === 0,
          });
        }

        const next: StatsBundle = {
          expenseTotalsByCat,
          totalExpense,
          totalIncome,
          totalBudget,
          cumulativeByDay,
          dailySeries,
          dailyMax,
          dowAvg,
          todTotals,
          todCounts,
          prevTotalIncome,
          prevTotalExpense,
          trendNet,
          topMerchants,
          topTransactions,
          byAccount,
          largestExpense,
          txCount,
        };

        startTransition(() => {
          setBundle(next);
        });

        AsyncStorage.setItem(cacheKey, JSON.stringify(next)).catch((err) => {
          if (__DEV__) console.warn('[StatsScreen] cache write failed:', err);
        });
        lastFetchedAt.current = Date.now();
        lastFetchedKey.current = cacheKey;
      } finally {
        setLoading(false);
      }
    },
    [accounts, daysInMonth, monthRange, selectedMonth, selectedYear, userId]
  );

  // ── Intelligence engine ──
  const fetchInsights = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await getInsights(userId, selectedYear, selectedMonth);
      startTransition(() => setInsights(res));
    } catch (err) {
      if (__DEV__) console.warn('[StatsScreen] insights fetch failed:', err);
    }
  }, [userId, selectedYear, selectedMonth]);

  // Re-fetch when month changes
  useEffect(() => {
    fetchStats(true);
    fetchInsights();
  }, [selectedYear, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive refresh on transaction / category changes
  useEffect(() => {
    if (!userId) return;
    const txCol = database.get<TransactionModel>('transactions');
    const catCol = database.get<CategoryModel>('categories');
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fetchStats(true);
      }, 250);
    };
    const schedule2 = () => {
      schedule();
      fetchInsights();
    };
    const subs = [
      txCol.changes.subscribe(schedule2),
      catCol.changes.subscribe(schedule2),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
    };
  }, [userId, fetchStats]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        startTransition(() => {
          fetchStats();
          fetchInsights();
        });
      });
      return () => task.cancel();
    }, [fetchStats, fetchInsights])
  );

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };
  const handleNextMonth = () => {
    if (
      selectedYear > now.getFullYear() ||
      (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth())
    ) {
      return;
    }
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // ── Derived data for components ──
  const donutSlices: DonutSlice[] = useMemo(
    () =>
      bundle.expenseTotalsByCat.slice(0, 8).map((c) => ({
        key: c.key,
        label: c.label,
        amount: c.amount,
        color: categoryColor(c.key),
      })),
    [bundle.expenseTotalsByCat]
  );

  const sankeyExpenseNodes: SankeyNode[] = useMemo(
    () =>
      bundle.expenseTotalsByCat.slice(0, 6).map((c) => ({
        key: c.key,
        label: c.label,
        amount: c.amount,
        color: categoryColor(c.key),
      })),
    [bundle.expenseTotalsByCat]
  );

  // Engine output is preferred; static helpers serve as a synchronous
  // fallback while the first WatermelonDB query resolves.
  const finoHeadlineText = insights?.headline ?? buildHeadline(bundle);
  const finoWhereChip = insights?.whereChip ?? buildWhereChip(bundle);
  const finoWhenChip = insights?.whenChip ?? buildWhenChip(bundle);

  // ── Render ──

  if (loading && bundle.totalExpense === 0 && bundle.totalIncome === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Insights</Text>
        </View>
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading insights…
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Insights</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation.navigate('IconPreview')}
          style={[styles.notifBtn, { backgroundColor: colors.white, borderColor: colors.border }]}
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {accountsError ? (
        <ErrorBanner
          message="Can't reach server — showing cached data."
          onRetry={refetchAccounts}
        />
      ) : null}

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[2]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              setIsRefreshing(true);
              try {
                await Promise.all([
                  fetchStats(true),
                  refetchAccounts(),
                ]);
              } finally {
                setIsRefreshing(false);
              }
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* 0: Month picker pill */}
        <View style={styles.monthPillRow}>
          <View style={[styles.monthPill, { backgroundColor: colors.white, borderColor: colors.border }]}>
            <Pressable
              onPress={handlePrevMonth}
              style={[styles.monthArrow, { backgroundColor: colors.surfaceSubdued }]}
            >
              <Ionicons name="chevron-back" size={14} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setMonthPickerVisible(true)} style={styles.monthLabelBtn}>
              <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
                {monthNavLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleNextMonth}
              style={[styles.monthArrow, { backgroundColor: colors.surfaceSubdued }]}
            >
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* 1: Fino headline */}
        <FinoHeadline text={finoHeadlineText} />

        {/* 2: Sticky quick-scroll nav */}
        <QuickScrollNav
          tabs={DEFAULT_TABS}
          activeIndex={activeIndex}
          scrolled={navScrolled}
          onTabPress={handleTabPress}
        />

        {/* 3: SECTION 01 — Pulse */}
        <View onLayout={handleSectionLayout(0)}>
          <SectionLabel num="01" title="Your pulse" colors={colors} />
          <CashFlowCard
            income={bundle.totalIncome}
            expenses={bundle.totalExpense}
            prevNet={
              bundle.prevTotalIncome === 0 && bundle.prevTotalExpense === 0
                ? null
                : bundle.prevTotalIncome - bundle.prevTotalExpense
            }
            trend={bundle.trendNet}
            largest={bundle.largestExpense}
            txCount={bundle.txCount}
            daysElapsed={daysElapsed}
          />
          <MoneyFlowSankey
            income={bundle.totalIncome}
            savings={bundle.totalIncome - bundle.totalExpense}
            expenseNodes={sankeyExpenseNodes}
            onExpand={() =>
              navigation.navigate('SankeyFullscreen', {
                income: bundle.totalIncome,
                savings: bundle.totalIncome - bundle.totalExpense,
                expenseNodes: sankeyExpenseNodes,
              })
            }
          />
          <TrajectoryChart
            cumulative={bundle.cumulativeByDay}
            budget={bundle.totalBudget}
            daysInMonth={daysInMonth}
            daysElapsed={daysElapsed}
            dailyData={bundle.dailySeries}
            dailyMax={bundle.dailyMax}
            isCurrentMonth={isCurrentMonth}
          />
        </View>

        {/* 4: SECTION 02 — Where it went */}
        <View onLayout={handleSectionLayout(1)}>
          <SectionLabel num="02" title="Where it went" colors={colors} />
          <FinoChip text={finoWhereChip} />
          <CategoryDonut slices={donutSlices} />
          <TopSpendingCard
            merchants={bundle.topMerchants}
            topTransactions={bundle.topTransactions}
            totalExpense={bundle.totalExpense}
          />
          <ByAccountStrip
            accounts={bundle.byAccount}
            totalExpense={bundle.totalExpense}
          />
        </View>

        {/* 5: SECTION 03 — When you spend */}
        <View onLayout={handleSectionLayout(2)}>
          <SectionLabel num="03" title="Spending patterns" colors={colors} />
          <FinoChip text={finoWhenChip} />
          <View
            style={[
              styles.dowCard,
              { backgroundColor: colors.white, borderColor: colors.cardBorderTransparent },
            ]}
          >
            <View style={styles.dowHead}>
              <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
                DAY-OF-WEEK PATTERN
              </Text>
            </View>
            <DowPatternChart dowAvg={bundle.dowAvg} colors={colors} />
          </View>
          <View
            style={[
              styles.dowCard,
              { backgroundColor: colors.white, borderColor: colors.cardBorderTransparent },
            ]}
          >
            <View style={styles.dowHead}>
              <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
                TIME-OF-DAY PATTERN
              </Text>
            </View>
            <TimeOfDayChart
              todTotals={bundle.todTotals}
              todCounts={bundle.todCounts}
              colors={colors}
            />
          </View>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      <MonthPickerModal
        visible={monthPickerVisible}
        year={selectedYear}
        month={selectedMonth}
        onConfirm={(y, m) => {
          setSelectedYear(y);
          setSelectedMonth(m);
          setMonthPickerVisible(false);
        }}
        onClose={() => setMonthPickerVisible(false)}
      />
    </View>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function SectionLabel({ num, title, colors }: { num: string; title: string; colors: any }) {
  return (
    <View style={sectionLabelStyles.row}>
      <Text style={[sectionLabelStyles.num, { color: colors.textSecondary }]}>{num}</Text>
      <Text style={[sectionLabelStyles.title, { color: colors.textPrimary }]}>{title}</Text>
      <View style={[sectionLabelStyles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const sectionLabelStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  num: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 10,
  },
  title: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 16,
  },
  line: { flex: 1, height: 1 },
});

// ─── Insight builders (synchronous, derived from data) ──────────────────────

function buildHeadline(b: StatsBundle): string {
  const net = b.totalIncome - b.totalExpense;
  if (b.totalIncome === 0 && b.totalExpense === 0) {
    return 'No transactions yet this month — start tracking to see your trends.';
  }
  if (b.totalIncome <= 0) {
    return `You've spent ${fmtPeso(b.totalExpense)} this month. Add an income transaction to see your savings rate.`;
  }
  const pct = Math.round((net / b.totalIncome) * 100);
  if (pct >= 30) {
    return `Strong month — you're keeping ${pct}% of income (${fmtPeso(net)}). Keep it going.`;
  }
  if (pct >= 0) {
    return `You're keeping ${pct}% of income this month. Net of ${fmtPeso(net)}.`;
  }
  return `Spending is ${fmtPeso(-net)} above income this month — review your top categories below.`;
}

function buildWhereChip(b: StatsBundle): string {
  const top = b.expenseTotalsByCat[0];
  const second = b.expenseTotalsByCat[1];
  const topMerchant = b.topMerchants[0];
  if (!top && !topMerchant) {
    return 'No expenses tracked yet — your top categories will appear here.';
  }
  // Lead with concentration: how dominant is the top category vs the rest?
  if (top && b.totalExpense > 0) {
    const topPct = Math.round((top.amount / b.totalExpense) * 100);
    if (second && topPct >= 40) {
      const ratio = top.amount / Math.max(second.amount, 1);
      return `${cap(top.label)} dominates at ${topPct}% — ${ratio.toFixed(1)}× more than ${cap(second.label)}.`;
    }
    if (topMerchant && topMerchant.count >= 3) {
      const merchPct = Math.round((topMerchant.amount / b.totalExpense) * 100);
      return `${cap(top.label)} is ${topPct}% of spend; ${topMerchant.name} alone is ${merchPct}% across ${topMerchant.count} visits.`;
    }
    return `${cap(top.label)} is your biggest category at ${topPct}% of spend (${fmtPeso(top.amount)}).`;
  }
  if (topMerchant) {
    return `Top merchant: ${topMerchant.name} at ${fmtPeso(topMerchant.amount)} across ${topMerchant.count} txns.`;
  }
  return '';
}

function buildWhenChip(b: StatsBundle): string {
  const peakDowIdx = b.dowAvg.reduce(
    (best, v, i) => (v > b.dowAvg[best] ? i : best),
    0
  );
  const peakDowValue = b.dowAvg[peakDowIdx];
  if (!peakDowValue) {
    return 'Need a few days of activity before patterns show up.';
  }
  const days = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  const todLabels = ['mornings', 'afternoons', 'evenings', 'nights'];

  // Combine day-of-week and time-of-day signals for a richer headline.
  const peakTodIdx = b.todTotals.reduce(
    (best, v, i) => (v > b.todTotals[best] ? i : best),
    0
  );
  const peakTodValue = b.todTotals[peakTodIdx];
  const todTotal = b.todTotals.reduce((s, v) => s + v, 0);

  if (peakTodValue > 0 && todTotal > 0) {
    const todShare = Math.round((peakTodValue / todTotal) * 100);
    return `${days[peakDowIdx]} & ${todLabels[peakTodIdx]} dominate — ${todShare}% of spend lands in your ${todLabels[peakTodIdx].slice(0, -1)} window.`;
  }

  const weekdayAvg =
    b.dowAvg.slice(0, 5).reduce((s, v) => s + v, 0) / 5 || 1;
  const ratio = peakDowValue / weekdayAvg;
  if (peakDowIdx >= 5) {
    return `${days[peakDowIdx]} are your peak — ${ratio.toFixed(1)}× weekday average.`;
  }
  return `${days[peakDowIdx]} top your spending at ${fmtPeso(peakDowValue)} on average.`;
}

function cap(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(colors: any, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topInset,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 28,
      color: colors.textPrimary,
      letterSpacing: -0.6,
    },
    notifBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 80,
    },
    monthPillRow: {
      paddingTop: 8,
      paddingBottom: 6,
      flexDirection: 'row',
    },
    monthPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    monthArrow: {
      width: 26,
      height: 26,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthLabelBtn: {
      paddingHorizontal: 4,
    },
    monthLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    cardTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 1.2,
    },
    dowCard: {
      borderRadius: 20,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 12,
    },
    dowHead: { marginBottom: 12 },
  });
}

export default React.memo(InsightsScreen);
