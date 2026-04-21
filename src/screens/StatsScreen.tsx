import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useTransition,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  PanResponder,
  Vibration,
  Modal,
  TouchableWithoutFeedback,
  InteractionManager,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Dynamic Theme Hook
import { useAuth } from '../contexts/AuthContext';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import type CategoryModel from '@/db/models/Category';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  INCOME_CATEGORIES,
  CATEGORY_COLOR,
} from '@/constants/categoryMappings';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ACCOUNT_LOGOS } from '@/constants/accountLogos';
import { useAccounts } from '@/hooks/useAccounts';
import { generateBulletInsights } from '@/services/gemini';
import { useDeferredRender } from '@/hooks/useDeferredRender';
import { WaveFill } from '@/components/home/WaveFill';
import DailySpendChart from '@/components/stats/DailySpendChart';
import DowPatternChart from '@/components/stats/DowPatternChart';

// ─── Types ───────────────────────────────────────────────────────────────────

type DbCategoryMeta = {
  label: string;
  emoji: string | null;
  textColor: string | null;
  tileBg: string | null;
};

type TopTx = {
  display_name: string | null;
  merchant_name: string | null;
  amount: number;
  category: string | null;
  date: string;
  account_id: string;
};

// ─── Theme maps ──────────────────────────────────────────────────────────────

const CATEGORY_THEME: Record<
  string,
  {
    nameColor: string;
    barColor: string;
    iconGrad: readonly [string, string];
    badgeBg: string;
  }
> = {
  food: {
    nameColor: '#B27B16',
    barColor: '#F2A649',
    iconGrad: ['#FFF3E0', '#ffe4b5'],
    badgeBg: '#FFF3E0',
  },
  transport: {
    nameColor: '#1A5C9B',
    barColor: '#4CA1EF',
    iconGrad: ['#E8F4FD', '#c8e4f8'],
    badgeBg: '#EEF6FF',
  },
  shopping: {
    nameColor: '#9B1A5C',
    barColor: '#F27A9B',
    iconGrad: ['#FDE8F0', '#fbc8dc'],
    badgeBg: '#FFF0F3',
  },
  bills: {
    nameColor: '#5C1A9B',
    barColor: '#9B61E8',
    iconGrad: ['#EDE8FD', '#d8d0fa'],
    badgeBg: '#F3EFFF',
  },
  health: {
    nameColor: '#2d6a4f',
    barColor: '#5B8C6E',
    iconGrad: ['#EFF8F2', '#d4eddf'],
    badgeBg: '#EFF8F2',
  },
  other: {
    nameColor: '#8A8A9A',
    barColor: '#B4B2A9',
    iconGrad: ['#F7F5F2', '#efece8'],
    badgeBg: '#F7F5F2',
  },
};

const INCOME_THEME: Record<
  string,
  {
    nameColor: string;
    barColor: string;
    iconGrad: readonly [string, string];
    badgeBg: string;
  }
> = {
  salary: {
    nameColor: '#2d6a4f',
    barColor: '#5B8C6E',
    iconGrad: ['#EFF8F2', '#d4eddf'],
    badgeBg: '#EFF8F2',
  },
  allowance: {
    nameColor: '#3A80C0',
    barColor: '#4CA1EF',
    iconGrad: ['#E8F4FD', '#c8e4f8'],
    badgeBg: '#EEF6FF',
  },
  freelance: {
    nameColor: '#7A4AB8',
    barColor: '#9B61E8',
    iconGrad: ['#EDE8FD', '#d8d0fa'],
    badgeBg: '#F3EFFF',
  },
  business: {
    nameColor: '#C97A20',
    barColor: '#F2A649',
    iconGrad: ['#FFF3E0', '#ffe4b5'],
    badgeBg: '#FDF6E3',
  },
  gifts: {
    nameColor: '#C0503A',
    barColor: '#F27A9B',
    iconGrad: ['#FDE8F0', '#fbc8dc'],
    badgeBg: '#FFF0F3',
  },
  investment: {
    nameColor: '#1a7a6e',
    barColor: '#2a9d8f',
    iconGrad: ['#E8F6F5', '#d0eeec'],
    badgeBg: '#E8F6F5',
  },
  default: {
    nameColor: '#8A8A9A',
    barColor: '#B4B2A9',
    iconGrad: ['#F7F5F2', '#efece8'],
    badgeBg: '#F7F5F2',
  },
};

const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
  food: 1500,
  transport: 1000,
  shopping: 2000,
  bills: 1500,
  health: 1000,
  default: 1000,
};

const INCOME_KEYS = new Set(INCOME_CATEGORIES.map((c) => c.key));

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_SHORT = MONTH_NAMES.map((month) => month.slice(0, 3));

const normalizeCategoryKey = (value: string | null): string =>
  (value ?? '').trim().toLowerCase();

const fmt = (value: number): string =>
  Math.max(Math.round(value), 0).toLocaleString('en-PH');

const fmtUiNumber = (value: number): string => {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 1_000_000) {
    const m = rounded / 1_000_000;
    return `${parseFloat(m.toFixed(1))}M`;
  }
  if (abs >= 100_000) {
    const k = rounded / 1_000;
    return `${parseFloat(k.toFixed(1))}k`;
  }
  return rounded.toLocaleString('en-PH');
};

const fmtUiPeso = (value: number): string => `₱${fmtUiNumber(value)}`;

function buildSpendInsight(
  totalSpent: number,
  totalBudget: number,
  monthLabel: string
): string {
  if (!totalBudget)
    return 'Set category budgets to track spending against limits.';
  const pct = Math.round((totalSpent / totalBudget) * 100);
  if (pct >= 100) {
    return `You've used 100% of your budget ${monthLabel.toLowerCase()}. Consider reviewing your spending.`;
  }
  if (pct >= 80) {
    return `You're at ${pct}% of your budget. ₱${fmt(totalBudget - totalSpent)} remaining.`;
  }
  return `You've used ${pct}% of your ${monthLabel.toLowerCase()} budget - on track!`;
}

function buildDailyInsight(
  dailySpend: Record<string, number>,
  monthLabel: string
): string {
  const vals = Object.values(dailySpend);
  if (!vals.length) return 'No spending data yet for this period.';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const peak = Math.max(...vals);
  return `Your average daily spend is ₱${fmt(avg)}. Peak day was ₱${fmt(peak)} ${monthLabel.toLowerCase()}.`;
}

function buildPatternsInsight(dowAvgSpend: number[]): string {
  if (!dowAvgSpend.length) return 'Not enough data to show weekly patterns.';
  const peakValue = Math.max(...dowAvgSpend);
  if (peakValue <= 0) return 'Not enough data to show weekly patterns.';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const peak = dowAvgSpend.indexOf(peakValue);
  return `You tend to spend most on ${days[peak]}s. Consider planning ahead for that day.`;
}

function buildTopExpenseInsight(
  topTransactions: TopTx[],
  monthLabel: string
): string {
  const top = topTransactions[0];
  if (!top) return 'No top expense yet for this period.';
  const name =
    top.display_name ?? top.merchant_name ?? top.category ?? 'This transaction';
  return `${name} is your largest expense at ₱${fmt(top.amount)} ${monthLabel.toLowerCase()}.`;
}

function buildMomInsight(momDelta: number, txDelta: number): string {
  if (momDelta > 0) {
    return `You spent ₱${fmt(Math.abs(momDelta))} more than last month with ${Math.abs(txDelta)} ${txDelta === 1 ? 'extra transaction' : 'extra transactions'}.`;
  }
  if (momDelta < 0) {
    return `You spent ₱${fmt(Math.abs(momDelta))} less than last month. Nice control on this trend.`;
  }
  return 'Your total spending is flat vs last month. Keep tracking for a stable trend.';
}

const withAlpha = (hex: string, alpha: number): string => {
  if (!hex.startsWith('#')) return hex;
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const value = normalized.replace('#', '');
  const bigint = Number.parseInt(value, 16);
  if (Number.isNaN(bigint)) return hex;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};

// ─── Tile height for category wave fills ─────────────────────────────────────
const TILE_H = 122;

// ─── Month picker modal ───────────────────────────────────────────────────────

