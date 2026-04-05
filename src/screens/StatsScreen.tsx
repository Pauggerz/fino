import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing } from '../constants/theme';
import { supabase } from '@/services/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';
import { INCOME_CATEGORIES, CATEGORY_COLOR } from '@/constants/categoryMappings';

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
  { nameColor: string; barColor: string; iconGrad: readonly [string, string]; badgeBg: string }
> = {
  food:      { nameColor: '#B27B16', barColor: '#F2A649', iconGrad: ['#FFF3E0', '#ffe4b5'], badgeBg: '#FFF3E0' },
  transport: { nameColor: '#1A5C9B', barColor: '#4CA1EF', iconGrad: ['#E8F4FD', '#c8e4f8'], badgeBg: '#EEF6FF' },
  shopping:  { nameColor: '#9B1A5C', barColor: '#F27A9B', iconGrad: ['#FDE8F0', '#fbc8dc'], badgeBg: '#FFF0F3' },
  bills:     { nameColor: '#5C1A9B', barColor: '#9B61E8', iconGrad: ['#EDE8FD', '#d8d0fa'], badgeBg: '#F3EFFF' },
  health:    { nameColor: '#2d6a4f', barColor: '#5B8C6E', iconGrad: ['#EFF8F2', '#d4eddf'], badgeBg: '#EFF8F2' },
  other:     { nameColor: colors.textSecondary, barColor: '#B4B2A9', iconGrad: ['#F7F5F2', '#efece8'], badgeBg: '#F7F5F2' },
};

const INCOME_THEME: Record<
  string,
  { nameColor: string; barColor: string; iconGrad: readonly [string, string]; badgeBg: string }
> = {
  salary:     { nameColor: '#2d6a4f', barColor: '#5B8C6E', iconGrad: ['#EFF8F2', '#d4eddf'], badgeBg: '#EFF8F2' },
  allowance:  { nameColor: '#3A80C0', barColor: '#4CA1EF', iconGrad: ['#E8F4FD', '#c8e4f8'], badgeBg: '#EEF6FF' },
  freelance:  { nameColor: '#7A4AB8', barColor: '#9B61E8', iconGrad: ['#EDE8FD', '#d8d0fa'], badgeBg: '#F3EFFF' },
  business:   { nameColor: '#C97A20', barColor: '#F2A649', iconGrad: ['#FFF3E0', '#ffe4b5'], badgeBg: '#FDF6E3' },
  gifts:      { nameColor: '#C0503A', barColor: '#F27A9B', iconGrad: ['#FDE8F0', '#fbc8dc'], badgeBg: '#FFF0F3' },
  investment: { nameColor: '#1a7a6e', barColor: '#2a9d8f', iconGrad: ['#E8F6F5', '#d0eeec'], badgeBg: '#E8F6F5' },
  default:    { nameColor: colors.textSecondary, barColor: '#B4B2A9', iconGrad: ['#F7F5F2', '#efece8'], badgeBg: '#F7F5F2' },
};

const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
  food: 1500, transport: 1000, shopping: 2000, bills: 1500, health: 1000, default: 1000,
};

const INCOME_KEYS = new Set(INCOME_CATEGORIES.map((c) => c.key));

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const normalizeCategoryKey = (value: string | null): string =>
  (value ?? '').trim().toLowerCase();

// ─── Month picker modal (matches FeedScreen style) ────────────────────────────

function MonthPickerModal({
  visible, year, month, onConfirm, onClose,
}: {
  visible: boolean; year: number; month: number;
  onConfirm: (y: number, m: number) => void; onClose: () => void;
}) {
  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);

  useEffect(() => {
    if (visible) { setDraftYear(year); setDraftMonth(month); }
  }, [visible, year, month]);

  const prevMonth = () => {
    if (draftMonth === 0) { setDraftMonth(11); setDraftYear((y) => y - 1); }
    else setDraftMonth((m) => m - 1);
  };
  const nextMonth = () => {
    const now = new Date();
    if (draftYear > now.getFullYear() || (draftYear === now.getFullYear() && draftMonth >= now.getMonth())) return;
    if (draftMonth === 11) { setDraftMonth(0); setDraftYear((y) => y + 1); }
    else setDraftMonth((m) => m + 1);
  };

  const now = new Date();
  const isAtMax = draftYear > now.getFullYear() ||
    (draftYear === now.getFullYear() && draftMonth >= now.getMonth());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <Pressable style={pickerStyles.card} onPress={() => {}}>
          <Text style={pickerStyles.title}>Select Month</Text>
          <View style={pickerStyles.row}>
            <TouchableOpacity style={pickerStyles.arrow} onPress={prevMonth} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={pickerStyles.monthLabel}>{MONTH_NAMES[draftMonth]} {draftYear}</Text>
            <TouchableOpacity
              style={[pickerStyles.arrow, isAtMax && { opacity: 0.3 }]}
              onPress={nextMonth} disabled={isAtMax} activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={pickerStyles.actions}>
            <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
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

const pickerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: 300, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  title: { fontFamily: 'Nunito_700Bold', fontSize: 17, color: colors.textPrimary, textAlign: 'center', marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F7F5F2', justifyContent: 'center', alignItems: 'center' },
  monthLabel: { fontFamily: 'Nunito_700Bold', fontSize: 18, color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e0dfd7', alignItems: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.textSecondary },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' },
  confirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#fff' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const navigation = useNavigation<any>();

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
  const [expenseCategoryMeta, setExpenseCategoryMeta] = useState<Record<string, DbCategoryMeta>>({});
  const [expenseTotals, setExpenseTotals] = useState<Record<string, number>>({});
  const [expenseBudgets, setExpenseBudgets] = useState<Record<string, number>>({});

  // ── Income data ──
  const [incomeTotals, setIncomeTotals] = useState<Record<string, number>>({});

  const monthRange = useMemo(() => {
    const from = new Date(selectedYear, selectedMonth, 1).toISOString();
    const to = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).toISOString();
    return { from, to };
  }, [selectedYear, selectedMonth]);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);

      // ── Expense categories & spend ──
      const { data: catData } = await supabase
        .from('categories')
        .select('name, budget_limit, emoji, text_colour, tile_bg_colour, sort_order')
        .eq('is_active', true);

      const { data: txData } = await supabase
        .from('transactions')
        .select('category, amount, type')
        .eq('type', 'expense')
        .gte('date', monthRange.from)
        .lte('date', monthRange.to);

      // ── Income transactions ──
      const { data: incomeTxData } = await supabase
        .from('transactions')
        .select('category, amount')
        .eq('type', 'income')
        .gte('date', monthRange.from)
        .lte('date', monthRange.to);

      // Build expense maps — exclude income-keyed categories
      const nextTotals: Record<string, number> = {};
      const nextBudgets: Record<string, number> = {};
      const nextKeys: string[] = [];
      const nextMeta: Record<string, DbCategoryMeta> = {};

      (catData ?? []).forEach((cat) => {
        const key = normalizeCategoryKey(cat.name);
        const emojiKey = normalizeCategoryKey(cat.emoji);
        if (!key || INCOME_KEYS.has(emojiKey)) return; // skip income categories
        nextKeys.push(key);
        nextTotals[key] = 0;
        nextBudgets[key] =
          cat.budget_limit && cat.budget_limit > 0
            ? cat.budget_limit
            : (DEFAULT_CATEGORY_BUDGETS[key] ?? DEFAULT_CATEGORY_BUDGETS.default);
        nextMeta[key] = { label: cat.name, emoji: cat.emoji, textColor: cat.text_colour, tileBg: cat.tile_bg_colour };
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

      // Build income map by INCOME_CATEGORIES keys
      const nextIncomeTotals: Record<string, number> = {};
      INCOME_CATEGORIES.forEach((c) => { nextIncomeTotals[c.key] = 0; });

      (incomeTxData ?? []).forEach((tx) => {
        // match by category name → income key
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

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useFocusEffect(useCallback(() => { fetchStats(); }, [fetchStats]));

  // Reset donut selection when switching tabs
  const handleViewTypeSwitch = (type: 'expense' | 'income') => {
    setViewType(type);
    setActiveDonutIndex(-1);
  };

  // ─── Expense derived ──────────────────────────────────────────────────────

  const totalExpenseSpent = Object.values(expenseTotals).reduce((s, v) => s + v, 0);
  const totalBudget = Object.values(expenseBudgets).reduce((s, v) => s + v, 0);
  const budgetUsedPct = totalBudget > 0 ? Math.min((totalExpenseSpent / totalBudget) * 100, 100) : 0;
  const remaining = Math.max(totalBudget - totalExpenseSpent, 0);

  // ─── Income derived ───────────────────────────────────────────────────────

  const totalIncome = Object.values(incomeTotals).reduce((s, v) => s + v, 0);
  // Only income categories that actually received money (for donut)
  const incomeActiveKeys = INCOME_CATEGORIES.filter((c) => (incomeTotals[c.key] ?? 0) > 0);

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
          const fallbackColor = Object.values(CATEGORY_THEME)[index % Object.values(CATEGORY_THEME).length].barColor;
          const color = meta?.textColor ?? fallbackColor;
          const segment = { key: cat, color, strokeDasharray: `${strokeLength} ${gapLength}`, strokeDashoffset: -cumulativeOffset, catSpent };
          cumulativeOffset += strokeLength;
          return segment;
        });
    } else {
      // Income donut
      const denom = totalIncome > 0 ? totalIncome : 1;
      return incomeActiveKeys.map((incCat) => {
        const amount = incomeTotals[incCat.key] ?? 0;
        const strokeLength = (amount / denom) * donutCircumference;
        const gapLength = donutCircumference - strokeLength;
        const color = CATEGORY_COLOR[incCat.key] ?? '#888780';
        const segment = { key: incCat.key, color, strokeDasharray: `${strokeLength} ${gapLength}`, strokeDashoffset: -cumulativeOffset, catSpent: amount };
        cumulativeOffset += strokeLength;
        return segment;
      });
    }
  }, [viewType, expenseCategoryKeys, expenseTotals, expenseCategoryMeta, totalBudget, totalIncome, incomeActiveKeys, incomeTotals, donutCircumference]);

  const selectedDonut = activeDonutIndex >= 0 ? donutSegments[activeDonutIndex] : null;
  const selectedCategory = selectedDonut?.key ?? null;

  // ─── PAN RESPONDER ────────────────────────────────────────────────────────

  const activeDonutIndexRef = useRef(activeDonutIndex);
  const startIndexRef = useRef(activeDonutIndex);
  const segmentsLengthRef = useRef(donutSegments.length);
  const isInteractingWithDonutRef = useRef(false);

  useEffect(() => { activeDonutIndexRef.current = activeDonutIndex; }, [activeDonutIndex]);
  useEffect(() => { segmentsLengthRef.current = donutSegments.length; }, [donutSegments.length]);

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
          const delta = Math.floor((gestureState.dy - (gestureState.dy > 0 ? 5 : -5)) / sensitivity);
          const totalOptions = segmentsLengthRef.current + 1;
          const raw = startIndexRef.current + 1 + delta;
          const wrapped = ((raw % totalOptions) + totalOptions) % totalOptions;
          const nextIndex = wrapped - 1;
          if (activeDonutIndexRef.current !== nextIndex) {
            activeDonutIndexRef.current = nextIndex;
            setActiveDonutIndex(nextIndex);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            Vibration.vibrate(40);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setScrollEnabled(true);
        setTimeout(() => { isInteractingWithDonutRef.current = false; }, 120);
        if (Math.abs(gestureState.dy) <= 5 && Math.abs(gestureState.dx) <= 5) {
          const totalOptions = segmentsLengthRef.current + 1;
          const nextIndex = ((activeDonutIndexRef.current + 2) % totalOptions) - 1;
          setActiveDonutIndex(nextIndex);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          Vibration.vibrate(20);
        }
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        setTimeout(() => { isInteractingWithDonutRef.current = false; }, 120);
      },
    })
  ).current;

  // ─── Donut center text ────────────────────────────────────────────────────

  let centerPctText: string;
  let centerSubText: string;
  let centerTextColor = colors.textPrimary;

  if (viewType === 'expense') {
    if (selectedDonut && selectedCategory) {
      const catBudget = expenseBudgets[selectedCategory] || 1000;
      const catPct = catBudget > 0 ? ((expenseTotals[selectedCategory] ?? 0) / catBudget) * 100 : 0;
      const meta = expenseCategoryMeta[selectedCategory];
      centerPctText = `${catPct.toFixed(0)}%`;
      centerSubText = meta?.label ?? selectedCategory;
      centerTextColor = selectedDonut.color;
    } else {
      centerPctText = `${budgetUsedPct.toFixed(0)}%`;
      centerSubText = 'used overall';
    }
  } else {
    if (selectedDonut && selectedCategory) {
      const incDef = INCOME_CATEGORIES.find((c) => c.key === selectedCategory);
      const amount = incomeTotals[selectedCategory] ?? 0;
      const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;
      centerPctText = `${pct.toFixed(0)}%`;
      centerSubText = incDef?.name ?? selectedCategory;
      centerTextColor = selectedDonut.color;
    } else {
      centerPctText = totalIncome > 0 ? `₱${(totalIncome / 1000).toFixed(1)}k` : '₱0';
      centerSubText = 'total income';
    }
  }

  const selectedThemeColor = selectedDonut?.color ?? null;

  // ─── Renderers ────────────────────────────────────────────────────────────

  const renderExpenseCategoryRow = (catKey: string) => {
    const meta = expenseCategoryMeta[catKey];
    const title = meta?.label ?? catKey;
    const theme = CATEGORY_THEME[catKey] ?? CATEGORY_THEME.other;
    const color = meta?.textColor ?? theme.nameColor;
    const bg = meta?.tileBg ?? theme.badgeBg;
    const iconKey = catKey;
    const catSpent = expenseTotals[catKey] || 0;
    const catBudget = expenseBudgets[catKey] || DEFAULT_CATEGORY_BUDGETS.default;
    const pct = catBudget > 0 ? (catSpent / catBudget) * 100 : 0;
    const isOver = pct >= 100;
    const displayPct = isOver ? 'Over!' : `${pct.toFixed(0)}%`;
    const activeTextColor = isOver ? colors.expenseRed : color;

    return (
      <TouchableOpacity
        key={catKey}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('feed', { screen: 'FeedMain', params: { filterCategory: title } })}
        style={styles.progRow}
      >
        <LinearGradient colors={[bg, bg]} style={styles.catIconWrap}>
          <CategoryIcon categoryKey={iconKey} color={activeTextColor} size={14} wrapperSize={24} />
        </LinearGradient>
        <View style={styles.progRowContent}>
          <View style={styles.progHd}>
            <Text style={[styles.progName, { color: activeTextColor }]}>{title}</Text>
            <View style={styles.progMetaWrap}>
              <View style={[styles.progBadge, { backgroundColor: bg }]}>
                <Text style={[styles.progBadgeText, { color: activeTextColor }]}>{displayPct}</Text>
              </View>
              <Text style={[styles.progMeta, isOver && { color: activeTextColor }]}>
                ₱{catSpent.toLocaleString()} / ₱{catBudget.toLocaleString()}
              </Text>
            </View>
          </View>
          <View style={styles.progTrack}>
            <View style={[styles.progFillBar, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderIncomeCategoryRow = (incKey: string) => {
    const incDef = INCOME_CATEGORIES.find((c) => c.key === incKey);
    if (!incDef) return null;
    const theme = INCOME_THEME[incKey] ?? INCOME_THEME.default;
    const amount = incomeTotals[incKey] || 0;
    const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;

    return (
      <View key={incKey} style={styles.progRow}>
        <LinearGradient colors={[theme.badgeBg, theme.badgeBg]} style={styles.catIconWrap}>
          <CategoryIcon categoryKey={incKey} color={theme.nameColor} size={14} wrapperSize={24} />
        </LinearGradient>
        <View style={styles.progRowContent}>
          <View style={styles.progHd}>
            <Text style={[styles.progName, { color: theme.nameColor }]}>{incDef.name}</Text>
            <View style={styles.progMetaWrap}>
              <View style={[styles.progBadge, { backgroundColor: theme.badgeBg }]}>
                <Text style={[styles.progBadgeText, { color: theme.nameColor }]}>
                  {pct.toFixed(0)}%
                </Text>
              </View>
              <Text style={styles.progMeta}>
                ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
          <View style={styles.progTrack}>
            <View style={[styles.progFillBar, { width: `${Math.min(pct, 100)}%`, backgroundColor: theme.barColor }]} />
          </View>
        </View>
      </View>
    );
  };

  const monthLabel = `${MONTH_NAMES[selectedMonth].slice(0, 3)} ${selectedYear}`;

  // Expense card labels
  const expSpentLabel = selectedCategory && viewType === 'expense'
    ? `Spent · ${expenseCategoryMeta[selectedCategory]?.label ?? selectedCategory}`
    : 'Spent so far';
  const expRemainingLabel = selectedCategory && viewType === 'expense'
    ? `Remaining · ${expenseCategoryMeta[selectedCategory]?.label ?? selectedCategory}`
    : 'Remaining budget';
  const expSpentValue = selectedCategory && viewType === 'expense'
    ? (expenseTotals[selectedCategory] ?? 0)
    : totalExpenseSpent;
  const expRemainingValue = selectedCategory && viewType === 'expense'
    ? Math.max((expenseBudgets[selectedCategory] ?? 0) - (expenseTotals[selectedCategory] ?? 0), 0)
    : remaining;

  // Income card labels
  const selIncDef = selectedCategory ? INCOME_CATEGORIES.find((c) => c.key === selectedCategory) : null;
  const incSpentLabel = selIncDef ? `Received · ${selIncDef.name}` : 'Total received';
  const incSpentValue = selIncDef ? (incomeTotals[selectedCategory!] ?? 0) : totalIncome;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={scrollEnabled}
    >
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Stats</Text>
          <Text style={styles.headerSub}>
            {viewType === 'expense'
              ? `₱${totalBudget.toLocaleString()} monthly budget`
              : `₱${totalIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })} received`}
          </Text>
        </View>

        {/* Green pill — same as Transactions screen */}
        <TouchableOpacity
          style={styles.monthPill}
          activeOpacity={0.7}
          onPress={() => setMonthPickerVisible(true)}
        >
          <Text style={styles.monthPillText}>{monthLabel} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* ─── INCOME / EXPENSE TOGGLE ─── */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewType === 'expense' && styles.toggleBtnExpenseActive]}
          onPress={() => handleViewTypeSwitch('expense')}
          activeOpacity={0.8}
        >
          <Text style={[styles.toggleBtnText, viewType === 'expense' && styles.toggleBtnTextActive]}>
            Expenses
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewType === 'income' && styles.toggleBtnIncomeActive]}
          onPress={() => handleViewTypeSwitch('income')}
          activeOpacity={0.8}
        >
          <Text style={[styles.toggleBtnText, viewType === 'income' && styles.toggleBtnTextActive]}>
            Income
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── OVERALL CARD (donut) ─── */}
      <Pressable
        style={[styles.overallCard, selectedThemeColor && { borderColor: selectedThemeColor }]}
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
              <Circle cx="80" cy="80" r={donutRadius} stroke="rgba(30,30,46,0.06)" strokeWidth={donutStrokeWidth} fill="transparent" />
              {donutSegments.map((segment, index) => {
                const isFocused = activeDonutIndex === index;
                const isDimmed = activeDonutIndex >= 0 && !isFocused;
                return (
                  <Circle
                    key={segment.key}
                    cx="80" cy="80" r={donutRadius}
                    stroke={segment.color}
                    strokeWidth={isFocused ? donutStrokeWidth + 6 : donutStrokeWidth}
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
            <Text style={[styles.donutCenterPct, { color: centerTextColor }]}>{centerPctText}</Text>
            <Text style={[styles.donutCenterSub, { color: activeDonutIndex >= 0 ? centerTextColor : '#6B6B7A' }]}>
              {centerSubText.charAt(0).toUpperCase() + centerSubText.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.budgetMetrics} pointerEvents="none">
          <View style={styles.budgetMetricsRow}>
            {viewType === 'expense' ? (
              <>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{expSpentLabel}</Text>
                  <Text style={[styles.metricVal, selectedThemeColor && { color: selectedThemeColor }]}>
                    ₱{expSpentValue.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{expRemainingLabel}</Text>
                  <Text style={[styles.metricVal, { color: selectedThemeColor ?? colors.primary }]}>
                    ₱{expRemainingValue.toLocaleString()}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>{incSpentLabel}</Text>
                  <Text style={[styles.metricVal, selectedThemeColor && { color: selectedThemeColor }]}>
                    ₱{incSpentValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                {!selIncDef && (
                  <>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Sources</Text>
                      <Text style={[styles.metricVal, { color: colors.primary }]}>
                        {incomeActiveKeys.length}
                      </Text>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
        <Text style={styles.tapHint} pointerEvents="none">
          {donutSegments.length > 0 ? 'Tap or drag circle to explore' : 'No data for this period'}
        </Text>
      </Pressable>

      {/* ─── BY CATEGORY ─── */}
      <Text style={styles.sectionLabel}>By category</Text>
      <View style={{ marginBottom: 16 }}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : viewType === 'expense' ? (
          expenseCategoryKeys.length > 0
            ? expenseCategoryKeys.map((k) => renderExpenseCategoryRow(k))
            : <Text style={styles.emptyText}>No expense data for this period.</Text>
        ) : (
          INCOME_CATEGORIES.length > 0
            ? INCOME_CATEGORIES.map((c) => renderIncomeCategoryRow(c.key))
            : <Text style={styles.emptyText}>No income data for this period.</Text>
        )}
      </View>

      {/* ─── FINO INTELLIGENCE CARD ─── */}
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.insightWrap}
        onPress={() => navigation.navigate('ChatScreen')}
      >
        <LinearGradient
          colors={['#F0ECFD', '#EBF2EE']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.insightCard}
        >
          <View style={styles.insightAvatar}>
            <Text style={styles.insightAvatarIcon}>✦</Text>
          </View>
          <View style={styles.insightBody}>
            <Text style={styles.insightLabel}>Fino Intelligence</Text>
            <Text style={styles.insightHeadline}>You spend most on Tuesdays 🍜</Text>
            <Text style={styles.insightSub}>Food is 42% of weekly spend. Want to set a lower limit?</Text>
            <View style={styles.insightChip}>
              <Text style={styles.insightChipText}>Ask Fino →</Text>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* ─── MONTH PICKER ─── */}
      <MonthPickerModal
        visible={monthPickerVisible}
        year={selectedYear}
        month={selectedMonth}
        onConfirm={(y, m) => { setSelectedYear(y); setSelectedMonth(m); setMonthPickerVisible(false); setActiveDonutIndex(-1); }}
        onClose={() => setMonthPickerVisible(false)}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: 100 },

  header: { paddingTop: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontFamily: 'Nunito_700Bold', fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  headerSub: { fontSize: 13, color: '#6B6B7A' },

  // Green pill — matches Transactions screen
  monthPill: { backgroundColor: '#EFF8F2', borderWidth: 1, borderColor: '#2d6a4f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  monthPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#2d6a4f' },

  // Income/Expense toggle
  toggleRow: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#F0EFEA', borderRadius: 12, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  toggleBtnExpenseActive: { backgroundColor: '#C0503A' },
  toggleBtnIncomeActive: { backgroundColor: '#2d6a4f' },
  toggleBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.textSecondary },
  toggleBtnTextActive: { color: '#fff' },

  overallCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: 'rgba(30,30,46,0.08)', borderRadius: 24, padding: 20, marginBottom: 16, alignItems: 'center' },
  donutContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  donutCenterText: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutCenterPct: { fontFamily: 'Nunito_700Bold', fontSize: 28, fontWeight: '800' },
  donutCenterSub: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  budgetMetrics: { width: '100%', alignItems: 'center', marginBottom: 6 },
  budgetMetricsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', alignItems: 'center' },
  metricCol: { alignItems: 'center' },
  metricLabel: { fontSize: 11, color: '#6B6B7A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  metricVal: { fontFamily: 'DMMono_500Medium', fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  metricDivider: { width: 1, height: '100%', backgroundColor: 'rgba(30,30,46,0.08)' },
  tapHint: { marginTop: 12, fontSize: 11, color: '#A0A0AA', fontFamily: 'Inter_500Medium' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#6B6B7A', textTransform: 'uppercase', letterSpacing: 0.8, paddingVertical: 12 },
  loadingWrap: { paddingVertical: 16, alignItems: 'center' },
  loadingText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: colors.textSecondary },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },

  progRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  catIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  progRowContent: { flex: 1 },
  chevron: { fontSize: 20, color: 'rgba(30,30,46,0.2)', paddingLeft: 12, marginBottom: 8 },
  progHd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progName: { fontFamily: 'Nunito_700Bold', fontSize: 15, fontWeight: '700' },
  progMetaWrap: { flexDirection: 'row', alignItems: 'center' },
  progBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginRight: 6 },
  progBadgeText: { fontSize: 10, fontWeight: '700' },
  progMeta: { fontFamily: 'DMMono_400Regular', fontSize: 11, color: '#6B6B7A' },
  progTrack: { height: 6, backgroundColor: 'rgba(30,30,46,0.06)', borderRadius: 4, overflow: 'hidden' },
  progFillBar: { height: '100%', borderRadius: 4 },

  insightWrap: { marginBottom: 16 },
  insightCard: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(201,184,245,0.35)', padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  insightAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0ECFD', borderWidth: 1, borderColor: '#C9B8F5', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  insightAvatarIcon: { fontSize: 15, color: '#4B2DA3' },
  insightBody: { flex: 1 },
  insightLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#4B2DA3', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },
  insightHeadline: { fontFamily: 'Nunito_700Bold', fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
  insightSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 10 },
  insightChip: { alignSelf: 'flex-start', backgroundColor: '#F0ECFD', borderRadius: 20, borderWidth: 1, borderColor: '#C9B8F5', paddingVertical: 5, paddingHorizontal: 10 },
  insightChipText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#4B2DA3', textTransform: 'uppercase' },
});
