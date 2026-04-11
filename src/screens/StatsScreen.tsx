import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  Animated,
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
  Image,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Path as SvgPath, Rect, Line, Text as SvgText } from 'react-native-svg';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Dynamic Theme Hook
import { supabase } from '@/services/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  INCOME_CATEGORIES,
  CATEGORY_COLOR,
} from '@/constants/categoryMappings';
import { Skeleton } from '@/components/Skeleton';
import { ACCOUNT_LOGOS } from '@/constants/accountLogos';
import { useAccounts } from '@/hooks/useAccounts';
import { generateBulletInsights } from '@/services/gemini';

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

const SCREEN_WIDTH = Dimensions.get('window').width;

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

const normalizeCategoryKey = (value: string | null): string =>
  (value ?? '').trim().toLowerCase();

const withAlpha = (hex: string, alpha: number): string => {
  if (!hex.startsWith('#')) return hex;
  const normalized = hex.length === 4
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

// ─── WaveFill (shared with HomeScreen style) ───────────────────────────────

const TILE_W = 160;
const TILE_H = 122;
const WAVE_SVG_W = TILE_W * 4;

function makeWavePath(yBase: number, amp: number): string {
  const halfWl = TILE_W / 2;
  const numArcs = (WAVE_SVG_W / halfWl) + 2;
  let d = `M 0 ${yBase}`;
  for (let i = 0; i < numArcs; i++) {
    const x0 = i * halfWl;
    const xMid = x0 + halfWl / 2;
    const x1 = x0 + halfWl;
    const yPeak = i % 2 === 0 ? yBase - amp : yBase + amp;
    d += ` Q ${xMid} ${yPeak} ${x1} ${yBase}`;
  }
  d += ` L ${WAVE_SVG_W + halfWl} ${TILE_H} L 0 ${TILE_H} Z`;
  return d;
}

function WaveFill({ pct, color }: { pct: number; color: string }) {
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.timing(anim1, { toValue: 1, duration: 3000, useNativeDriver: true })
    );
    const loop2 = Animated.loop(
      Animated.timing(anim2, { toValue: 1, duration: 4600, useNativeDriver: true })
    );
    loop1.start();
    loop2.start();

    return () => {
      loop1.stop();
      loop2.stop();
      anim1.stopAnimation();
      anim2.stopAnimation();
    };
  }, [anim1, anim2]);

  const clampedPct = Math.min(Math.max(pct, 0), 1);
  const yBase = TILE_H - TILE_H * clampedPct;

  const tx1 = anim1.interpolate({ inputRange: [0, 1], outputRange: [0, -TILE_W] });
  const tx2 = anim2.interpolate({ inputRange: [0, 1], outputRange: [0, -TILE_W] });

  const waveStyle = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: WAVE_SVG_W,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[waveStyle, { transform: [{ translateX: tx2 }] }]}>
        <Svg width={WAVE_SVG_W} height={TILE_H}>
          <SvgPath d={makeWavePath(yBase + 6, 8)} fill={color} opacity={0.18} />
        </Svg>
      </Animated.View>
      <Animated.View style={[waveStyle, { transform: [{ translateX: tx1 }] }]}>
        <Svg width={WAVE_SVG_W} height={TILE_H}>
          <SvgPath d={makeWavePath(yBase, 10)} fill={color} opacity={0.42} />
        </Svg>
      </Animated.View>
    </View>
  );
}

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

// ─── DailySpendChart ─────────────────────────────────────────────────────────

const PEAK_AMBER = '#E07B2E';