function MonthPickerModal({
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
  const pickerStyles = useMemo(
    () => createPickerStyles(colors, isDark),
    [colors, isDark]
  );

  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);

  useEffect(() => {
    if (visible) {
      setDraftYear(year);
      setDraftMonth(month);
    }
  }, [visible, year, month]);

  const prevMonth = () => {
    if (draftMonth === 0) {
      setDraftMonth(11);
      setDraftYear((y) => y - 1);
    } else setDraftMonth((m) => m - 1);
  };
  const nextMonth = () => {
    const now = new Date();
    if (
      draftYear > now.getFullYear() ||
      (draftYear === now.getFullYear() && draftMonth >= now.getMonth())
    )
      return;
    if (draftMonth === 11) {
      setDraftMonth(0);
      setDraftYear((y) => y + 1);
    } else setDraftMonth((m) => m + 1);
  };

  const now = new Date();
  const isAtMax =
    draftYear > now.getFullYear() ||
    (draftYear === now.getFullYear() && draftMonth >= now.getMonth());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <Pressable style={pickerStyles.card} onPress={() => {}}>
          <Text style={pickerStyles.title}>Select Month</Text>
          <View style={pickerStyles.row}>
            <TouchableOpacity
              style={pickerStyles.arrow}
              onPress={prevMonth}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
            <Text style={pickerStyles.monthLabel}>
              {MONTH_NAMES[draftMonth]} {draftYear}
            </Text>
            <TouchableOpacity
              style={[pickerStyles.arrow, isAtMax && { opacity: 0.3 }]}
              onPress={nextMonth}
              disabled={isAtMax}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.actions}>
            <TouchableOpacity
              style={pickerStyles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={pickerStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pickerStyles.confirmBtn}
              onPress={() => onConfirm(draftYear, draftMonth)}
              activeOpacity={0.8}
            >
              <Text style={pickerStyles.confirmText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── DailySpendChart and DowPatternChart are imported from their own files ───
// They use Reanimated (UI-thread animations) instead of Animated with useNativeDriver: false.

const PEAK_AMBER = '#E07B2E'; // kept for AccountActivityCard colour reference

// ─── AccountActivityCard ─────────────────────────────────────────────────────

function AccountActivityCard({
  account,
  expense,
  income,
  colors,
  styles,
}: {
  account: any;
  expense: number;
  income: number;
  colors: any;
  styles: any;
}) {
  const net = income - expense;
  const logo = ACCOUNT_LOGOS[account.name as string];

  return (
    <View style={styles.acctCardWrap}>
      {logo ? (
        <Image
          source={logo}
          style={styles.acctLogo}
          contentFit="contain"
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.acctAvatar,
            { backgroundColor: account.brand_colour ?? colors.primary },
          ]}
        >
          <Text style={styles.acctAvatarText}>
            {account.letter_avatar ?? account.name?.charAt(0) ?? '?'}
          </Text>
        </View>
      )}
      <Text style={styles.acctName} numberOfLines={1}>
        {account.name}
      </Text>
      <View style={styles.acctAmtRow}>
        <Text style={styles.acctAmtLabel}>EXP</Text>
        <Text style={styles.acctExpAmt} numberOfLines={1}>
          -₱{expense.toLocaleString()}
        </Text>
      </View>
      <View style={styles.acctAmtRow}>
        <Text style={styles.acctAmtLabel}>INC</Text>
        <Text style={styles.acctIncAmt} numberOfLines={1}>
          +₱{income.toLocaleString()}
        </Text>
      </View>
      <View
        style={[
          styles.acctNetPill,
          {
            backgroundColor:
              net >= 0
                ? withAlpha(colors.incomeGreen, 0.12)
                : withAlpha(colors.expenseRed, 0.1),
          },
        ]}
      >
        <Text
          style={[
            styles.acctNetText,
            { color: net >= 0 ? colors.incomeGreen : colors.expenseRed },
          ]}
        >
          {net >= 0 ? '+' : ''}₱{net.toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, isDark, insets.top),
    [colors, isDark, insets.top]
  );
  const [, startTransition] = useTransition();

  const isInitialLoadRef = useRef(true);
  const hasAnimated = useRef(false);
  const hasMountedRef = useRef(false);
  const lastFetchedAt = useRef(0);
  const lastFetchedKey = useRef('');
  const STATS_STALE_MS = 30_000;

  // ── Date state ──
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // ── View type ──
  const [viewType, setViewType] = useState<'expense' | 'income'>('expense');

  // ── Tab navigation ──
  const [activeTab, setActiveTab] = useState<
    'spend' | 'patterns' | 'categories'
  >('spend');

  // ── UI state ──
  const [activeDonutIndex, setActiveDonutIndex] = useState<number>(-1);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [insightTarget, setInsightTarget] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const isCurrentMonth =
    selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
  const monthLabel = isCurrentMonth
    ? 'This month'
    : `${MONTHS_SHORT[selectedMonth]} ${selectedYear}`;
  const monthNavLabel = `${MONTHS_SHORT[selectedMonth]} ${selectedYear}`;

  const headerOpacity = useSharedValue(0);
  const headerTransY = useSharedValue(-8);
  const heroOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.97);
  const contentOpacity = useSharedValue(0);
  const contentTransY = useSharedValue(16);

  const headerAnim = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTransY.value }],
  }));
  const heroAnim = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ scale: heroScale.value }],
  }));
  const contentAnim = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  // ── Expense data ──
  const [expenseCategoryKeys, setExpenseCategoryKeys] = useState<string[]>([]);
  const [expenseCategoryMeta, setExpenseCategoryMeta] = useState<
    Record<string, DbCategoryMeta>
  >({});
  const [expenseTotals, setExpenseTotals] = useState<Record<string, number>>(
    {}
  );
  const [expenseBudgets, setExpenseBudgets] = useState<Record<string, number>>(
    {}
  );

  // ── Income data ──
  const [incomeTotals, setIncomeTotals] = useState<Record<string, number>>({});

  // ── Enhanced insight data ──
  const [dailySpend, setDailySpend] = useState<Record<string, number>>({});
  const [dowAvgSpend, setDowAvgSpend] = useState<number[]>([
    0, 0, 0, 0, 0, 0, 0,
  ]);
  const [topTransactions, setTopTransactions] = useState<TopTx[]>([]);
  const [accountActivity, setAccountActivity] = useState<{
    expense: Record<string, number>;
    income: Record<string, number>;
  }>({ expense: {}, income: {} });
  const [prevMonthExpenseTotals, setPrevMonthExpenseTotals] = useState<
    Record<string, number>
  >({});
  const [prevMonthTxCount, setPrevMonthTxCount] = useState(0);
  const [totalTxCount, setTotalTxCount] = useState(0);
  const [aiInsights, setAiInsights] = useState<string[] | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const lastAiMonthRef = useRef<string>('');

  const {
    accounts,
    error: accountsError,
    refetch: refetchAccounts,
  } = useAccounts();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isChartReady = useDeferredRender();

  const monthRange = useMemo(() => {
    const from = new Date(selectedYear, selectedMonth, 1).toISOString();
    const to = new Date(
      selectedYear,
      selectedMonth + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();
    return { from, to };
  }, [selectedYear, selectedMonth]);

  const applyStatsBundle = useCallback((bundle: Record<string, unknown>) => {
    startTransition(() => {
      if (bundle.expenseCategoryKeys)
        setExpenseCategoryKeys(bundle.expenseCategoryKeys as string[]);
      if (bundle.expenseCategoryMeta)
        setExpenseCategoryMeta(
          bundle.expenseCategoryMeta as Record<string, DbCategoryMeta>
        );
      if (bundle.expenseTotals)
        setExpenseTotals(bundle.expenseTotals as Record<string, number>);
      if (bundle.expenseBudgets)
        setExpenseBudgets(bundle.expenseBudgets as Record<string, number>);
      if (bundle.incomeTotals)
        setIncomeTotals(bundle.incomeTotals as Record<string, number>);
      if (bundle.dailySpend)
        setDailySpend(bundle.dailySpend as Record<string, number>);
      if (bundle.dowAvgSpend) setDowAvgSpend(bundle.dowAvgSpend as number[]);
      if (bundle.topTransactions)
        setTopTransactions(bundle.topTransactions as TopTx[]);
      if (bundle.accountActivity)
        setAccountActivity(
          bundle.accountActivity as {
            expense: Record<string, number>;
            income: Record<string, number>;
          }
        );
      if (bundle.prevMonthExpenseTotals)
        setPrevMonthExpenseTotals(
          bundle.prevMonthExpenseTotals as Record<string, number>
        );
      if (typeof bundle.totalTxCount === 'number')
        setTotalTxCount(bundle.totalTxCount);
      if (typeof bundle.prevMonthTxCount === 'number')
        setPrevMonthTxCount(bundle.prevMonthTxCount);
    });
  }, []);

  const fetchStats = useCallback(
    async (force = false) => {
      if (!userId) {
        setLoading(false);
        return;
      }

      const cacheKey = `FINO_STATS_CACHE_${selectedYear}_${selectedMonth}`;

      // Skip entirely if we just fetched the same month within the stale window.
      if (
        !force &&
        lastFetchedKey.current === cacheKey &&
        Date.now() - lastFetchedAt.current < STATS_STALE_MS
      ) {
        return;
      }

      // 1. Serve stale cache immediately — no spinner for returning users.
      // Only reapply if we haven't just rendered from it (avoids setState storm on fast tab-switch).
      if (lastFetchedKey.current !== cacheKey) {
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            applyStatsBundle(JSON.parse(cached));
            setLoading(false);
          }
        } catch (err) {
          if (__DEV__)
            console.warn('[StatsScreen] stats cache read failed:', err);
        }
      }

      try {
        if (isInitialLoadRef.current) {
          setLoading(true);
          isInitialLoadRef.current = false;
        }
        // Subsequent focuses: keep loading false so skeletons don't flash

        // Compute prev month range for delta badges (date-only, matches tx.date format)
        const prevMonthNum = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYearNum =
          selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const prevFrom = new Date(prevYearNum, prevMonthNum, 1)
          .toISOString()
          .split('T')[0];
        const prevTo = new Date(prevYearNum, prevMonthNum + 1, 0)
          .toISOString()
          .split('T')[0];

        const catCol = database.get<CategoryModel>('categories');
        const txCol = database.get<TransactionModel>('transactions');

        const [
          catRecords,
          monthTxRecords,
          prevMonthTxRecords,
          topExpenseRecords,
        ] = await Promise.all([
          catCol
            .query(Q.where('user_id', userId), Q.where('is_active', true))
            .fetch(),
          txCol
            .query(
              Q.where('user_id', userId),
              Q.where('date', Q.gte(monthRange.from)),
              Q.where('date', Q.lte(monthRange.to)),
            )
            .fetch(),
          txCol
            .query(
              Q.where('user_id', userId),
              Q.where('type', 'expense'),
              Q.where('date', Q.gte(prevFrom)),
              Q.where('date', Q.lte(prevTo)),
            )
            .fetch(),
          txCol
            .query(
              Q.where('user_id', userId),
              Q.where('type', 'expense'),
              Q.where('date', Q.gte(monthRange.from)),
              Q.where('date', Q.lte(monthRange.to)),
              Q.sortBy('amount', Q.desc),
            )
            .fetch(),
        ]);

        const catData = catRecords.map((c) => ({
          name: c.name,
          budget_limit: c.budgetLimit ?? null,
          emoji: c.emoji ?? null,
          text_colour: c.textColour ?? null,
          tile_bg_colour: c.tileBgColour ?? null,
          sort_order: c.sortOrder,
        }));
        const txData = monthTxRecords
          // Transfers are balance moves between accounts, not expense spend.
          .filter((t) => t.type === 'expense' && (t.category ?? '').toLowerCase() !== 'transfer')
          .map((t) => ({ category: t.category ?? null, amount: t.amount, type: t.type }));
        const incomeTxData = monthTxRecords
          .filter((t) => t.type === 'income')
          .map((t) => ({ category: t.category ?? null, amount: t.amount }));
        const dailyTxData = monthTxRecords
          .filter((t) => t.type === 'expense' && (t.category ?? '').toLowerCase() !== 'transfer')
          .map((t) => ({ date: t.date, amount: t.amount }));
        const topTxData = topExpenseRecords
          .filter((t) => (t.category ?? '').toLowerCase() !== 'transfer')
          .slice(0, 5)
          .map((t) => ({
            display_name: t.displayName ?? null,
            merchant_name: t.merchantName ?? null,
            amount: t.amount,
            category: t.category ?? null,
            date: t.date,
            account_id: t.accountId,
          }));
        const acctTxData = monthTxRecords.map((t) => ({
          account_id: t.accountId,
          amount: t.amount,
          type: t.type,
        }));
        const prevTxData = prevMonthTxRecords
          .filter((t) => (t.category ?? '').toLowerCase() !== 'transfer')
          .map((t) => ({
            category: t.category ?? null,
            amount: t.amount,
          }));

        const nextTotals: Record<string, number> = {};
        const nextBudgets: Record<string, number> = {};
        const nextKeys: string[] = [];
        const nextMeta: Record<string, DbCategoryMeta> = {};

        (catData ?? []).forEach((cat) => {
          const key = normalizeCategoryKey(cat.name);
          const emojiKey = normalizeCategoryKey(cat.emoji);
          if (!key || INCOME_KEYS.has(emojiKey)) return;
          nextKeys.push(key);
          nextTotals[key] = 0;
          nextBudgets[key] =
            cat.budget_limit && cat.budget_limit > 0
              ? cat.budget_limit
              : (DEFAULT_CATEGORY_BUDGETS[key] ??
                DEFAULT_CATEGORY_BUDGETS.default);
          nextMeta[key] = {
            label: cat.name,
            emoji: cat.emoji,
            textColor: cat.text_colour,
            tileBg: cat.tile_bg_colour,
          };
        });

        (txData ?? []).forEach((tx) => {
          const key = normalizeCategoryKey(tx.category);
          if (!key || !(key in nextTotals)) return;
          nextTotals[key] += Number(tx.amount) || 0;
        });

        const nextIncomeTotals: Record<string, number> = {};
        INCOME_CATEGORIES.forEach((c) => {
          nextIncomeTotals[c.key] = 0;
        });
        (incomeTxData ?? []).forEach((tx) => {
          const nameKey = normalizeCategoryKey(tx.category);
          const incDef = INCOME_CATEGORIES.find(
            (c) => c.name.toLowerCase() === nameKey || c.key === nameKey
          );
          if (incDef) nextIncomeTotals[incDef.key] += Number(tx.amount) || 0;
        });

        // ── Daily spend + day-of-week aggregation ──
        const dailyMap: Record<string, number> = {};
        const dowTotals = [0, 0, 0, 0, 0, 0, 0];
        const dowCounts = [0, 0, 0, 0, 0, 0, 0];
        (dailyTxData ?? []).forEach((tx) => {
          const day = tx.date.slice(0, 10);
          dailyMap[day] = (dailyMap[day] ?? 0) + Number(tx.amount);
          const d = new Date(tx.date);
          const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
          dowTotals[dow] += Number(tx.amount);
          dowCounts[dow]++;
        });
        const dowAvg = dowTotals.map((total, i) =>
          dowCounts[i] > 0 ? total / dowCounts[i] : 0
        );

        // ── Account-level activity ──
        const acctExpense: Record<string, number> = {};
        const acctIncome: Record<string, number> = {};
        (acctTxData ?? []).forEach((tx) => {
          const id = tx.account_id as string;
          if (tx.type === 'expense') {
            acctExpense[id] = (acctExpense[id] ?? 0) + Number(tx.amount);
          } else {
            acctIncome[id] = (acctIncome[id] ?? 0) + Number(tx.amount);
          }
        });

        // ── Previous month totals for delta badges ──
        const prevTotals: Record<string, number> = {};
        (prevTxData ?? []).forEach((tx) => {
          const key = normalizeCategoryKey(tx.category);
          prevTotals[key] = (prevTotals[key] ?? 0) + Number(tx.amount);
        });

        // Batch all fresh state through applyStatsBundle so every setState is
        // wrapped in startTransition — async post-await setStates would otherwise
        // run urgently and block the JS thread during tab-switch.
        applyStatsBundle({
          expenseCategoryKeys: nextKeys,
          expenseCategoryMeta: nextMeta,
          expenseTotals: nextTotals,
          expenseBudgets: nextBudgets,
          incomeTotals: nextIncomeTotals,
          dailySpend: dailyMap,
          dowAvgSpend: dowAvg,
          topTransactions: (topTxData ?? []) as TopTx[],
          accountActivity: { expense: acctExpense, income: acctIncome },
          prevMonthExpenseTotals: prevTotals,
          totalTxCount: dailyTxData?.length ?? 0,
          prevMonthTxCount: prevTxData?.length ?? 0,
        });

        // 3. Persist the computed bundle to cache for next open
        const bundle = {
          expenseCategoryKeys: nextKeys,
          expenseCategoryMeta: nextMeta,
          expenseTotals: nextTotals,
          expenseBudgets: nextBudgets,
          incomeTotals: nextIncomeTotals,
          dailySpend: dailyMap,
          dowAvgSpend: dowAvg,
          topTransactions: topTxData ?? [],
          accountActivity: { expense: acctExpense, income: acctIncome },
          prevMonthExpenseTotals: prevTotals,
          totalTxCount: dailyTxData?.length ?? 0,
          prevMonthTxCount: prevTxData?.length ?? 0,
        };
        AsyncStorage.setItem(cacheKey, JSON.stringify(bundle)).catch((err) => {
          if (__DEV__)
            console.warn('[StatsScreen] stats cache write failed:', err);
        });
        lastFetchedAt.current = Date.now();
        lastFetchedKey.current = cacheKey;
      } finally {
        setLoading(false);
      }
    },
    [applyStatsBundle, monthRange, selectedMonth, selectedYear, userId]
  );

  // Re-fetch when month/year changes while screen is already mounted;
  // useFocusEffect handles the initial fetch on first focus.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    // Month changed — force past the freshness gate since it's a different dataset.
    fetchStats(true);
  }, [selectedYear, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        // Full entrance on first mount
        hasAnimated.current = true;
        headerOpacity.value = 0;
        headerTransY.value = -8;
        heroOpacity.value = 0;
        heroScale.value = 0.97;
        contentOpacity.value = 0;
        contentTransY.value = 16;

        headerOpacity.value = withTiming(1, { duration: 260 });
        headerTransY.value = withTiming(0, { duration: 260 });
        heroOpacity.value = withDelay(60, withTiming(1, { duration: 320 }));
        heroScale.value = withDelay(
          60,
          withSpring(1, { damping: 18, stiffness: 160 })
        );
        contentOpacity.value = withDelay(140, withTiming(1, { duration: 320 }));
        contentTransY.value = withDelay(
          140,
          withSpring(0, { damping: 18, stiffness: 180 })
        );
      } else {
        // Lightweight re-entry: subtle fade+lift, ~180ms. Keeps the screen feeling alive
        // on tab switch without the flash of a full entrance.
        heroOpacity.value = 0.6;
        heroScale.value = 0.99;
        contentOpacity.value = 0.55;
        contentTransY.value = 6;

        heroOpacity.value = withTiming(1, { duration: 180 });
        heroScale.value = withTiming(1, { duration: 180 });
        contentOpacity.value = withTiming(1, { duration: 200 });
        contentTransY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }

      const task = InteractionManager.runAfterInteractions(() => {
        startTransition(() => {
          fetchStats();
        });
      });
      return () => task.cancel();
    }, [
      startTransition,
      fetchStats,
      headerOpacity,
      headerTransY,
      heroOpacity,
      heroScale,
      contentOpacity,
      contentTransY,
    ])
  );

  const handleViewTypeSwitch = (type: 'expense' | 'income') => {
    setViewType(type);
    setActiveDonutIndex(-1);
    if (type === 'expense') {
      setActiveTab('spend');
    }
  };

  const totalExpenseSpent = Object.values(expenseTotals).reduce(
    (s, v) => s + v,
    0
  );
  const totalBudget = Object.values(expenseBudgets).reduce((s, v) => s + v, 0);
  const budgetUsedPct =
    totalBudget > 0 ? (totalExpenseSpent / totalBudget) * 100 : 0;
  const isOverBudget = totalBudget > 0 && totalExpenseSpent > totalBudget;
  const remaining = Math.max(totalBudget - totalExpenseSpent, 0);
  const overage = Math.max(totalExpenseSpent - totalBudget, 0);
  const totalIncome = Object.values(incomeTotals).reduce((s, v) => s + v, 0);
  const incomeActiveKeys = INCOME_CATEGORIES.filter(
    (c) => (incomeTotals[c.key] ?? 0) > 0
  );

  // ─── SVG Donut segments ───────────────────────────────────────────────────
  const donutRadius = 62;
  const donutStrokeWidth = 20;
  const donutGap = 5; // SVG units of spacing between each segment
  const donutCircumference = 2 * Math.PI * donutRadius;

  const donutSegments = useMemo(() => {
    let cumulativeOffset = 0;
    if (viewType === 'expense') {
      // When over budget: scale to actual spending so segments always fit the ring.
      // When under budget: scale to total budget so empty space = remaining budget.
      const denom = isOverBudget
        ? totalExpenseSpent
        : totalBudget > 0
          ? totalBudget
          : totalExpenseSpent > 0
            ? totalExpenseSpent
            : 1;

      return expenseCategoryKeys
        .filter((k) => expenseTotals[k] > 0)
        .map((cat, index) => {
          const catSpent = expenseTotals[cat]; // no cap — actual spending
          const catBudget = expenseBudgets[cat] ?? 0;
          const isCatOver = catBudget > 0 && catSpent > catBudget;
          const strokeLength = Math.max(
            0,
            (catSpent / denom) * donutCircumference - donutGap
          );
          const gapLength = donutCircumference - strokeLength;
          const meta = expenseCategoryMeta[cat];
          const fallbackColor =
            Object.values(CATEGORY_THEME)[
              index % Object.values(CATEGORY_THEME).length
            ].barColor;
          // Over-budget categories turn red
          const baseColor = meta?.textColor ?? fallbackColor;
          const color = isCatOver ? '#EF4444' : baseColor;
          const segment = {
            key: cat,
            color,
            isCatOver,
            strokeDasharray: `${strokeLength} ${gapLength}`,
            strokeDashoffset: -cumulativeOffset,
            catSpent,
          };
          cumulativeOffset += strokeLength;
          return segment;
        });
    }
    const denom = totalIncome > 0 ? totalIncome : 1;
    return incomeActiveKeys.map((incCat) => {
      const amount = incomeTotals[incCat.key] ?? 0;
      const strokeLength = Math.max(
        0,
        (amount / denom) * donutCircumference - donutGap
      );
      const gapLength = donutCircumference - strokeLength;
      const color = CATEGORY_COLOR[incCat.key] ?? colors.textSecondary;
      const segment = {
        key: incCat.key,
        color,
        strokeDasharray: `${strokeLength} ${gapLength}`,
        strokeDashoffset: -cumulativeOffset,
        catSpent: amount,
      };
      cumulativeOffset += strokeLength;
      return segment;
    });
  }, [
    viewType,
    expenseCategoryKeys,
    expenseTotals,
    expenseCategoryMeta,
    expenseBudgets,
    totalBudget,
    totalExpenseSpent,
    isOverBudget,
    totalIncome,
    incomeActiveKeys,
    incomeTotals,
    donutCircumference,
    colors.textSecondary,
  ]);

  const selectedDonut =
    activeDonutIndex >= 0 ? donutSegments[activeDonutIndex] : null;
  const selectedCategory = selectedDonut?.key ?? null;

  // ─── PAN RESPONDER ────────────────────────────────────────────────────────
  const activeDonutIndexRef = useRef(activeDonutIndex);
  const startIndexRef = useRef(activeDonutIndex);
  const segmentsLengthRef = useRef(donutSegments.length);
  const isInteractingWithDonutRef = useRef(false);

  useEffect(() => {
    activeDonutIndexRef.current = activeDonutIndex;
  }, [activeDonutIndex]);
  useEffect(() => {
    segmentsLengthRef.current = donutSegments.length;
  }, [donutSegments.length]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isInteractingWithDonutRef.current = true;
        setScrollEnabled(false);
        startIndexRef.current = activeDonutIndexRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dy) > 5) {
          const sensitivity = 25;
          const delta = Math.floor(
            (gestureState.dy - (gestureState.dy > 0 ? 5 : -5)) / sensitivity
          );
          const totalOptions = segmentsLengthRef.current + 1;
          const raw = startIndexRef.current + 1 + delta;
          const wrapped = ((raw % totalOptions) + totalOptions) % totalOptions;
          const nextIndex = wrapped - 1;
          if (activeDonutIndexRef.current !== nextIndex) {
            activeDonutIndexRef.current = nextIndex;
            setActiveDonutIndex(nextIndex);
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut
            );
            Vibration.vibrate(40);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setScrollEnabled(true);
        setTimeout(() => {
          isInteractingWithDonutRef.current = false;
        }, 120);
        if (Math.abs(gestureState.dy) <= 5 && Math.abs(gestureState.dx) <= 5) {
          const totalOptions = segmentsLengthRef.current + 1;
          const nextIndex =
            ((activeDonutIndexRef.current + 2) % totalOptions) - 1;
          setActiveDonutIndex(nextIndex);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          Vibration.vibrate(20);
        }
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        setTimeout(() => {
          isInteractingWithDonutRef.current = false;
        }, 120);
      },
    })
  ).current;

  // ─── Donut center text ────────────────────────────────────────────────────
  let centerPctText: string;
  let centerSubText: string;
  let centerTextColor = colors.white;

  if (viewType === 'expense') {
    if (selectedDonut && selectedCategory) {
      const catBudget = expenseBudgets[selectedCategory] || 1000;
      const catPct =
        catBudget > 0
          ? ((expenseTotals[selectedCategory] ?? 0) / catBudget) * 100
          : 0;
      const meta = expenseCategoryMeta[selectedCategory];
      centerPctText = `${catPct.toFixed(0)}%`;
      centerSubText = meta?.label ?? selectedCategory;
      centerTextColor = selectedDonut.color;
    } else if (isOverBudget) {
      centerPctText = `${budgetUsedPct.toFixed(0)}%`;
      centerSubText = 'over limit';
      centerTextColor = '#EF4444';
    } else {
      centerPctText = `${budgetUsedPct.toFixed(0)}%`;
      centerSubText = 'of budget';
    }
  } else if (selectedDonut && selectedCategory) {
    const incDef = INCOME_CATEGORIES.find((c) => c.key === selectedCategory);
    const amount = incomeTotals[selectedCategory] ?? 0;
    const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;
    centerPctText = `${pct.toFixed(0)}%`;
    centerSubText = incDef?.name ?? selectedCategory;
    centerTextColor = selectedDonut.color;
  } else {
    centerPctText =
      totalIncome > 0 ? `₱${(totalIncome / 1000).toFixed(1)}k` : '₱0';
    centerSubText = 'this month';
  }

  const selectedThemeColor = selectedDonut?.color ?? null;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const isAtMaxMonth =
    selectedYear > currentYear ||
    (selectedYear === currentYear && selectedMonth >= currentMonth);

  const handlePrevMonth = useCallback(() => {
    setActiveDonutIndex(-1);
    if (selectedMonth === 0) {
      setSelectedYear((year) => year - 1);
      setSelectedMonth(11);
      return;
    }
    setSelectedMonth((month) => month - 1);
  }, [selectedMonth]);

  const handleNextMonth = useCallback(() => {
    if (isAtMaxMonth) return;
    setActiveDonutIndex(-1);
    if (selectedMonth === 11) {
      setSelectedYear((year) => year + 1);
      setSelectedMonth(0);
      return;
    }
    setSelectedMonth((month) => month + 1);
  }, [isAtMaxMonth, selectedMonth]);

  const expenseTiles = useMemo(
    () =>
      expenseCategoryKeys
        .map((catKey, index) => {
          const meta = expenseCategoryMeta[catKey];
          const theme = CATEGORY_THEME[catKey] ?? CATEGORY_THEME.other;
          const amount = expenseTotals[catKey] ?? 0;
          const budget =
            expenseBudgets[catKey] ?? DEFAULT_CATEGORY_BUDGETS.default;
          const pct = budget > 0 ? (amount / budget) * 100 : 0;
          const color = meta?.textColor ?? theme.nameColor;
          const tileBg = meta?.tileBg ?? theme.badgeBg;

          return {
            key: catKey,
            index,
            title: meta?.label ?? catKey,
            amount,
            budget,
            pct,
            isOver: pct >= 100,
            color,
            tileBg,
            iconKey: catKey,
          };
        })
        .sort((a, b) => b.amount - a.amount),
    [expenseCategoryKeys, expenseCategoryMeta, expenseTotals, expenseBudgets]
  );

  const incomeTiles = useMemo(() => {
    const denom = totalIncome > 0 ? totalIncome : 1;
    return INCOME_CATEGORIES.map((incDef) => {
      const theme = INCOME_THEME[incDef.key] ?? INCOME_THEME.default;
      const amount = incomeTotals[incDef.key] ?? 0;
      return {
        key: incDef.key,
        title: incDef.name,
        amount,
        pct: (amount / denom) * 100,
        color: theme.nameColor,
        tileBg: theme.badgeBg,
      };
    })
      .filter((tile) => tile.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [incomeTotals, totalIncome]);

  const mostOverBudgetTile = useMemo(
    () =>
      expenseTiles
        .filter((tile) => tile.isOver)
        .sort((a, b) => b.pct - a.pct)[0] ?? null,
    [expenseTiles]
  );

  // ── New derived values ──
  const biggestExpense = useMemo(
    () => topTransactions[0] ?? null,
    [topTransactions]
  );

  const avgDailySpend = useMemo(() => {
    const vals = Object.values(dailySpend);
    if (vals.length === 0) return 0;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [dailySpend]);

  const dailyBarsData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { day, amount: dailySpend[dateStr] ?? 0 };
    });
  }, [dailySpend, selectedYear, selectedMonth]);

  const maxDailyAmount = useMemo(
    () => Math.max(...dailyBarsData.map((d) => d.amount), 1),
    [dailyBarsData]
  );

  const peakDayData = useMemo(
    () =>
      dailyBarsData.reduce((best, d) => (d.amount > best.amount ? d : best), {
        day: 0,
        amount: 0,
      }),
    [dailyBarsData]
  );

  const prevMonthTotal = useMemo(
    () => Object.values(prevMonthExpenseTotals).reduce((s, v) => s + v, 0),
    [prevMonthExpenseTotals]
  );
  const momDelta = totalExpenseSpent - prevMonthTotal;
  const txDelta = totalTxCount - prevMonthTxCount;

  // ── AI Insights ──
  const generateInsights = useCallback(async () => {
    if (aiInsightsLoading) return;
    const monthKey = `${selectedYear}-${selectedMonth}`;
    if (lastAiMonthRef.current === monthKey && aiInsights !== null) return;
    try {
      setAiInsightsLoading(true);
      const categoryLines = expenseCategoryKeys
        .filter((k) => expenseTotals[k] > 0)
        .map(
          (k) =>
            `${expenseCategoryMeta[k]?.label ?? k}: ₱${expenseTotals[k].toLocaleString()} / ₱${expenseBudgets[k].toLocaleString()} budget`
        )
        .join('\n');
      const topTxLines = topTransactions
        .slice(0, 3)
        .map(
          (tx) =>
            `- ${tx.display_name ?? tx.merchant_name ?? tx.category ?? 'Transaction'}: ₱${tx.amount.toLocaleString()} on ${tx.date.slice(0, 10)}`
        )
        .join('\n');
      const prompt = `Month: ${MONTH_NAMES[selectedMonth]} ${selectedYear}
Total spent: ₱${totalExpenseSpent.toLocaleString()}
Total budget: ₱${totalBudget.toLocaleString()}
Total income: ₱${totalIncome.toLocaleString()}
Transaction count: ${totalTxCount}
Avg daily spend: ₱${avgDailySpend.toFixed(0)}

CATEGORY BREAKDOWN:
${categoryLines}

TOP EXPENSES:
${topTxLines}

Give exactly 3 concise, practical financial insights as a JSON array of strings.
Each insight is 1-2 sentences. Do not use bullet prefixes inside the strings.
Format strictly: ["insight 1", "insight 2", "insight 3"]`;
      const results = await generateBulletInsights(prompt);
      if (results.length > 0) {
        setAiInsights(results);
        lastAiMonthRef.current = monthKey;
      }
    } catch (err) {
      if (__DEV__)
        console.warn('[StatsScreen] AI insights generation failed:', err);
    } finally {
      setAiInsightsLoading(false);
    }
  }, [
    aiInsightsLoading,
    aiInsights,
    selectedYear,
    selectedMonth,
    expenseCategoryKeys,
    expenseTotals,
    expenseCategoryMeta,
    expenseBudgets,
    topTransactions,
    totalExpenseSpent,
    totalBudget,
    totalIncome,
    totalTxCount,
    avgDailySpend,
  ]);

  useEffect(() => {
    if (!loading && viewType === 'expense' && expenseCategoryKeys.length > 0) {
      generateInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, viewType, selectedYear, selectedMonth]);

  const selectedExpenseBudget =
    selectedCategory && viewType === 'expense'
      ? (expenseBudgets[selectedCategory] ?? 0)
      : null;
  const selectedExpenseSpent =
    selectedCategory && viewType === 'expense'
      ? (expenseTotals[selectedCategory] ?? 0)
      : null;

  const selectedIncomeDef = selectedCategory
    ? INCOME_CATEGORIES.find((cat) => cat.key === selectedCategory)
    : null;
  const selectedIncomeAmount =
    selectedIncomeDef && selectedCategory
      ? (incomeTotals[selectedCategory] ?? 0)
      : null;
  const selectedIncomePct =
    selectedIncomeAmount && totalIncome > 0
      ? (selectedIncomeAmount / totalIncome) * 100
      : 0;

  const heroMetricOneLabel =
    viewType === 'expense'
      ? selectedCategory
        ? `${expenseCategoryMeta[selectedCategory]?.label ?? selectedCategory} spent`
        : 'Spent'
      : selectedIncomeDef
        ? `${selectedIncomeDef.name} income`
        : 'Income';
  const heroMetricOneValue =
    viewType === 'expense'
      ? (selectedExpenseSpent ?? totalExpenseSpent)
      : (selectedIncomeAmount ?? totalIncome);

  const heroMetricTwoLabel =
    viewType === 'expense'
      ? selectedCategory
        ? 'Remaining'
        : 'Remaining'
      : selectedIncomeDef
        ? 'Share'
        : 'Sources';
  const heroMetricTwoValue =
    viewType === 'expense'
      ? Math.max((selectedExpenseBudget ?? totalBudget) - heroMetricOneValue, 0)
      : selectedIncomeDef
        ? selectedIncomePct
        : incomeActiveKeys.length;

  const showBudgetMetric = viewType === 'expense';

  const heroMetricOneDisplay = fmtUiPeso(heroMetricOneValue);
  const heroMetricTwoDisplay =
    viewType === 'expense'
      ? fmtUiPeso(heroMetricTwoValue)
      : selectedIncomeDef
        ? `${heroMetricTwoValue.toFixed(0)}%`
        : `${heroMetricTwoValue} active`;
  const budgetMetricDisplay = fmtUiPeso(selectedExpenseBudget ?? totalBudget);

  const insightHeadline = mostOverBudgetTile
    ? `${mostOverBudgetTile.title} is ${(mostOverBudgetTile.pct - 100).toFixed(0)}% over budget this month`
    : 'Your spending trend looks stable this month';
  const insightSub = mostOverBudgetTile
    ? 'Tap to get personalized savings tips from Fino.'
    : 'Ask Fino for custom insights and ways to improve your budget.';

  const overBudgetCats = expenseCategoryKeys.filter(
    (k) => expenseTotals[k] > (expenseBudgets[k] ?? Number.POSITIVE_INFINITY)
  );
  const nearingCats = expenseCategoryKeys.filter(
    (k) =>
      !overBudgetCats.includes(k) &&
      (expenseBudgets[k] ?? 0) > 0 &&
      expenseTotals[k] / (expenseBudgets[k] ?? 1) >= 0.8
  );

  let aiAlertText: string;
  let aiAlertSubText: string;
  let aiAlertColor: string;
  let aiAlertIcon: React.ComponentProps<typeof Ionicons>['name'];

  if (overBudgetCats.length > 0) {
    aiAlertText = `${overBudgetCats.length} categor${overBudgetCats.length > 1 ? 'ies are' : 'y is'} over budget`;
    aiAlertSubText = `${monthLabel}: Tap to review and adjust your spending.`;
    aiAlertColor = colors.expenseRed;
    aiAlertIcon = 'warning';
  } else if (nearingCats.length > 0) {
    aiAlertText = `${nearingCats.length} categor${nearingCats.length > 1 ? 'ies are' : 'y is'} nearing the limit`;
    aiAlertSubText = `${monthLabel}: Keep an eye on these to stay on track.`;
    aiAlertColor = colors.statWarnBar ?? '#BA7517';
    aiAlertIcon = 'checkmark-circle';
  } else {
    aiAlertText = "You're on budget this month";
    aiAlertSubText = `${monthLabel}: Great job! Keep up the good work.`;
    aiAlertColor = colors.primary;
    aiAlertIcon = 'trophy';
  }

  const topExpenseInsight = buildTopExpenseInsight(topTransactions, monthLabel);
  const momInsight = buildMomInsight(momDelta, txDelta);
  const biggestExpenseDisplay = biggestExpense
    ? fmtUiPeso(biggestExpense.amount)
    : '—';
  const avgDailySpendDisplay = fmtUiPeso(avgDailySpend);
  const trendTotalSpentDisplay = fmtUiPeso(totalExpenseSpent);
  const trendDeltaAmountDisplay = fmtUiPeso(Math.abs(momDelta));

  const renderExpenseTile = (catKey: string) => {
    const tile = expenseTiles.find((item) => item.key === catKey);
    if (!tile) return null;
    const wavePct = tile.isOver ? 100 : Math.max(10, Math.min(tile.pct, 100));
    const waveHeight = (122 * wavePct) / 100;
    const tileTextColor = tile.isOver ? colors.expenseRed : tile.color;
    const progressPct = Math.min(tile.pct, 100);
    const progressColor = tile.isOver ? colors.expenseRed : tile.color;
    const pctDisplay = tile.isOver
      ? `${tile.pct.toFixed(0)}% ⚠`
      : `${tile.pct.toFixed(0)}%`;
    const prevAmt = prevMonthExpenseTotals[tile.key] ?? 0;
    const delta = tile.amount - prevAmt;
    const deltaUp = delta >= 0;

    return (
      <TouchableOpacity
        key={tile.key}
        activeOpacity={0.85}
        style={styles.catTileWrap}
        onPress={() =>
          navigation.navigate('feed', {
            screen: 'FeedMain',
            params: { filterCategory: tile.title },
          })
        }
      >
        <View
          style={[
            styles.catTileExpense,
            { backgroundColor: isDark ? colors.surfaceSubdued : tile.tileBg },
          ]}
        >
          <WaveFill
            pct={waveHeight / TILE_H}
            color={tile.color}
            tileHeight={TILE_H}
          />

          <View style={styles.catBadgeWrap}>
            {tile.isOver ? (
              <View style={styles.catOverBadge}>
                <Text style={styles.catOverBadgeText}>Over!</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.catPctPill,
                  { backgroundColor: withAlpha(tile.color, 0.13) },
                ]}
              >
                <Text style={[styles.catPctPillText, { color: tileTextColor }]}>
                  {`${tile.pct.toFixed(0)}%`}
                </Text>
              </View>
            )}

            {(prevAmt > 0 || tile.amount > 0) && (
              <View
                style={[
                  styles.deltaBadge,
                  {
                    backgroundColor: deltaUp
                      ? withAlpha(colors.expenseRed, 0.1)
                      : withAlpha(colors.incomeGreen, 0.12),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.deltaBadgeText,
                    { color: deltaUp ? colors.expenseRed : colors.incomeGreen },
                  ]}
                >
                  {deltaUp ? '+' : '-'}₱{Math.abs(delta).toLocaleString()}
                </Text>
              </View>
            )}
          </View>

          <View
            style={[
              styles.catIconCircle,
              { backgroundColor: withAlpha(tile.color, 0.16) },
            ]}
          >
            <CategoryIcon
              categoryKey={tile.iconKey}
              color={tileTextColor}
              size={15}
              wrapperSize={22}
            />
          </View>

          <Text
            style={[styles.catExpenseName, { color: tileTextColor }]}
            numberOfLines={1}
          >
            {tile.title}
          </Text>
          <Text style={[styles.catExpenseAmt, { color: tileTextColor }]}>
            ₱{tile.amount.toLocaleString()}
          </Text>

          <View style={styles.catProgressTrack}>
            <View
              style={[
                styles.catProgressFill,
                { width: `${progressPct}%`, backgroundColor: progressColor },
              ]}
            />
          </View>

          <View style={styles.catProgressMetaRow}>
            <Text
              style={[styles.catProgressPctLabel, { color: progressColor }]}
            >
              {pctDisplay}
            </Text>
            <Text style={styles.catProgressBudgetLabel}>
              of ₱{tile.budget.toLocaleString()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderIncomeTile = (incKey: string) => {
    const tile = incomeTiles.find((item) => item.key === incKey);
    if (!tile) return null;
    const wavePct = Math.max(8, Math.min(tile.pct, 100));
    const waveHeight = (122 * wavePct) / 100;

    return (
      <View key={tile.key} style={styles.catTileWrap}>
        <View
          style={[
            styles.catTile,
            { backgroundColor: isDark ? colors.surfaceSubdued : tile.tileBg },
          ]}
        >
          <WaveFill
            pct={waveHeight / TILE_H}
            color={tile.color}
            tileHeight={TILE_H}
          />

          <View
            style={[
              styles.catIconCircle,
              { backgroundColor: withAlpha(tile.color, 0.16) },
            ]}
          >
            <CategoryIcon
              categoryKey={tile.key}
              color={tile.color}
              size={15}
              wrapperSize={22}
            />
          </View>

          <View style={styles.catBadgeWrap}>
            <View
              style={[
                styles.catPctPill,
                { backgroundColor: withAlpha(tile.color, 0.13) },
              ]}
            >
              <Text style={[styles.catPctPillText, { color: tile.color }]}>
                {`${tile.pct.toFixed(0)}%`}
              </Text>
            </View>
          </View>

          <Text
            style={[styles.catName, { color: tile.color }]}
            numberOfLines={1}
          >
            {tile.title}
          </Text>
          <Text style={[styles.catAmt, { color: tile.color }]}>
            ₱{tile.amount.toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        scrollEnabled={false}
      >
        {/* Header */}
        <View style={styles.loadingHeader}>
          <Skeleton width={120} height={28} borderRadius={8} />
          <Skeleton width={36} height={36} borderRadius={12} />
        </View>

        {/* Hero card skeleton */}
        <View style={styles.loadingHeroCard}>
          <View style={styles.loadingHeroTopRow}>
            <Skeleton
              width={120}
              height={28}
              borderRadius={999}
              style={{ opacity: 0.35 }}
            />
            <Skeleton
              width={100}
              height={28}
              borderRadius={999}
              style={{ opacity: 0.35 }}
            />
          </View>
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <Skeleton
              width={160}
              height={160}
              borderRadius={80}
              style={{ opacity: 0.3 }}
            />
          </View>
          <View style={styles.loadingHeroMetrics}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Skeleton
                width={52}
                height={10}
                borderRadius={4}
                style={{ opacity: 0.3, marginBottom: 8 }}
              />
              <Skeleton
                width={72}
                height={18}
                borderRadius={4}
                style={{ opacity: 0.35 }}
              />
            </View>
            <View style={styles.metricDivider} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Skeleton
                width={64}
                height={10}
                borderRadius={4}
                style={{ opacity: 0.3, marginBottom: 8 }}
              />
              <Skeleton
                width={72}
                height={18}
                borderRadius={4}
                style={{ opacity: 0.35 }}
              />
            </View>
            <View style={styles.metricDivider} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Skeleton
                width={48}
                height={10}
                borderRadius={4}
                style={{ opacity: 0.3, marginBottom: 8 }}
              />
              <Skeleton
                width={72}
                height={18}
                borderRadius={4}
                style={{ opacity: 0.35 }}
              />
            </View>
          </View>
        </View>

        {/* Tab bar skeleton */}
        <Skeleton
          width="100%"
          height={40}
          borderRadius={14}
          style={{ marginBottom: 16 }}
        />

        {/* Quick Stats skeletons */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="31%" height={80} borderRadius={16} />
          ))}
        </View>

        {/* Daily Spend chart skeleton */}
        <Skeleton
          width="100%"
          height={128}
          borderRadius={20}
          style={{ marginBottom: 20 }}
        />

        {/* Top Expenses skeleton */}
        <Skeleton
          width="100%"
          height={136}
          borderRadius={20}
          style={{ marginBottom: 20 }}
        />

        {/* Account Activity skeleton */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={138} height={128} borderRadius={20} />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <RAnim.View style={[styles.screenTitleRow, headerAnim]}>
        <Text style={styles.headerTitle}>Insights</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation.navigate('ChatScreen')}
          style={styles.notifBtn}
        >
          <Ionicons
            name="notifications-outline"
            size={18}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
      </RAnim.View>
      {accountsError ? (
        <ErrorBanner
          message="Can't reach server — showing cached data."
          onRetry={refetchAccounts}
        />
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={viewType === 'expense' ? [2] : []}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              setIsRefreshing(true);
              try {
                await Promise.all([fetchStats(true), refetchAccounts()]);
              } finally {
                setIsRefreshing(false);
              }
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <RAnim.View style={heroAnim}>
          <LinearGradient
            colors={[colors.statsHeroBg1, colors.statsHeroBg2]}
            style={styles.heroCard}
          >
            <LinearGradient
              colors={[
                colors.primaryLight60 ?? 'rgba(91,140,110,0.35)',
                'transparent',
              ]}
              style={[
                styles.heroBlob,
                { top: -30, right: -20, width: 160, height: 160 },
              ]}
            />
            <LinearGradient
              colors={[
                colors.primaryTransparent50 ?? 'rgba(91,140,110,0.2)',
                'transparent',
              ]}
              style={[
                styles.heroBlob,
                {
                  bottom: 44,
                  left: -20,
                  width: 110,
                  height: 110,
                  opacity: 0.6,
                },
              ]}
            />

            <View style={styles.heroTopRow}>
              <View style={styles.monthNavPill}>
                <TouchableOpacity
                  style={styles.monthArrow}
                  activeOpacity={0.75}
                  onPress={handlePrevMonth}
                >
                  <Ionicons
                    name="chevron-back"
                    size={14}
                    color={colors.whiteTransparent80}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.monthNavTextBtn}
                  activeOpacity={0.75}
                  onPress={() => setMonthPickerVisible(true)}
                >
                  <View style={styles.monthNavTextWrap}>
                    <Text
                      style={styles.monthNavLabel}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      allowFontScaling={false}
                    >
                      {monthNavLabel}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.monthArrow, isAtMaxMonth && { opacity: 0.35 }]}
                  activeOpacity={0.75}
                  onPress={handleNextMonth}
                  disabled={isAtMaxMonth}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.whiteTransparent80}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.heroToggleWrap}>
                <TouchableOpacity
                  style={[
                    styles.heroToggleBtn,
                    viewType === 'expense' && styles.heroToggleBtnActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => handleViewTypeSwitch('expense')}
                >
                  <Text
                    style={[
                      styles.heroToggleText,
                      viewType === 'expense' && styles.heroToggleTextActive,
                    ]}
                  >
                    Expenses
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.heroToggleBtn,
                    viewType === 'income' && styles.heroToggleBtnActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => handleViewTypeSwitch('income')}
                >
                  <Text
                    style={[
                      styles.heroToggleText,
                      viewType === 'income' && styles.heroToggleTextActive,
                    ]}
                  >
                    Income
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Pressable
              style={styles.donutSection}
              onPress={() => {
                if (isInteractingWithDonutRef.current) return;
                if (activeDonutIndex !== -1) {
                  setActiveDonutIndex(-1);
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut
                  );
                }
              }}
            >
              <View {...panResponder.panHandlers} style={styles.donutContainer}>
                {isChartReady ? (
                  <Svg width={168} height={168} viewBox="0 0 160 160">
                    <G transform="rotate(-90, 80, 80)">
                      {/* Background track — red tint when over budget */}
                      <Circle
                        cx="80"
                        cy="80"
                        r={donutRadius}
                        stroke={
                          viewType === 'expense' && isOverBudget
                            ? 'rgba(239,68,68,0.22)'
                            : colors.whiteTransparent15
                        }
                        strokeWidth={donutStrokeWidth}
                        fill="transparent"
                      />

                      {/* Segments */}
                      {donutSegments.map((segment, index) => {
                        const isFocused = activeDonutIndex === index;
                        const isDimmed = activeDonutIndex >= 0 && !isFocused;
                        return (
                          <Circle
                            key={segment.key}
                            cx="80"
                            cy="80"
                            r={donutRadius}
                            stroke={segment.color}
                            strokeWidth={
                              isFocused
                                ? donutStrokeWidth + 4
                                : donutStrokeWidth
                            }
                            opacity={isDimmed ? 0.18 : 1}
                            fill="transparent"
                            strokeDasharray={segment.strokeDasharray}
                            strokeDashoffset={segment.strokeDashoffset}
                            strokeLinecap="round"
                          />
                        );
                      })}

                      {/* Budget-limit tick mark — white notch at the 100% budget position */}
                      {viewType === 'expense' &&
                        isOverBudget &&
                        totalBudget > 0 && (
                          <Circle
                            cx="80"
                            cy="80"
                            r={donutRadius}
                            stroke="white"
                            strokeWidth={donutStrokeWidth + 6}
                            fill="transparent"
                            strokeDasharray={`3 ${donutCircumference - 3}`}
                            strokeDashoffset={
                              -(totalBudget / totalExpenseSpent) *
                              donutCircumference
                            }
                            opacity={0.9}
                          />
                        )}
                    </G>
                  </Svg>
                ) : (
                  <Skeleton width={168} height={168} borderRadius={84} />
                )}
                <View style={styles.donutCenterText} pointerEvents="none">
                  <Text
                    style={[styles.donutCenterPct, { color: centerTextColor }]}
                  >
                    {centerPctText}
                  </Text>
                  <Text
                    style={[
                      styles.donutCenterSub,
                      {
                        color:
                          activeDonutIndex >= 0
                            ? centerTextColor
                            : colors.whiteTransparent65,
                      },
                    ]}
                  >
                    {centerSubText.charAt(0).toUpperCase() +
                      centerSubText.slice(1)}
                  </Text>
                </View>
              </View>
            </Pressable>

            <View style={styles.heroMetricsBar} pointerEvents="none">
              <View style={styles.budgetMetricsRow}>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{heroMetricOneLabel}</Text>
                  <Text
                    style={[
                      styles.metricVal,
                      viewType === 'expense'
                        ? styles.metricValCoral
                        : styles.metricValAccent,
                      selectedThemeColor && { color: selectedThemeColor },
                    ]}
                  >
                    {heroMetricOneDisplay}
                  </Text>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{heroMetricTwoLabel}</Text>
                  <Text
                    style={[
                      styles.metricVal,
                      viewType === 'expense'
                        ? styles.metricValAccent
                        : undefined,
                    ]}
                  >
                    {heroMetricTwoDisplay}
                  </Text>
                </View>

                {showBudgetMetric && (
                  <>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Budget</Text>
                      <Text style={styles.metricVal}>
                        {budgetMetricDisplay}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </LinearGradient>
        </RAnim.View>

        {viewType === 'expense' && (
          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.aiAlertStrip,
              {
                borderColor: withAlpha(aiAlertColor, 0.35),
                backgroundColor: withAlpha(aiAlertColor, isDark ? 0.2 : 0.12),
              },
            ]}
            onPress={() => navigation.navigate('ChatScreen')}
          >
            <View
              style={[
                styles.aiAlertIconWrap,
                { backgroundColor: aiAlertColor },
              ]}
            >
              <Ionicons name={aiAlertIcon} size={14} color={colors.white} />
            </View>
            <View style={styles.aiAlertBody}>
              <Text
                style={[styles.aiAlertTitle, { color: aiAlertColor }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {aiAlertText}
              </Text>
              <Text
                style={styles.aiAlertSub}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {aiAlertSubText}
              </Text>
            </View>
            <View
              style={[
                styles.aiAlertCtaWrap,
                {
                  backgroundColor: withAlpha(
                    aiAlertColor,
                    isDark ? 0.35 : 0.12
                  ),
                },
              ]}
            >
              <Text style={[styles.aiAlertCtaText, { color: aiAlertColor }]}>
                Ask Fino
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {viewType === 'expense' && (
          <View style={styles.stickyTabShell}>
            <View style={styles.tabChipRow}>
              {(['spend', 'patterns', 'categories'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const label =
                  tab === 'spend'
                    ? 'Spend'
                    : tab === 'patterns'
                      ? 'Patterns'
                      : 'Categories';
                return (
                  <TouchableOpacity
                    key={tab}
                    activeOpacity={0.8}
                    style={[styles.tabChip, isActive && styles.tabChipActive]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabChipText,
                        isActive && styles.tabChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <RAnim.View style={contentAnim}>
          <View style={styles.belowCard}>
            {viewType === 'expense' && activeTab === 'spend' && (
              <View style={styles.tabPanel}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>Spend Overview</Text>
                  <TouchableOpacity
                    style={styles.sectionInsightBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() =>
                      setInsightTarget({
                        title: 'Spend Overview',
                        message: buildSpendInsight(
                          totalExpenseSpent,
                          totalBudget,
                          monthLabel
                        ),
                      })
                    }
                  >
                    <Ionicons
                      name="bulb-outline"
                      size={15}
                      color={colors.textSecondary}
                      style={{ opacity: 0.7 }}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.quickStatsRow}>
                  <View style={styles.quickStatsPill}>
                    <Text style={styles.quickStatsTitle}>Transactions</Text>
                    <Text style={styles.quickStatsValue} numberOfLines={1}>
                      {fmtUiNumber(totalTxCount)}
                    </Text>
                  </View>
                  <View style={styles.quickStatsPill}>
                    <Text style={styles.quickStatsTitle}>Largest expense</Text>
                    <Text style={styles.quickStatsValue} numberOfLines={1}>
                      {biggestExpenseDisplay}
                    </Text>
                    <Text
                      style={[
                        styles.quickStatsSub,
                        !biggestExpense && styles.quickStatsSubMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {biggestExpense
                        ? (biggestExpense.display_name ??
                          biggestExpense.merchant_name ??
                          biggestExpense.category ??
                          '')
                        : 'No expense yet'}
                    </Text>
                  </View>
                  <View style={styles.quickStatsPill}>
                    <Text style={styles.quickStatsTitle}>Daily average</Text>
                    <Text style={styles.quickStatsValue} numberOfLines={1}>
                      {avgDailySpendDisplay}
                    </Text>
                  </View>
                </View>

                {totalTxCount > 0 && (
                  <View style={styles.chartCard}>
                    <View style={styles.sectionHeaderRow}>
                      <View style={styles.sectionDot} />
                      <Text style={styles.sectionLabel}>Daily Spend</Text>
                      <Text style={styles.sectionMetaText} numberOfLines={1}>
                        {monthLabel}
                      </Text>
                      <TouchableOpacity
                        style={styles.sectionInsightBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() =>
                          setInsightTarget({
                            title: 'Daily Spend',
                            message: buildDailyInsight(dailySpend, monthLabel),
                          })
                        }
                      >
                        <Ionicons
                          name="bulb-outline"
                          size={15}
                          color={colors.textSecondary}
                          style={{ opacity: 0.7 }}
                        />
                      </TouchableOpacity>
                    </View>
                    <DailySpendChart
                      data={dailyBarsData}
                      maxAmount={maxDailyAmount}
                      colors={colors}
                    />
                    {peakDayData.amount > 0 && (
                      <View style={styles.peakNoteRow}>
                        <View style={styles.peakNoteDot} />
                        <Text style={styles.peakNote}>
                          Peak spend: {MONTH_NAMES[selectedMonth].slice(0, 3)}{' '}
                          {peakDayData.day} · ₱
                          {peakDayData.amount.toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {topTransactions.length > 0 && (
                  <View style={styles.topTxCard}>
                    <View style={styles.sectionHeaderRow}>
                      <View style={styles.sectionDot} />
                      <Text style={styles.sectionLabel}>Top Expenses</Text>
                      <Text style={styles.sectionMetaText} numberOfLines={1}>
                        {monthLabel}
                      </Text>
                      <TouchableOpacity
                        style={styles.sectionInsightBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() =>
                          setInsightTarget({
                            title: 'Top Expenses',
                            message: topExpenseInsight,
                          })
                        }
                      >
                        <Ionicons
                          name="bulb-outline"
                          size={15}
                          color={colors.textSecondary}
                          style={{ opacity: 0.7 }}
                        />
                      </TouchableOpacity>
                    </View>
                    {topTransactions.slice(0, 3).map((tx, i) => {
                      const catKey = normalizeCategoryKey(tx.category);
                      const color = (
                        CATEGORY_THEME[catKey] ?? CATEGORY_THEME.other
                      ).barColor;
                      const name =
                        tx.display_name ??
                        tx.merchant_name ??
                        tx.category ??
                        'Transaction';
                      const dateStr = new Date(tx.date).toLocaleDateString(
                        'en-PH',
                        {
                          month: 'short',
                          day: 'numeric',
                        }
                      );
                      return (
                        <TouchableOpacity
                          key={i}
                          activeOpacity={0.75}
                          style={[
                            styles.topTxRow,
                            i === Math.min(topTransactions.length, 3) - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                          onPress={() =>
                            navigation.navigate('feed', {
                              screen: 'FeedMain',
                              params: { filterSortOrder: 'amount_desc' },
                            })
                          }
                        >
                          <View
                            style={[
                              styles.topTxRank,
                              i === 0 && styles.topTxRankGold,
                              i === 1 && styles.topTxRankSilver,
                              i === 2 && styles.topTxRankBronze,
                            ]}
                          >
                            <Text
                              style={[
                                styles.topTxRankText,
                                i === 0 && styles.topTxRankTextGold,
                                i === 1 && styles.topTxRankTextSilver,
                                i === 2 && styles.topTxRankTextBronze,
                              ]}
                            >
                              {i + 1}
                            </Text>
                          </View>
                          <View style={styles.topTxInfo}>
                            <Text style={styles.topTxName} numberOfLines={1}>
                              {name}
                            </Text>
                            <View style={styles.topTxMetaRow}>
                              <View
                                style={[
                                  styles.topTxDot,
                                  { backgroundColor: color },
                                ]}
                              />
                              <Text style={styles.topTxDate}>
                                {tx.category ?? 'Uncategorized'} · {dateStr}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.topTxAmt} numberOfLines={1}>
                            ₱{tx.amount.toLocaleString()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {accounts.some(
                  (a) =>
                    accountActivity.expense[a.id] ||
                    accountActivity.income[a.id]
                ) && (
                  <View style={[styles.chartCard, { paddingBottom: 20 }]}>
                    <View style={styles.sectionHeaderRow}>
                      <View style={styles.sectionDot} />
                      <Text style={styles.sectionLabel}>By Account</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[
                        styles.acctScrollContent,
                        { paddingVertical: 4 },
                      ]}
                    >
                      {accounts
                        .filter(
                          (a) =>
                            accountActivity.expense[a.id] ||
                            accountActivity.income[a.id]
                        )
                        .map((account) => (
                          <AccountActivityCard
                            key={account.id}
                            account={account}
                            expense={accountActivity.expense[account.id] ?? 0}
                            income={accountActivity.income[account.id] ?? 0}
                            colors={colors}
                            styles={styles}
                          />
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {viewType === 'expense' && activeTab === 'patterns' && (
              <View style={styles.tabPanel}>
                <View style={styles.chartCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionDot} />
                    <Text style={styles.sectionLabel}>vs Last Month</Text>
                    <Text style={styles.sectionMetaText} numberOfLines={1}>
                      {MONTH_NAMES[(selectedMonth + 11) % 12].slice(0, 3)} →{' '}
                      {MONTH_NAMES[selectedMonth].slice(0, 3)}
                    </Text>
                    <TouchableOpacity
                      style={styles.sectionInsightBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() =>
                        setInsightTarget({
                          title: 'Monthly Trend',
                          message: momInsight,
                        })
                      }
                    >
                      <Ionicons
                        name="bulb-outline"
                        size={15}
                        color={colors.textSecondary}
                        style={{ opacity: 0.7 }}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.trendCompareRow}>
                    <View
                      style={[
                        styles.trendPill,
                        momDelta >= 0
                          ? styles.trendPillUp
                          : styles.trendPillDown,
                      ]}
                    >
                      <Text style={styles.trendLabel}>Total Spent</Text>
                      <Text
                        style={[
                          styles.trendValue,
                          {
                            color:
                              momDelta >= 0
                                ? colors.expenseRed
                                : colors.incomeGreen,
                          },
                        ]}
                      >
                        {trendTotalSpentDisplay}
                      </Text>
                      <Text
                        style={[
                          styles.trendDelta,
                          {
                            color:
                              momDelta >= 0
                                ? colors.expenseRed
                                : colors.incomeGreen,
                          },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {momDelta >= 0 ? '↑' : '↓'} {trendDeltaAmountDisplay}{' '}
                        {momDelta >= 0 ? 'more' : 'less'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.trendPill,
                        txDelta >= 0
                          ? styles.trendPillUp
                          : styles.trendPillDown,
                      ]}
                    >
                      <Text style={styles.trendLabel}>Transactions</Text>
                      <Text
                        style={[
                          styles.trendValue,
                          {
                            color:
                              txDelta >= 0
                                ? colors.expenseRed
                                : colors.incomeGreen,
                          },
                        ]}
                      >
                        {totalTxCount}
                      </Text>
                      <Text
                        style={[
                          styles.trendDelta,
                          {
                            color:
                              txDelta >= 0
                                ? colors.expenseRed
                                : colors.incomeGreen,
                          },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {txDelta >= 0 ? '↑' : '↓'} {Math.abs(txDelta)}{' '}
                        {txDelta >= 0 ? 'more' : 'fewer'}
                      </Text>
                    </View>
                  </View>
                </View>

                {totalTxCount > 0 && (
                  <View style={styles.chartCard}>
                    <View style={styles.sectionHeaderRow}>
                      <View style={styles.sectionDot} />
                      <Text style={styles.sectionLabel}>By Day of Week</Text>
                      <Text style={styles.sectionMetaText} numberOfLines={1}>
                        {monthLabel}
                      </Text>
                      <TouchableOpacity
                        style={styles.sectionInsightBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() =>
                          setInsightTarget({
                            title: 'Weekly Pattern',
                            message: buildPatternsInsight(dowAvgSpend),
                          })
                        }
                      >
                        <Ionicons
                          name="bulb-outline"
                          size={15}
                          color={colors.textSecondary}
                          style={{ opacity: 0.7 }}
                        />
                      </TouchableOpacity>
                    </View>
                    <DowPatternChart dowAvg={dowAvgSpend} colors={colors} />
                    {(() => {
                      const peakDow = dowAvgSpend.indexOf(
                        Math.max(...dowAvgSpend)
                      );
                      const labels = [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ];
                      return dowAvgSpend[peakDow] > 0 ? (
                        <Text style={styles.chartSubNote}>
                          {labels[peakDow]} is your highest-spend day
                        </Text>
                      ) : null;
                    })()}
                  </View>
                )}

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.aiFullCard}
                  onPress={() => navigation.navigate('ChatScreen')}
                >
                  <View style={styles.aiFullHeader}>
                    <View style={styles.aiFullAvatar}>
                      <Ionicons
                        name="sparkles"
                        size={16}
                        color={colors.white}
                      />
                    </View>
                    <View style={styles.aiFullHeaderBody}>
                      <Text style={styles.aiFullTitle}>Fino Intelligence</Text>
                      <Text style={styles.aiFullSubtitle}>
                        Insights for {monthLabel}
                      </Text>
                    </View>
                  </View>

                  {aiInsightsLoading ? (
                    <>
                      <Skeleton
                        width="94%"
                        height={12}
                        style={{ marginBottom: 10 }}
                      />
                      <Skeleton
                        width="90%"
                        height={12}
                        style={{ marginBottom: 10 }}
                      />
                      <Skeleton
                        width="88%"
                        height={12}
                        style={{ marginBottom: 10 }}
                      />
                    </>
                  ) : (
                    <>
                      {(
                        aiInsights?.slice(0, 3) ?? [insightHeadline, insightSub]
                      ).map((insight, i) => (
                        <View key={i} style={styles.aiFullBulletRow}>
                          <View style={styles.aiFullBulletIcon}>
                            <Ionicons
                              name={
                                i === 0
                                  ? 'bag-handle-outline'
                                  : i === 1
                                    ? 'calendar-outline'
                                    : 'card-outline'
                              }
                              size={12}
                              color={colors.lavenderDark}
                            />
                          </View>
                          <Text style={styles.aiFullBulletText}>{insight}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <View style={styles.aiFullCtaRow}>
                    <Text style={styles.aiFullCtaText}>Chat with Fino →</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {viewType === 'expense' && activeTab === 'categories' && (
              <View style={styles.tabPanel}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>By Category</Text>
                </View>

                {expenseTiles.length > 0 ? (
                  <View style={styles.catGrid}>
                    {expenseTiles.map((tile) => renderExpenseTile(tile.key))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    No expense data for this period.
                  </Text>
                )}
              </View>
            )}

            {viewType === 'income' && (
              <View style={styles.tabPanel}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>Income Sources</Text>
                </View>

                {incomeTiles.length > 0 ? (
                  <View style={styles.catGrid}>
                    {incomeTiles.map((tile) => renderIncomeTile(tile.key))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    No income data for this period.
                  </Text>
                )}
              </View>
            )}
          </View>
        </RAnim.View>

        <MonthPickerModal
          visible={monthPickerVisible}
          year={selectedYear}
          month={selectedMonth}
          onConfirm={(y, m) => {
            setSelectedYear(y);
            setSelectedMonth(m);
            setMonthPickerVisible(false);
            setActiveDonutIndex(-1);
          }}
          onClose={() => setMonthPickerVisible(false)}
        />
      </ScrollView>

      <Modal
        visible={!!insightTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setInsightTarget(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback onPress={() => setInsightTarget(null)}>
            <View style={styles.insightBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.insightSheet}>
            <View style={styles.insightDragHandle} />
            <Ionicons
              name="bulb"
              size={22}
              color={colors.primary}
              style={{ marginBottom: 4 }}
            />
            <Text style={styles.insightTitle}>{insightTarget?.title}</Text>
            <Text style={styles.insightMessage}>{insightTarget?.message}</Text>
            <TouchableOpacity
              onPress={() => setInsightTarget(null)}
              style={styles.insightDismiss}
              activeOpacity={0.85}
            >
              <Text style={styles.insightDismissText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createPickerStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 24,
      width: 300,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    title: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 17,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    arrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.catTileEmptyBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    monthLabel: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 18,
      color: colors.textPrimary,
    },
    actions: { flexDirection: 'row', gap: 10 },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      alignItems: 'center',
    },
    cancelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.textSecondary,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    confirmText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: '#fff',
    },
  });

const createStyles = (colors: any, isDark: boolean, topInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Math.max(topInset + 8, 20),
    },
    content: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 6,
      paddingBottom: 108,
    },
    screenTitleRow: {
      paddingTop: 8,
      paddingBottom: 12,
      paddingHorizontal: spacing.screenPadding,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 27,
      color: colors.textPrimary,
      letterSpacing: -0.4,
    },
    notifBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: isDark
        ? colors.blackTransparent15
        : 'rgba(30,30,46,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
    },
    heroCard: {
      borderRadius: 28,
      padding: 20,
      overflow: 'hidden',
      shadowColor: colors.statsHeroBg2,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.45,
      shadowRadius: 28,
      elevation: 8,
      marginBottom: 22,
    },
    heroBlob: {
      position: 'absolute',
      borderRadius: 999,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
      zIndex: 2,
      gap: 8,
    },
    monthNavPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 4,
      backgroundColor: colors.whiteTransparent12,
      borderWidth: 1,
      borderColor: colors.whiteTransparent18,
      gap: 2,
      flex: 1,
      flexShrink: 1,
      maxWidth: '64%',
      minWidth: 132,
      height: 34,
    },
    monthNavTextBtn: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    monthNavTextWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      maxWidth: '100%',
    },
    monthNavCaret: {
      marginLeft: 2,
      marginTop: 1,
    },
    monthArrow: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthNavLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.whiteTransparent80,
      flexShrink: 1,
      textAlign: 'center',
      minWidth: 0,
      letterSpacing: 0.15,
    },
    heroToggleWrap: {
      flexDirection: 'row',
      borderRadius: 999,
      padding: 3,
      gap: 2,
      backgroundColor: colors.blackTransparent15,
      flexShrink: 0,
      height: 34,
    },
    heroToggleBtn: {
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    heroToggleBtnActive: {
      backgroundColor: colors.whiteTransparent18,
    },
    heroToggleText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.whiteTransparent55,
    },
    heroToggleTextActive: {
      color: colors.whiteTransparent80,
    },
    donutSection: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      marginBottom: 10,
    },
    donutContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    donutCenterText: {
      position: 'absolute',
      alignItems: 'center',
    },
    donutCenterPct: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 30,
      letterSpacing: -0.6,
      color: colors.white,
    },
    donutCenterSub: {
      marginTop: 4,
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heroMetricsBar: {
      borderRadius: 14,
      backgroundColor: colors.blackTransparent15,
      overflow: 'hidden',
      zIndex: 2,
    },
    budgetMetricsRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      width: '100%',
    },
    metricCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    metricLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      color: colors.whiteTransparent55,
      textTransform: 'uppercase',
      letterSpacing: 0.55,
      marginBottom: 4,
      textAlign: 'center',
    },
    metricVal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 16,
      color: colors.white,
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    metricValAccent: {
      color: colors.statsHeroBar,
    },
    metricValCoral: {
      color: '#FFAF9B',
    },
    metricDivider: {
      width: 1,
      backgroundColor: colors.whiteTransparent15,
      marginVertical: 10,
    },
    aiAlertStrip: {
      marginTop: -6,
      marginBottom: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(colors.lavender, 0.35),
      backgroundColor: isDark
        ? withAlpha(colors.lavenderDark, 0.2)
        : colors.lavenderLight,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    aiAlertIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: colors.lavenderDark,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    aiAlertBody: {
      flex: 1,
      minWidth: 0,
    },
    aiAlertTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.lavenderDark,
      marginBottom: 2,
    },
    aiAlertSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textPrimary,
      lineHeight: 15,
    },
    aiAlertCtaWrap: {
      borderRadius: 8,
      backgroundColor: withAlpha(colors.lavenderDark, isDark ? 0.35 : 0.12),
      paddingHorizontal: 9,
      paddingVertical: 5,
      flexShrink: 0,
    },
    aiAlertCtaText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.lavenderDark,
      letterSpacing: 0.2,
    },
    stickyTabShell: {
      backgroundColor: colors.background,
      paddingHorizontal: spacing.screenPadding,
      paddingBottom: 10,
      paddingTop: 4,
      zIndex: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark
        ? 'rgba(255,255,255,0.07)'
        : 'rgba(30,30,46,0.07)',
    },
    tabChipRow: {
      flexDirection: 'row',
      gap: 8,
    },
    tabChip: {
      flex: 1,
      paddingHorizontal: 8,
      height: 34,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
    },
    tabChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    tabChipTextActive: {
      color: '#FFFFFF',
    },
    belowCard: {
      marginTop: 10,
    },
    tabPanel: {
      paddingTop: 4,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
      minWidth: 0,
    },
    sectionDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.primary,
    },
    sectionLabel: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
      letterSpacing: 0.3,
      flexShrink: 1,
      minWidth: 0,
    },
    sectionMetaText: {
      marginLeft: 'auto',
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textSecondary,
      flexShrink: 1,
      textAlign: 'right',
      maxWidth: '46%',
    },
    sectionInsightBtn: {
      marginLeft: 6,
      opacity: 0.85,
    },
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 20,
      rowGap: 12,
    },
    catTileWrap: {
      width: '48.7%',
    },
    catTile: {
      borderRadius: 28,
      height: 122,
      padding: 14,
      justifyContent: 'flex-end',
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    catTileExpense: {
      borderRadius: 28,
      height: 122,
      paddingHorizontal: 14,
      paddingTop: 50,
      paddingBottom: 10,
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    catTileFlat: {
      borderRadius: 20,
      minHeight: 152,
      padding: 14,
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      backgroundColor: colors.white,
    },
    catBottomAccent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
    },
    catIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    catIconCircleInline: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catDeltaBadge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    catDeltaBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: -0.2,
    },
    catIconCircle: {
      position: 'absolute',
      top: 14,
      left: 14,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catBadgeWrap: {
      position: 'absolute',
      top: 10,
      right: 10,
      alignItems: 'flex-end',
    },
    catPctPill: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    catPctPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
    },
    catOverBadge: {
      backgroundColor: colors.coralLight,
      borderWidth: 1,
      borderColor: withAlpha(colors.coralDark, 0.3),
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    catOverBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.coralDark,
    },
    catName: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    catAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      marginBottom: 10,
    },
    catExpenseName: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 1,
    },
    catExpenseAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 12,
      marginBottom: 4,
    },
    catProgressTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.12)
        : withAlpha(colors.textPrimary, 0.08),
      overflow: 'hidden',
    },
    catProgressFill: {
      height: '100%',
      borderRadius: 999,
    },
    catProgressMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 3,
    },
    catProgressPctLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
    },
    catProgressBudgetLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10,
      color: colors.textSecondary,
    },
    emptyText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 32,
      opacity: 0.7,
    },
    insightWrap: {
      marginTop: 8,
      marginBottom: 18,
    },
    insightCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.insightCardBorder,
      padding: 16,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    insightAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: withAlpha(colors.lavender, 0.24),
      borderWidth: 1.5,
      borderColor: withAlpha(colors.lavender, 0.6),
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    insightBody: {
      flex: 1,
    },
    insightLabel: {
      alignSelf: 'flex-start',
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.lavenderDark,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    insightHeadline: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 4,
      lineHeight: 20,
    },
    insightSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    insightArrow: {
      marginTop: 12,
      alignSelf: 'center',
    },
    insightBulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 7,
      gap: 7,
    },
    insightBulletDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.lavenderDark,
      marginTop: 5,
      flexShrink: 0,
    },
    insightBulletText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textPrimary,
      lineHeight: 18,
      flex: 1,
    },
    insightBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    insightSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.white,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: 40,
      gap: 6,
    },
    insightDragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.18)'
        : 'rgba(30,30,46,0.12)',
      alignSelf: 'center',
      marginBottom: 12,
    },
    insightTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: colors.textPrimary,
    },
    insightMessage: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 21,
    },
    insightDismiss: {
      alignSelf: 'flex-end',
      marginTop: 10,
      paddingVertical: 9,
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    insightDismissText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#FFFFFF',
    },

    // ── Quick Stats Row ──
    quickStatsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    quickStatsPill: {
      flex: 1,
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: 'flex-start',
      minWidth: 0,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.07,
      shadowRadius: 8,
      elevation: isDark ? 0 : 2,
    },
    quickStatsTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 0,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      width: '100%',
      lineHeight: 13,
    },
    quickStatsValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 17,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      width: '100%',
      textAlign: 'left',
      marginTop: 4,
    },
    quickStatsSub: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 3,
      width: '100%',
      textAlign: 'left',
      minHeight: 14,
    },
    quickStatsSubMuted: {
      opacity: 0.78,
    },

    // ── Chart Card ──
    chartCard: {
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      padding: 16,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.07,
      shadowRadius: 10,
      elevation: isDark ? 0 : 2,
    },
    peakNote: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: PEAK_AMBER,
    },
    peakNoteRow: {
      marginTop: 10,
      borderRadius: 10,
      backgroundColor: withAlpha(PEAK_AMBER, 0.1),
      paddingVertical: 8,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    peakNoteDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: PEAK_AMBER,
      flexShrink: 0,
    },
    chartSubNote: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 8,
      opacity: 0.8,
    },
    trendCompareRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
      marginBottom: 20,
    },
    trendPill: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    trendPillUp: {
      backgroundColor: withAlpha(colors.expenseRed, 0.06),
      borderColor: withAlpha(colors.expenseRed, 0.16),
    },
    trendPillDown: {
      backgroundColor: withAlpha(colors.incomeGreen, 0.06),
      borderColor: withAlpha(colors.incomeGreen, 0.16),
    },
    trendLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.55,
      marginBottom: 6,
    },
    trendValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 16,
      letterSpacing: -0.3,
    },
    trendDelta: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      marginTop: 3,
    },

    aiFullCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(colors.lavender, 0.38),
      backgroundColor: isDark
        ? withAlpha(colors.lavenderDark, 0.18)
        : colors.lavenderLight,
      padding: 16,
      marginBottom: 20,
    },
    aiFullHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 10,
    },
    aiFullAvatar: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor: colors.lavenderDark,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    aiFullHeaderBody: {
      flex: 1,
    },
    aiFullTitle: {
      fontFamily: 'Inter_800ExtraBold',
      fontSize: 13,
      color: colors.lavenderDark,
    },
    aiFullSubtitle: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 1,
    },
    aiFullBulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      marginBottom: 10,
    },
    aiFullBulletIcon: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.lavender, 0.26),
      flexShrink: 0,
      marginTop: 1,
    },
    aiFullBulletText: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 17,
      color: colors.textPrimary,
    },
    aiFullCtaRow: {
      marginTop: 8,
      alignItems: 'flex-end',
    },
    aiFullCtaText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.lavenderDark,
      backgroundColor: withAlpha(colors.lavenderDark, isDark ? 0.34 : 0.1),
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      overflow: 'hidden',
    },

    // ── Account Activity ──
    acctScrollContent: {
      gap: 10,
      paddingRight: 4,
    },
    acctCardWrap: {
      width: 138,
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 8,
      elevation: isDark ? 0 : 2,
    },
    acctLogo: {
      width: 32,
      height: 32,
      borderRadius: 8,
      marginBottom: 8,
    },
    acctAvatar: {
      width: 32,
      height: 32,
      borderRadius: 8,
      marginBottom: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acctAvatarText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: colors.white,
    },
    acctName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    acctAmtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    acctAmtLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 8,
      color: colors.textSecondary,
      letterSpacing: 0.5,
      opacity: 0.6,
      width: 22,
    },
    acctExpAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
      color: colors.expenseRed,
      flexShrink: 1,
    },
    acctIncAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
      color: colors.incomeGreen,
      flexShrink: 1,
    },
    acctNetPill: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      marginTop: 6,
      alignSelf: 'flex-start',
    },
    acctNetText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
    },

    // ── Top Transactions ──
    topTxCard: {
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 4,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.07,
      shadowRadius: 10,
      elevation: isDark ? 0 : 2,
    },
    topTxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorderTransparent,
    },
    topTxDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      flexShrink: 0,
    },
    topTxRank: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.08)
        : 'rgba(30,30,46,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    topTxRankText: {
      fontFamily: 'Inter_800ExtraBold',
      fontSize: 10,
      color: colors.textSecondary,
    },
    topTxRankGold: {
      backgroundColor: isDark ? 'rgba(255,196,0,0.18)' : 'rgba(255,196,0,0.15)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,196,0,0.35)' : 'rgba(255,196,0,0.4)',
    },
    topTxRankSilver: {
      backgroundColor: isDark
        ? 'rgba(180,180,195,0.18)'
        : 'rgba(160,160,175,0.13)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(180,180,195,0.35)' : 'rgba(150,150,170,0.35)',
    },
    topTxRankBronze: {
      backgroundColor: isDark
        ? 'rgba(205,127,50,0.18)'
        : 'rgba(205,127,50,0.13)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(205,127,50,0.35)' : 'rgba(205,127,50,0.4)',
    },
    topTxRankTextGold: {
      color: isDark ? '#FFD700' : '#B8860B',
    },
    topTxRankTextSilver: {
      color: isDark ? '#C0C0C8' : '#7A7A8C',
    },
    topTxRankTextBronze: {
      color: isDark ? '#CD7F32' : '#A0522D',
    },
    topTxInfo: {
      flex: 1,
      minWidth: 0,
    },
    topTxMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 2,
    },
    topTxName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.textPrimary,
    },
    topTxDate: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
    },
    topTxAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.expenseRed,
    },

    // ── Delta badge on category tiles ──
    deltaBadge: {
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
      marginTop: 3,
      alignSelf: 'flex-end',
    },
    deltaBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: -0.2,
    },

    // Loading styles kept for skeleton state
    toggleRow: {
      marginBottom: 16,
    },
    loadingWrap: { paddingVertical: 16, alignItems: 'center' },
    loadingText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
    },
    loadingHeader: {
      paddingTop: 16,
      paddingBottom: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    loadingOverallCard: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
      borderRadius: 24,
      padding: 20,
      marginBottom: 16,
      alignItems: 'center',
    },
    loadingDonutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      gap: 18,
    },
    loadingDonutText: { alignItems: 'center', justifyContent: 'center' },
    loadingMetricRow: {
      flexDirection: 'row',
      width: '100%',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    loadingMetricCol: { flex: 1, alignItems: 'center' },
    loadingProgRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },
    loadingProgContent: { flex: 1 },
    loadingProgHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    loadingInsightCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.insightCardBorder,
      padding: 16,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      backgroundColor: colors.lavenderLight,
    },
    loadingHeroCard: {
      borderRadius: 28,
      padding: 20,
      marginBottom: 16,
      backgroundColor: colors.statsHeroBg1,
      overflow: 'hidden',
    },
    loadingHeroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    loadingHeroMetrics: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.18)',
      paddingVertical: 12,
    },
  });
