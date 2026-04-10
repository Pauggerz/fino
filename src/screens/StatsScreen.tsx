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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Path as SvgPath } from 'react-native-svg';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Dynamic Theme Hook
import { supabase } from '@/services/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  INCOME_CATEGORIES,
  CATEGORY_COLOR,
} from '@/constants/categoryMappings';
import { Skeleton } from '@/components/Skeleton';

// ─── Types ───────────────────────────────────────────────────────────────────

type DbCategoryMeta = {
  label: string;
  emoji: string | null;
  textColor: string | null;
  tileBg: string | null;
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
      const { data: catData } = await supabase
        .from('categories')
        .select(
          'name, budget_limit, emoji, text_colour, tile_bg_colour, sort_order'
        )
        .eq('is_active', true);
      const { data: txData } = await supabase
        .from('transactions')
        .select('category, amount, type')
        .eq('type', 'expense')
        .gte('date', monthRange.from)
        .lte('date', monthRange.to);
      const { data: incomeTxData } = await supabase
        .from('transactions')
        .select('category, amount')
        .eq('type', 'income')
        .gte('date', monthRange.from)
        .lte('date', monthRange.to);

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
    } finally {
      setLoading(false);
    }
  }, [monthRange]);

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

  const renderExpenseTile = (catKey: string) => {
    const tile = expenseTiles.find((item) => item.key === catKey);
    if (!tile) return null;
    const wavePct = tile.isOver ? 100 : Math.max(10, Math.min(tile.pct, 100));
    const waveHeight = (122 * wavePct) / 100;
    const tileTextColor = tile.isOver ? colors.expenseRed : tile.color;

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
              categoryKey={tile.iconKey}
              color={tileTextColor}
              size={15}
              wrapperSize={22}
            />
          </View>

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
          </View>

          <Text style={[styles.catName, { color: tileTextColor }]} numberOfLines={1}>
            {tile.title}
          </Text>
          <Text style={[styles.catAmt, { color: tileTextColor }]}>
            ₱{tile.amount.toLocaleString()}
          </Text>
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

      <View style={styles.belowCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>
            {viewType === 'expense' ? 'By Category' : 'Income Sources'}
          </Text>
        </View>

        {viewType === 'expense' ? (
          expenseTiles.length > 0 ? (
            <View style={styles.catGrid}>
              {expenseTiles.map((tile) => renderExpenseTile(tile.key))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No expense data for this period.</Text>
          )
        ) : incomeTiles.length > 0 ? (
          <View style={styles.catGrid}>
            {incomeTiles.map((tile) => renderIncomeTile(tile.key))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No income data for this period.</Text>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.insightWrap}
          onPress={() => navigation.navigate('ChatScreen')}
        >
          <LinearGradient
            colors={[colors.lavenderLight, colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.insightCard}
          >
            <View style={styles.insightAvatar}>
              <Ionicons
                name="sparkles"
                size={18}
                color={colors.lavenderDark}
              />
            </View>
            <View style={styles.insightBody}>
              <Text style={styles.insightLabel}>Fino Intelligence</Text>
              <Text style={styles.insightHeadline}>{insightHeadline}</Text>
              <Text style={styles.insightSub}>{insightSub}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
              style={styles.insightArrow}
            />
          </LinearGradient>
        </TouchableOpacity>
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
    belowCard: {
      marginTop: 6,
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
      fontSize: 12,
      zIndex: 2,
    },
    catAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
      marginTop: 2,
      zIndex: 2,
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