function DailySpendChart({
  data,
  maxAmount,
  colors,
}: {
  data: { day: number; amount: number }[];
  maxAmount: number;
  colors: any;
}) {
  const Y_LABEL_W = 34;
  const PADDING = 16;
  const CHART_W = SCREEN_WIDTH - 32 - PADDING * 2 - Y_LABEL_W;
  const CHART_H = 80;
  const BAR_GAP = 2;
  const barCount = data.length;
  const BAR_W = Math.max(2, (CHART_W - BAR_GAP * (barCount - 1)) / barCount);
  const peakIndex = data.reduce(
    (best, d, i) => (d.amount > data[best].amount ? i : best),
    0
  );

  const formatYLabel = (value: number): string => {
    if (value === 0) return '₱0';
    if (value >= 1000) return `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    return `₱${Math.round(value)}`;
  };

  const ySteps = [
    { label: formatYLabel(maxAmount), y: 4 },
    { label: formatYLabel(maxAmount / 2), y: CHART_H / 2 + 4 },
    { label: '₱0', y: CHART_H },
  ];

  return (
    <Svg width={Y_LABEL_W + CHART_W} height={CHART_H + 14}>
      {/* Y-axis labels */}
      {ySteps.map((step, idx) => (
        <SvgText
          key={idx}
          x={Y_LABEL_W - 4}
          y={step.y}
          fontSize={8}
          fill={withAlpha(colors.textSecondary, 0.5)}
          textAnchor="end"
          fontWeight="500"
        >
          {step.label}
        </SvgText>
      ))}
      {/* Gridlines */}
      {[0.25, 0.5, 0.75, 1].map((pct) => {
        const y = CHART_H - CHART_H * pct;
        return (
          <Line
            key={pct}
            x1={Y_LABEL_W}
            y1={y}
            x2={Y_LABEL_W + CHART_W}
            y2={y}
            stroke={withAlpha(colors.textSecondary, 0.1)}
            strokeWidth={1}
          />
        );
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const barH = maxAmount > 0 ? (d.amount / maxAmount) * CHART_H : 0;
        const x = Y_LABEL_W + i * (BAR_W + BAR_GAP);
        const y = CHART_H - Math.max(barH, d.amount > 0 ? 2 : 0);
        const isPeak = i === peakIndex && d.amount > 0;
        const barColor = isPeak ? PEAK_AMBER : colors.primary;
        const opacity = d.amount === 0 ? 0.15 : isPeak ? 1 : 0.6;
        const showLabel = d.day % 10 === 1 || isPeak;
        return (
          <React.Fragment key={d.day}>
            <Rect
              x={x}
              y={y}
              width={BAR_W}
              height={Math.max(barH, d.amount > 0 ? 2 : 1)}
              fill={barColor}
              opacity={opacity}
              rx={1.5}
            />
            {showLabel && (
              <SvgText
                x={x + BAR_W / 2}
                y={CHART_H + 12}
                fontSize={8}
                fill={isPeak ? PEAK_AMBER : colors.textSecondary}
                textAnchor="middle"
                fontWeight="600"
              >
                {d.day}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── DowPatternChart ─────────────────────────────────────────────────────────

function DowPatternChart({
  dowAvg,
  colors,
}: {
  dowAvg: number[];
  colors: any;
}) {
  const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxDow = Math.max(...dowAvg, 1);
  const BAR_H_MAX = 48;
  const peakDow = dowAvg.indexOf(Math.max(...dowAvg));

  const formatAvg = (v: number): string => {
    if (v === 0) return '';
    if (v >= 1000) return `₱${(v / 1000).toFixed(1)}k`;
    return `₱${Math.round(v)}`;
  };

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          height: BAR_H_MAX + 32,
        }}
      >
        {DOW_LABELS.map((label, i) => {
          const pct = dowAvg[i] / maxDow;
          const barH = Math.max(pct * BAR_H_MAX, dowAvg[i] > 0 ? 3 : 2);
          const isWeekend = i >= 5;
          const isPeak = i === peakDow && dowAvg[i] > 0;
          const barColor = isPeak
            ? PEAK_AMBER
            : isWeekend
              ? colors.lavender
              : colors.primary;
          return (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              {isPeak && dowAvg[i] > 0 && (
                <Text
                  style={{
                    fontFamily: 'Inter_700Bold',
                    fontSize: 8,
                    color: PEAK_AMBER,
                    marginBottom: 3,
                  }}
                >
                  {formatAvg(dowAvg[i])}
                </Text>
              )}
              <View
                style={{
                  width: 22,
                  height: barH,
                  backgroundColor: barColor,
                  borderRadius: 5,
                  opacity: dowAvg[i] === 0 ? 0.2 : 0.82,
                }}
              />
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 9,
                  color: isPeak ? PEAK_AMBER : colors.textSecondary,
                  marginTop: 5,
                }}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.primary }} />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.textSecondary }}>
            Weekday
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.lavender }} />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.textSecondary }}>
            Weekend
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: PEAK_AMBER }} />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.textSecondary }}>
            Peak day
          </Text>
        </View>
      </View>
    </View>
  );
}

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
        <Image source={logo} style={styles.acctLogo} resizeMode="contain" />
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
      <Text style={styles.acctExpAmt}>-₱{expense.toLocaleString()}</Text>
      <Text style={styles.acctIncAmt}>+₱{income.toLocaleString()}</Text>
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
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // ── Date state ──
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // ── View type ──
  const [viewType, setViewType] = useState<'expense' | 'income'>('expense');

  // ── Tab navigation ──
  const [activeTab, setActiveTab] = useState<'spend' | 'patterns' | 'categories'>('spend');

  // ── UI state ──
  const [activeDonutIndex, setActiveDonutIndex] = useState<number>(-1);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

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
  const [dowAvgSpend, setDowAvgSpend] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
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

  const { accounts } = useAccounts();

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

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);

      // Compute prev month range for delta badges
      const prevMonthNum = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYearNum = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const prevFrom = new Date(prevYearNum, prevMonthNum, 1).toISOString();
      const prevTo = new Date(
        prevYearNum,
        prevMonthNum + 1,
        0,
        23,
        59,
        59,
        999
      ).toISOString();

      const [
        { data: catData },
        { data: txData },
        { data: incomeTxData },
        { data: dailyTxData },
        { data: topTxData },
        { data: acctTxData },
        { data: prevTxData },
      ] = await Promise.all([
        supabase
          .from('categories')
          .select(
            'name, budget_limit, emoji, text_colour, tile_bg_colour, sort_order'
          )
          .eq('is_active', true),
        supabase
          .from('transactions')
          .select('category, amount, type')
          .eq('type', 'expense')
          .gte('date', monthRange.from)
          .lte('date', monthRange.to),
        supabase
          .from('transactions')
          .select('category, amount')
          .eq('type', 'income')
          .gte('date', monthRange.from)
          .lte('date', monthRange.to),
        supabase
          .from('transactions')
          .select('date, amount')
          .eq('type', 'expense')
          .gte('date', monthRange.from)
          .lte('date', monthRange.to),
        supabase
          .from('transactions')
          .select('display_name, merchant_name, amount, category, date, account_id')
          .eq('type', 'expense')
          .gte('date', monthRange.from)
          .lte('date', monthRange.to)
          .order('amount', { ascending: false })
          .limit(5),
        supabase
          .from('transactions')
          .select('account_id, amount, type')
          .gte('date', monthRange.from)
          .lte('date', monthRange.to),
        supabase
          .from('transactions')
          .select('category, amount')
          .eq('type', 'expense')
          .gte('date', prevFrom)
          .lte('date', prevTo),
      ]);

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

      setExpenseCategoryKeys(nextKeys);
      setExpenseCategoryMeta(nextMeta);
      setExpenseTotals(nextTotals);
      setExpenseBudgets(nextBudgets);

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

      setIncomeTotals(nextIncomeTotals);

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
      setDailySpend(dailyMap);
      setDowAvgSpend(dowAvg);
      setTotalTxCount(dailyTxData?.length ?? 0);

      // ── Top transactions ──
      setTopTransactions((topTxData ?? []) as TopTx[]);

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
      setAccountActivity({ expense: acctExpense, income: acctIncome });

      // ── Previous month totals for delta badges ──
      const prevTotals: Record<string, number> = {};
      (prevTxData ?? []).forEach((tx) => {
        const key = normalizeCategoryKey(tx.category);
        prevTotals[key] = (prevTotals[key] ?? 0) + Number(tx.amount);
      });
      setPrevMonthExpenseTotals(prevTotals);
      setPrevMonthTxCount(prevTxData?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, [monthRange, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats])
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
    totalBudget > 0
      ? Math.min((totalExpenseSpent / totalBudget) * 100, 100)
      : 0;
  const remaining = Math.max(totalBudget - totalExpenseSpent, 0);
  const totalIncome = Object.values(incomeTotals).reduce((s, v) => s + v, 0);
  const incomeActiveKeys = INCOME_CATEGORIES.filter(
    (c) => (incomeTotals[c.key] ?? 0) > 0
  );

  // ─── SVG Donut segments ───────────────────────────────────────────────────
  const donutRadius = 60;
  const donutStrokeWidth = 14;
  const donutCircumference = 2 * Math.PI * donutRadius;

  const donutSegments = useMemo(() => {
    let cumulativeOffset = 0;
    if (viewType === 'expense') {
      return expenseCategoryKeys
        .filter((k) => expenseTotals[k] > 0)
        .map((cat, index) => {
          const maxBudget = totalBudget > 0 ? totalBudget : 1;
          const catSpent = Math.min(expenseTotals[cat], maxBudget);
          const strokeLength = (catSpent / maxBudget) * donutCircumference;
          const gapLength = donutCircumference - strokeLength;
          const meta = expenseCategoryMeta[cat];
          const fallbackColor =
            Object.values(CATEGORY_THEME)[
              index % Object.values(CATEGORY_THEME).length
            ].barColor;
          const color = meta?.textColor ?? fallbackColor;
          const segment = {
            key: cat,
            color,
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
      const strokeLength = (amount / denom) * donutCircumference;
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
    totalBudget,
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

  const expenseTiles = useMemo(() => {
    return expenseCategoryKeys
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
      .sort((a, b) => b.amount - a.amount);
  }, [expenseCategoryKeys, expenseCategoryMeta, expenseTotals, expenseBudgets]);

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

  const mostOverBudgetTile = useMemo(() => {
    return expenseTiles
      .filter((tile) => tile.isOver)
      .sort((a, b) => b.pct - a.pct)[0] ?? null;
  }, [expenseTiles]);

  // ── New derived values ──
  const biggestExpense = useMemo(() => topTransactions[0] ?? null, [topTransactions]);

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
    () => dailyBarsData.reduce((best, d) => (d.amount > best.amount ? d : best), { day: 0, amount: 0 }),
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
    } catch (_) {
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

  const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

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
      ? selectedExpenseSpent ?? totalExpenseSpent
      : selectedIncomeAmount ?? totalIncome;

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

  const insightHeadline = mostOverBudgetTile
    ? `${mostOverBudgetTile.title} is ${(mostOverBudgetTile.pct - 100).toFixed(0)}% over budget this month`
    : 'Your spending trend looks stable this month';
  const insightSub = mostOverBudgetTile
    ? 'Tap to get personalized savings tips from Fino.'
    : 'Ask Fino for custom insights and ways to improve your budget.';

  const aiAlertText = mostOverBudgetTile
    ? `${mostOverBudgetTile.title} is ${(mostOverBudgetTile.pct - 100).toFixed(0)}% over budget.`
    : 'No categories are over budget this month.';
  const aiAlertSubText = mostOverBudgetTile
    ? `Consider reducing by ₱${Math.max(mostOverBudgetTile.amount - mostOverBudgetTile.budget, 0).toLocaleString()} next month.`
    : 'Keep this pace and ask Fino for next-step savings ideas.';

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
          <WaveFill pct={waveHeight / TILE_H} color={tile.color} />

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
            <Text style={[styles.catProgressPctLabel, { color: progressColor }]}>
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
          <WaveFill pct={waveHeight / TILE_H} color={tile.color} />

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

          <Text style={[styles.catName, { color: tile.color }]} numberOfLines={1}>
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
        <View style={styles.loadingHeader}>
          <View>
            <Skeleton width={92} height={24} style={{ marginBottom: 8 }} />
            <Skeleton width={152} height={13} />
          </View>
          <Skeleton width={92} height={32} borderRadius={999} />
        </View>
        <View style={styles.toggleRow}>
          <Skeleton width="100%" height={28} borderRadius={10} />
        </View>
        <View style={styles.loadingOverallCard}>
          <View style={styles.loadingDonutRow}>
            <Skeleton width={132} height={132} borderRadius={66} />
            <View style={styles.loadingDonutText}>
              <Skeleton width={72} height={28} style={{ marginBottom: 8 }} />
              <Skeleton width={88} height={12} />
            </View>
          </View>
          <View style={styles.loadingMetricRow}>
            <View style={styles.loadingMetricCol}>
              <Skeleton width={84} height={11} style={{ marginBottom: 8 }} />
              <Skeleton width={96} height={18} />
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.loadingMetricCol}>
              <Skeleton width={96} height={11} style={{ marginBottom: 8 }} />
              <Skeleton width={96} height={18} />
            </View>
          </View>
          <Skeleton width={168} height={11} style={{ marginTop: 12 }} />
        </View>
        {/* Quick Stats skeletons */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="31%" height={72} borderRadius={16} />
          ))}
        </View>
        {/* Chart skeletons */}
        <Skeleton width="100%" height={120} borderRadius={20} style={{ marginBottom: 16 }} />
        <Skeleton width="100%" height={96} borderRadius={20} style={{ marginBottom: 16 }} />
        {/* Account Activity skeleton */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={138} height={120} borderRadius={20} />
          ))}
        </View>
        {/* Top Transactions skeleton */}
        <Skeleton width="100%" height={130} borderRadius={20} style={{ marginBottom: 16 }} />

        <Skeleton width={88} height={11} style={{ marginBottom: 12 }} />
        <View style={{ marginBottom: 16 }}>
          {Array.from({ length: 5 }).map((_, index) => (
            <View key={`stats-skel-${index}`} style={styles.loadingProgRow}>
              <Skeleton
                width={44}
                height={44}
                borderRadius={14}
                style={{ marginRight: 12 }}
              />
              <View style={styles.loadingProgContent}>
                <View style={styles.loadingProgHeaderRow}>
                  <Skeleton width={120} height={15} />
                  <Skeleton width={46} height={18} borderRadius={20} />
                </View>
                <Skeleton width="100%" height={6} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
        <View style={styles.loadingInsightCard}>
          <Skeleton
            width={36}
            height={36}
            borderRadius={18}
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Skeleton width={124} height={13} style={{ marginBottom: 10 }} />
            <Skeleton width="88%" height={18} style={{ marginBottom: 8 }} />
            <Skeleton width="96%" height={14} style={{ marginBottom: 14 }} />
            <Skeleton width={88} height={24} borderRadius={12} />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.screenTitleRow}>
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
      </View>

      <LinearGradient
        colors={[colors.statsHeroBg1, colors.statsHeroBg2]}
        style={styles.heroCard}
      >
        <View style={styles.heroBlobOne} />
        <View style={styles.heroBlobTwo} />

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
              activeOpacity={0.75}
              onPress={() => setMonthPickerVisible(true)}
            >
              <Text style={styles.monthNavLabel}>{monthLabel}</Text>
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
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
          }}
        >
          <View {...panResponder.panHandlers} style={styles.donutContainer}>
            <Svg width={160} height={160} viewBox="0 0 160 160">
              <G transform="rotate(-90, 80, 80)">
                <Circle
                  cx="80"
                  cy="80"
                  r={donutRadius}
                  stroke={colors.whiteTransparent15}
                  strokeWidth={18}
                  fill="transparent"
                />
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
                      strokeWidth={isFocused ? 22 : 18}
                      opacity={isDimmed ? 0.2 : 1}
                      fill="transparent"
                      strokeDasharray={segment.strokeDasharray}
                      strokeDashoffset={segment.strokeDashoffset}
                      strokeLinecap="butt"
                    />
                  );
                })}
              </G>
            </Svg>
            <View style={styles.donutCenterText} pointerEvents="none">
              <Text style={[styles.donutCenterPct, { color: centerTextColor }]}>
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
                {centerSubText.charAt(0).toUpperCase() + centerSubText.slice(1)}
              </Text>
            </View>
          </View>
        </Pressable>

        <Text style={styles.tapHint} pointerEvents="none">
          {donutSegments.length > 0
            ? 'Tap or drag chart to explore'
            : 'No data for this period'}
        </Text>

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
                ₱{heroMetricOneValue.toLocaleString()}
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
                {viewType === 'expense'
                  ? `₱${heroMetricTwoValue.toLocaleString()}`
                  : selectedIncomeDef
                    ? `${heroMetricTwoValue.toFixed(0)}%`
                    : `${heroMetricTwoValue} active`}
              </Text>
            </View>

            {showBudgetMetric && (
              <>
                <View style={styles.metricDivider} />
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>Budget</Text>
                  <Text style={styles.metricVal}>
                    ₱{(selectedExpenseBudget ?? totalBudget).toLocaleString()}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </LinearGradient>

      {viewType === 'expense' && (
        <>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.aiAlertStrip}
            onPress={() => navigation.navigate('ChatScreen')}
          >
            <View style={styles.aiAlertIconWrap}>
              <Ionicons name="sparkles" size={14} color={colors.white} />
            </View>
            <View style={styles.aiAlertBody}>
              <Text style={styles.aiAlertTitle}>{aiAlertText}</Text>
              <Text style={styles.aiAlertSub}>{aiAlertSubText}</Text>
            </View>
            <View style={styles.aiAlertCtaWrap}>
              <Text style={styles.aiAlertCtaText}>Ask Fino</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.tabBar}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.tabBtn,
                activeTab === 'spend' && styles.tabBtnActive,
              ]}
              onPress={() => setActiveTab('spend')}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'spend' && styles.tabBtnTextActive,
                ]}
              >
                Spend
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.tabBtn,
                activeTab === 'patterns' && styles.tabBtnActive,
              ]}
              onPress={() => setActiveTab('patterns')}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'patterns' && styles.tabBtnTextActive,
                ]}
              >
                Patterns
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.tabBtn,
                activeTab === 'categories' && styles.tabBtnActive,
              ]}
              onPress={() => setActiveTab('categories')}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'categories' && styles.tabBtnTextActive,
                ]}
              >
                Categories
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.belowCard}>
        {viewType === 'expense' && activeTab === 'spend' && (
          <View style={styles.tabPanel}>
            <View style={styles.quickStatsRow}>
              <View style={styles.quickStatsPill}>
                <Text style={styles.quickStatsValue}>{totalTxCount}</Text>
                <Text style={styles.quickStatsLabel}>Transactions</Text>
              </View>
              <View style={styles.quickStatsPill}>
                <Text style={styles.quickStatsValue} numberOfLines={1}>
                  {biggestExpense
                    ? `₱${biggestExpense.amount.toLocaleString()}`
                    : '—'}
                </Text>
                {biggestExpense && (
                  <Text style={styles.quickStatsSub} numberOfLines={1}>
                    {biggestExpense.display_name ??
                      biggestExpense.merchant_name ??
                      biggestExpense.category ??
                      ''}
                  </Text>
                )}
                <Text style={styles.quickStatsLabel}>Biggest Spend</Text>
              </View>
              <View style={styles.quickStatsPill}>
                <Text style={styles.quickStatsValue}>
                  ₱{avgDailySpend.toFixed(0)}
                </Text>
                <Text style={[styles.quickStatsSub, { color: colors.incomeGreen }]}>
                  /day avg
                </Text>
                <Text style={styles.quickStatsLabel}>Daily Avg</Text>
              </View>
            </View>

            {totalTxCount > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>Daily Spend</Text>
                  <Text style={styles.sectionMetaText}>{monthLabel}</Text>
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
                      Peak spend: {MONTH_NAMES[selectedMonth].slice(0, 3)} {peakDayData.day} · ₱{peakDayData.amount.toLocaleString()}
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
                  <Text style={styles.sectionMetaText}>This month</Text>
                </View>
                {topTransactions.slice(0, 3).map((tx, i) => {
                  const catKey = normalizeCategoryKey(tx.category);
                  const color =
                    (CATEGORY_THEME[catKey] ?? CATEGORY_THEME.other).barColor;
                  const name =
                    tx.display_name ??
                    tx.merchant_name ??
                    tx.category ??
                    'Transaction';
                  const dateStr = new Date(tx.date).toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <View
                      key={i}
                      style={[
                        styles.topTxRow,
                        i === Math.min(topTransactions.length, 3) - 1 && {
                          borderBottomWidth: 0,
                        },
                      ]}
                    >
                      <View style={styles.topTxRank}>
                        <Text style={styles.topTxRankText}>{i + 1}</Text>
                      </View>
                      <View style={styles.topTxInfo}>
                        <Text style={styles.topTxName} numberOfLines={1}>
                          {name}
                        </Text>
                        <View style={styles.topTxMetaRow}>
                          <View style={[styles.topTxDot, { backgroundColor: color }]} />
                          <Text style={styles.topTxDate}>
                            {tx.category ?? 'Uncategorized'} · {dateStr}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.topTxAmt}>
                        ₱{tx.amount.toLocaleString()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {accounts.some(
              (a) => accountActivity.expense[a.id] || accountActivity.income[a.id]
            ) && (
              <View style={styles.chartCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>By Account</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.acctScrollContent}
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
                <Text style={styles.sectionMetaText}>
                  {MONTH_NAMES[(selectedMonth + 11) % 12].slice(0, 3)} → {MONTH_NAMES[selectedMonth].slice(0, 3)}
                </Text>
              </View>

              <View style={styles.trendCompareRow}>
                <View
                  style={[
                    styles.trendPill,
                    momDelta >= 0 ? styles.trendPillUp : styles.trendPillDown,
                  ]}
                >
                  <Text style={styles.trendLabel}>Total Spent</Text>
                  <Text
                    style={[
                      styles.trendValue,
                      { color: momDelta >= 0 ? colors.expenseRed : colors.incomeGreen },
                    ]}
                  >
                    ₱{totalExpenseSpent.toLocaleString()}
                  </Text>
                  <Text
                    style={[
                      styles.trendDelta,
                      { color: momDelta >= 0 ? colors.expenseRed : colors.incomeGreen },
                    ]}
                  >
                    {momDelta >= 0 ? '↑' : '↓'} ₱{Math.abs(momDelta).toLocaleString()} {momDelta >= 0 ? 'more' : 'less'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.trendPill,
                    txDelta >= 0 ? styles.trendPillUp : styles.trendPillDown,
                  ]}
                >
                  <Text style={styles.trendLabel}>Transactions</Text>
                  <Text
                    style={[
                      styles.trendValue,
                      { color: txDelta >= 0 ? colors.expenseRed : colors.incomeGreen },
                    ]}
                  >
                    {totalTxCount}
                  </Text>
                  <Text
                    style={[
                      styles.trendDelta,
                      { color: txDelta >= 0 ? colors.expenseRed : colors.incomeGreen },
                    ]}
                  >
                    {txDelta >= 0 ? '↑' : '↓'} {Math.abs(txDelta)} {txDelta >= 0 ? 'more' : 'fewer'}
                  </Text>
                </View>
              </View>
            </View>

            {totalTxCount > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionLabel}>By Day of Week</Text>
                  <Text style={styles.sectionMetaText}>Avg spend</Text>
                </View>
                <DowPatternChart dowAvg={dowAvgSpend} colors={colors} />
                {(() => {
                  const peakDow = dowAvgSpend.indexOf(Math.max(...dowAvgSpend));
                  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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
                  <Ionicons name="sparkles" size={16} color={colors.white} />
                </View>
                <View style={styles.aiFullHeaderBody}>
                  <Text style={styles.aiFullTitle}>Fino Intelligence</Text>
                  <Text style={styles.aiFullSubtitle}>Insights for {monthLabel}</Text>
                </View>
              </View>

              {aiInsightsLoading ? (
                <>
                  <Skeleton width="94%" height={12} style={{ marginBottom: 10 }} />
                  <Skeleton width="90%" height={12} style={{ marginBottom: 10 }} />
                  <Skeleton width="88%" height={12} style={{ marginBottom: 10 }} />
                </>
              ) : (
                <>
                  {(aiInsights?.slice(0, 3) ?? [insightHeadline, insightSub]).map(
                    (insight, i) => (
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
                    )
                  )}
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
              <Text style={styles.emptyText}>No expense data for this period.</Text>
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
              <Text style={styles.emptyText}>No income data for this period.</Text>
            )}
          </View>
        )}
      </View>

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

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 6,
      paddingBottom: 108,
    },
    screenTitleRow: {
      paddingTop: 8,
      paddingBottom: 12,
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
      backgroundColor: isDark ? colors.blackTransparent15 : 'rgba(30,30,46,0.06)',
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
    heroBlobOne: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      top: -30,
      right: -20,
      backgroundColor: colors.primaryTransparent30,
    },
    heroBlobTwo: {
      position: 'absolute',
      width: 110,
      height: 110,
      borderRadius: 55,
      left: -20,
      bottom: 44,
      backgroundColor: colors.primaryTransparent30,
      opacity: 0.6,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
      zIndex: 2,
    },
    monthNavPill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 4,
      backgroundColor: colors.whiteTransparent12,
      borderWidth: 1,
      borderColor: colors.whiteTransparent18,
      gap: 2,
    },
    monthArrow: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthNavLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.whiteTransparent80,
      paddingHorizontal: 6,
    },
    heroToggleWrap: {
      flexDirection: 'row',
      borderRadius: 999,
      padding: 3,
      gap: 2,
      backgroundColor: colors.blackTransparent15,
    },
    heroToggleBtn: {
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    heroToggleBtnActive: {
      backgroundColor: colors.whiteTransparent18,
    },
    heroToggleText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.whiteTransparent55,
    },
    heroToggleTextActive: {
      color: colors.whiteTransparent80,
    },
    donutSection: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      marginBottom: 6,
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
      fontSize: 27,
      letterSpacing: -0.4,
      color: colors.white,
    },
    donutCenterSub: {
      marginTop: 3,
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    tapHint: {
      textAlign: 'center',
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.whiteTransparent55,
      marginTop: 4,
      marginBottom: 10,
      zIndex: 2,
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
      fontSize: 15,
      color: colors.white,
      letterSpacing: -0.3,
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
      marginTop: -10,
      marginBottom: 12,
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
    tabBar: {
      flexDirection: 'row',
      borderRadius: 14,
      padding: 3,
      backgroundColor: isDark
        ? colors.blackTransparent15
        : 'rgba(30,30,46,0.06)',
      marginBottom: 12,
    },
    tabBtn: {
      flex: 1,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    tabBtnActive: {
      backgroundColor: isDark ? withAlpha(colors.white, 0.08) : colors.white,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 3,
      elevation: isDark ? 0 : 1,
    },
    tabBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    tabBtnTextActive: {
      color: colors.textPrimary,
    },
    belowCard: {
      marginTop: 6,
    },
    tabPanel: {
      paddingTop: 2,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    sectionDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionMetaText: {
      marginLeft: 'auto',
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textSecondary,
    },
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 20,
      rowGap: 10,
    },
    catTileWrap: {
      width: '48.7%',
    },
    catTile: {
      borderRadius: 24,
      height: 122,
      padding: 14,
      justifyContent: 'flex-end',
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
    },
    catTileExpense: {
      borderRadius: 24,
      height: 122,
      paddingHorizontal: 14,
      paddingTop: 50,
      paddingBottom: 10,
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
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
      fontSize: 12,
      color: colors.textPrimary,
      marginBottom: 1,
    },
    catExpenseAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
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
      fontSize: 9,
      color: colors.textSecondary,
    },
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 20,
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

    // ── Quick Stats Row ──
    quickStatsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    quickStatsPill: {
      flex: 1,
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    quickStatsValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 18,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    quickStatsSub: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.expenseRed,
      marginTop: 1,
    },
    quickStatsLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },

    // ── Chart Card ──
    chartCard: {
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      padding: 16,
      marginBottom: 16,
    },
    peakNote: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: '#C06420',
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
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 8,
    },
    trendCompareRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
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
      borderRadius: 22,
      borderWidth: 1,
      borderColor: withAlpha(colors.lavender, 0.38),
      backgroundColor: isDark
        ? withAlpha(colors.lavenderDark, 0.18)
        : colors.lavenderLight,
      padding: 16,
      marginBottom: 16,
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
      width: 22,
      height: 22,
      borderRadius: 7,
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
      marginTop: 2,
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
    acctExpAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
      color: colors.expenseRed,
    },
    acctIncAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
      color: colors.incomeGreen,
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
      marginBottom: 16,
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
      width: 6,
      height: 6,
      borderRadius: 3,
      flexShrink: 0,
    },
    topTxRank: {
      width: 22,
      height: 22,
      borderRadius: 7,
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
  });
