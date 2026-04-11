// src/screens/FeedScreen.tsx
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
  Animated,
  PanResponder,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  useTransactions,
  FeedTransaction,
  DateRange,
  SortOrder,
} from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  INCOME_CATEGORIES,
  CATEGORY_COLOR,
} from '@/constants/categoryMappings';
import { supabase } from '@/services/supabase';
import Toast from '../components/Toast';
import type { FeedStackParamList } from '../navigation/RootNavigator';
import { Skeleton } from '@/components/Skeleton';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPeso(n: number): string {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function tagBg(hex: string): string {
  return `${hex}20`;
}

function getMonthRange(year: number, month: number): DateRange {
  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
  return { from, to };
}

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

const SWIPE_DELETE_WIDTH = 80;

// ─── Swipeable row ───────────────────────────────────────────────────────────

function SwipeableRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const { colors, isDark } = useTheme();
  const swipeStyles = useMemo(
    () => createSwipeStyles(colors, isDark),
    [colors, isDark]
  );

  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        if (!isOpen.current && dx < 0) {
          translateX.setValue(Math.max(dx, -SWIPE_DELETE_WIDTH));
        } else if (isOpen.current && dx > 0) {
          translateX.setValue(Math.min(dx - SWIPE_DELETE_WIDTH, 0));
        }
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const shouldOpen = isOpen.current
          ? !(dx > SWIPE_DELETE_WIDTH / 2 || vx > 0.5)
          : dx < -SWIPE_DELETE_WIDTH / 2 || vx < -0.5;

        isOpen.current = shouldOpen;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -SWIPE_DELETE_WIDTH : 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }).start();
      },
    })
  ).current;

  const close = () => {
    isOpen.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  };

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={swipeStyles.deleteZone}>
        <TouchableOpacity
          style={swipeStyles.deleteBtn}
          activeOpacity={0.8}
          onPress={() => {
            close();
            onDelete();
          }}
        >
          <Ionicons name="trash" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
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

  React.useEffect(() => {
    if (visible) {
      setDraftYear(year);
      setDraftMonth(month);
    }
  }, [visible, year, month]);

  const prevMonth = () => {
    if (draftMonth === 0) {
      setDraftMonth(11);
      setDraftYear((y) => y - 1);
    } else {
      setDraftMonth((m) => m - 1);
    }
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
    } else {
      setDraftMonth((m) => m + 1);
    }
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

// ─── List item type ───────────────────────────────────────────────────────────

type ListItem =
  | { type: 'hero' }
  | { type: 'sticky' }
  | { type: 'controls' }
  | { type: 'header'; title: string }
  | { type: 'transaction'; data: FeedTransaction };

// ─── Main component ──────────────────────────────────────────────────────────

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<FeedStackParamList, 'FeedMain'>>();
  const insets = useSafeAreaInsets();
  // hero is index 0 in listData; search bar is index 1 (sticky via stickyHeaderIndices)

  // 🌙 Dynamic Theme Injection
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () => createStyles(colors, isDark, insets.top),
    [colors, isDark, insets.top]
  );

  // ── View type: expense or income ──
  const [viewType, setViewType] = useState<'expense' | 'income'>('expense');

  // ── Active category filter ──
  const [activeCategory, setActiveCategory] = useState(
    route.params?.filterCategory ?? 'All'
  );

  // ── Selected month/year ──
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // ── Toast for delete ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTitle, setToastTitle] = useState('');
  const [toastSubtitle, setToastSubtitle] = useState('');

  // ── Search & Advanced Filters ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filterAccountId, setFilterAccountId] = useState<string | undefined>(undefined);
  const [filterSortOrder, setFilterSortOrder] = useState<SortOrder>('date_desc');
  // draft state while panel is open
  const [draftAccountId, setDraftAccountId] = useState<string | undefined>(undefined);
  const [draftSortOrder, setDraftSortOrder] = useState<SortOrder>('date_desc');
  const [draftDatePreset, setDraftDatePreset] = useState<'month' | '30d' | '90d' | 'custom'>('month');
  const [filterDatePreset, setFilterDatePreset] = useState<'month' | '30d' | '90d' | 'custom'>('month');

  // ── Swipe hint ──
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const searchInputRef = useRef<TextInput>(null);

  const monthDateRange = useMemo(
    () => getMonthRange(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const dateRange: DateRange = useMemo(() => {
    if (filterDatePreset === '30d') {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (filterDatePreset === '90d') {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    return monthDateRange;
  }, [filterDatePreset, monthDateRange]);

  const hookCategory = activeCategory;
  const transactionType = viewType;

  const { sections, loading, loadMore, hasMore, loadingMore, refetch } =
    useTransactions(
      hookCategory,
      dateRange,
      searchQuery,
      filterAccountId,
      filterSortOrder,
      transactionType
    );

  const { categories } = useCategories();
  const { accounts } = useAccounts();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  React.useEffect(() => {
    setActiveCategory(route.params?.filterCategory ?? 'All');
  }, [route.params?.filterCategory]);

  // Reset category filter when switching tabs
  const handleViewTypeSwitch = (type: 'expense' | 'income') => {
    setViewType(type);
    setActiveCategory('All');
  };

  // ── Filter chip options ──
  const expenseFilterOptions = ['All', ...categories.map((c) => c.name)];
  const incomeFilterOptions = ['All', ...INCOME_CATEGORIES.map((c) => c.name)];
  const filterOptions =
    viewType === 'income' ? incomeFilterOptions : expenseFilterOptions;

  // ── Delete handler ──
  const handleDelete = async (tx: FeedTransaction) => {
    await supabase.from('transactions').delete().eq('id', tx.id);

    if (!tx.account_deleted) {
      const { data: acct } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', tx.account_id)
        .single();

      if (acct) {
        const restored =
          tx.type === 'expense'
            ? acct.balance + tx.amount
            : acct.balance - tx.amount;
        await supabase
          .from('accounts')
          .update({ balance: restored })
          .eq('id', tx.account_id);
      }
    }

    refetch();
    setToastTitle('Deleted');
    setToastSubtitle(
      `${tx.display_name ?? tx.category ?? 'Transaction'} has been removed`
    );
    setToastVisible(true);
  };

  const isAtMaxMonth =
    selectedYear > now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth());

  const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (isAtMaxMonth) return;
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // ── Apply / reset advanced filters ──
  const applyFilters = () => {
    setFilterAccountId(draftAccountId);
    setFilterSortOrder(draftSortOrder);
    setFilterDatePreset(draftDatePreset);
    setFilterPanelVisible(false);
  };

  const resetFilters = () => {
    setDraftAccountId(undefined);
    setDraftSortOrder('date_desc');
    setDraftDatePreset('month');
    setFilterAccountId(undefined);
    setFilterSortOrder('date_desc');
    setFilterDatePreset('month');
    setFilterPanelVisible(false);
  };

  const hasActiveFilters =
    filterAccountId !== undefined ||
    filterSortOrder !== 'date_desc' ||
    filterDatePreset !== 'month';

  // ── Per-account spending for the hero card ──
  const accountSpend = useMemo(() => {
    const map: Record<string, { name: string; colour: string; amount: number }> = {};
    sections
      .flatMap((s) => s.data)
      .filter((tx) => tx.type === viewType)
      .forEach((tx) => {
        if (!map[tx.account_id]) {
          map[tx.account_id] = {
            name: tx.account_name,
            colour: tx.account_brand_colour,
            amount: 0,
          };
        }
        map[tx.account_id].amount += tx.amount;
      });
    return Object.values(map);
  }, [sections, viewType]);

  const heroInfoTitle =
    viewType === 'expense' ? 'Spending by Account' : 'Income by Account';
  const heroInfoSubtitle = `${monthLabel} · ${accountSpend.length} account${
    accountSpend.length === 1 ? '' : 's'
  }`;
  const heroAmountLabel = viewType === 'expense' ? 'Spent' : 'Received';
  const heroAmountPrefix = viewType === 'expense' ? '-' : '+';

  // ── Flatten sections → FlatList items ──
  const listData: ListItem[] = [
    { type: 'hero' },
    { type: 'sticky' },
    { type: 'controls' },
    ...sections.flatMap((s) => [
      { type: 'header' as const, title: s.title },
      ...s.data.map((tx) => ({ type: 'transaction' as const, data: tx })),
    ]),
  ];

  const renderSkeletonList = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.dateHeaderContainer}>
        <Skeleton width={100} height={12} borderRadius={4} />
      </View>
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={`skel-tx-${i}`} style={styles.transactionItem}>
          <Skeleton
            width={44}
            height={44}
            borderRadius={22}
            style={{ marginRight: 14 }}
          />
          <View style={styles.txContent}>
            <Skeleton width={140} height={16} style={{ marginBottom: 6 }} />
            <View style={styles.txSubtitleRow}>
              <Skeleton width={40} height={12} />
              <View style={styles.metaDot} />
              <Skeleton width={60} height={16} borderRadius={4} />
            </View>
          </View>
          <Skeleton width={75} height={16} />
        </View>
      ))}
    </View>
  );

  // ── Render row ──
  const renderItem = ({ item }: { item: ListItem }) => {
    // ── Hero card (scrolls away) ──
    if (item.type === 'hero') {
      return (
        <LinearGradient
          colors={[colors.statsHeroBg1, colors.statsHeroBg2]}
          style={styles.heroCard}
        >
          <View style={styles.heroBlobOne} />
          <View style={styles.heroBlobTwo} />

          <View style={styles.heroTopRow}>
            <View style={styles.monthNavPill}>
              <TouchableOpacity style={styles.monthArrow} activeOpacity={0.75} onPress={handlePrevMonth}>
                <Ionicons name="chevron-back" size={14} color={colors.whiteTransparent80} />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.75} onPress={() => setMonthPickerVisible(true)}>
                <Text style={styles.monthNavLabel}>{monthLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.monthArrow, isAtMaxMonth && { opacity: 0.35 }]}
                activeOpacity={0.75}
                onPress={handleNextMonth}
                disabled={isAtMaxMonth}
              >
                <Ionicons name="chevron-forward" size={14} color={colors.whiteTransparent80} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroToggleWrap}>
              <TouchableOpacity
                style={[styles.heroToggleBtn, viewType === 'expense' && styles.heroToggleBtnActive]}
                activeOpacity={0.8}
                onPress={() => handleViewTypeSwitch('expense')}
              >
                <Text style={[styles.heroToggleText, viewType === 'expense' && styles.heroToggleTextActive]}>
                  Expenses
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroToggleBtn, viewType === 'income' && styles.heroToggleBtnActive]}
                activeOpacity={0.8}
                onPress={() => handleViewTypeSwitch('income')}
              >
                <Text style={[styles.heroToggleText, viewType === 'income' && styles.heroToggleTextActive]}>
                  Income
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.heroInfoHeader}>
            <Text style={styles.heroInfoTitle}>{heroInfoTitle}</Text>
            <Text style={styles.heroInfoSubtitle}>{heroInfoSubtitle}</Text>
          </View>

          {accountSpend.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.balanceCarousel}
            >
              {accountSpend.map((acc, i) => (
                <View key={i} style={styles.balanceCard}>
                  <View style={styles.balanceCardLabel}>
                    <View style={[styles.balanceCardDot, { backgroundColor: acc.colour }]} />
                    <Text style={styles.balanceCardLabelText}>{acc.name.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.balanceCardMeta}>{heroAmountLabel}</Text>
                  <Text style={styles.balanceCardAmount}>
                    {heroAmountPrefix}
                    {fmtPeso(acc.amount)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.heroEmptyHint}>No {viewType} transactions for this period</Text>
          )}
        </LinearGradient>
      );
    }

    // ── Sticky search bar ──
    if (item.type === 'sticky') {
      return (
        <View style={styles.stickyBar}>
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Search by name, amount…"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.filterTriggerBtn, hasActiveFilters && styles.filterTriggerBtnActive]}
              activeOpacity={0.8}
              onPress={() => {
                setDraftAccountId(filterAccountId);
                setDraftSortOrder(filterSortOrder);
                setDraftDatePreset(filterDatePreset);
                setFilterPanelVisible((v) => !v);
              }}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={hasActiveFilters ? colors.primary : colors.textSecondary}
              />
              {hasActiveFilters && <View style={styles.filterBadge} />}
            </TouchableOpacity>
          </View>

          {filterPanelVisible && (
            <View style={styles.filterPanel}>
              <View style={styles.filterPanelHeader}>
                <Text style={styles.filterPanelTitle}>Filters</Text>
                <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
                  <Text style={styles.filterResetText}>Reset all</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.filterSectionLabel}>Date Range</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['month', '30d', '90d', 'custom'] as const).map((preset) => {
                    const labels = { month: 'This Month', '30d': 'Last 30 Days', '90d': 'Last 3 Months', custom: 'Custom…' };
                    const isSelected = draftDatePreset === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (preset === 'custom') { setDraftDatePreset('custom'); setMonthPickerVisible(true); }
                          else { setDraftDatePreset(preset); }
                        }}
                      >
                        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>{labels[preset]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={styles.filterSectionLabel}>Account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.filterChip, draftAccountId === undefined && styles.filterChipSelected]}
                    activeOpacity={0.8}
                    onPress={() => setDraftAccountId(undefined)}
                  >
                    <Text style={[styles.filterChipText, draftAccountId === undefined && styles.filterChipTextSelected]}>All</Text>
                  </TouchableOpacity>
                  {accounts.map((acc) => {
                    const isSelected = draftAccountId === acc.id;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.filterChip, isSelected && { backgroundColor: `${acc.brand_colour}18`, borderColor: acc.brand_colour }]}
                        activeOpacity={0.8}
                        onPress={() => setDraftAccountId(isSelected ? undefined : acc.id)}
                      >
                        <Text style={[styles.filterChipText, isSelected && { color: acc.brand_colour }]}>{acc.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={styles.filterSectionLabel}>Sort By</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {([
                    { key: 'date_desc', label: 'Newest First' },
                    { key: 'date_asc', label: 'Oldest First' },
                    { key: 'amount_desc', label: 'Highest Amount' },
                  ] as { key: SortOrder; label: string }[]).map(({ key, label }) => {
                    const isSelected = draftSortOrder === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                        activeOpacity={0.8}
                        onPress={() => setDraftSortOrder(key)}
                      >
                        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.filterPanelActions}>
                <TouchableOpacity style={styles.filterCancelBtn} activeOpacity={0.7} onPress={() => setFilterPanelVisible(false)}>
                  <Text style={styles.filterCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterApplyBtn} activeOpacity={0.8} onPress={applyFilters}>
                  <Text style={styles.filterApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      );
    }

    // ── Toggle + chips + swipe hint (scrolls away with hero) ──
    if (item.type === 'controls') {
      if (loading) return renderSkeletonList();
      return (
        <View>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewType === 'expense' && styles.toggleBtnActive]}
              onPress={() => handleViewTypeSwitch('expense')}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleBtnText, viewType === 'expense' && styles.toggleBtnTextActive]}>Expenses</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewType === 'income' && styles.toggleBtnIncomeActive]}
              onPress={() => handleViewTypeSwitch('income')}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleBtnText, viewType === 'income' && styles.toggleBtnTextActive]}>Income</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterWrapper}>
            <FlatList
              data={filterOptions}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(it) => it}
              contentContainerStyle={{ paddingHorizontal: spacing.screenPadding }}
              renderItem={({ item: chip }) => {
                const isActive = activeCategory === chip;
                let activeBg = colors.primary;
                if (viewType === 'income' && chip !== 'All') {
                  const incCat = INCOME_CATEGORIES.find((c) => c.name === chip);
                  if (incCat) activeBg = CATEGORY_COLOR[incCat.key] ?? colors.primary;
                } else if (viewType === 'expense' && chip !== 'All') {
                  const expCat = categories.find((c) => c.name === chip);
                  if (expCat?.text_colour) activeBg = expCat.text_colour;
                }
                const catData = viewType === 'expense' && chip !== 'All'
                  ? categories.find((c) => c.name === chip) : null;
                const pct = catData && catData.budget_limit
                  ? Math.min((catData as any).spent / catData.budget_limit, 1) : 0;
                const ringColor = pct > 0.9 ? '#C0503A' : pct > 0.7 ? '#C97A20' : colors.primary;
                return (
                  <View style={{ position: 'relative', marginRight: 8 }}>
                    <TouchableOpacity
                      style={[isActive ? styles.chipActive : styles.chipInactive, isActive && { backgroundColor: activeBg }]}
                      onPress={() => setActiveCategory(chip)}
                      activeOpacity={0.8}
                    >
                      <Text style={isActive ? styles.chipTextActive : styles.chipTextInactive}>{chip}</Text>
                      {!isActive && pct > 0 && (
                        <View style={styles.chipProgressTrack}>
                          <View style={[styles.chipProgressFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: ringColor }]} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>

          {swipeHintVisible && totalEntries > 0 && (
            <View style={styles.swipeHint}>
              <Ionicons name="arrow-back-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.swipeHintText}>Swipe left on a transaction to delete</Text>
            </View>
          )}
        </View>
      );
    }

    if (item.type === 'header') {
      return (
        <View style={styles.dateHeaderContainer}>
          <Text style={styles.dateHeader}>{item.title.toUpperCase()}</Text>
        </View>
      );
    }

    const tx = item.data;
    const isExpense = tx.type === 'expense';

    // Icon + color resolution
    let iconKey = 'default';
    let iconColor = colors.textSecondary;

    if (isExpense) {
      const catData = categories.find(
        (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
      );
      iconKey = catData?.emoji ?? 'default';
      iconColor = catData?.text_colour ?? colors.textSecondary;
    } else {
      const incCat = INCOME_CATEGORIES.find(
        (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
      );
      iconKey = incCat?.key ?? 'default';
      iconColor = CATEGORY_COLOR[iconKey] ?? colors.incomeGreen;
    }

    const time = new Date(tx.date).toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <SwipeableRow onDelete={() => { setSwipeHintVisible(false); handleDelete(tx); }}>
        <Pressable
          onPress={() =>
            navigation.navigate('TransactionDetail', { id: tx.id })
          }
          style={({ pressed }) => [
            styles.transactionItem,
            pressed && {
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.05)'
                : colors.primaryLight,
            },
          ]}
        >
          <View style={{ marginRight: 14 }}>
            <CategoryIcon
              categoryKey={iconKey}
              color={iconColor}
              wrapperSize={44}
              size={24}
            />
          </View>

          <View style={styles.txContent}>
            <Text style={styles.txTitle} numberOfLines={1}>
              {tx.display_name ?? tx.merchant_name ?? tx.category ?? '—'}
            </Text>
            <View style={styles.txSubtitleRow}>
              <Text style={styles.txTime}>{time}</Text>
              <View style={styles.metaDot} />
              <View
                style={[
                  styles.acctTag,
                  { backgroundColor: tagBg(tx.account_brand_colour) },
                ]}
              >
                <Text
                  style={[
                    styles.acctTagText,
                    { color: tx.account_brand_colour },
                  ]}
                >
                  {tx.account_name}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.txAmount, isExpense ? styles.neg : styles.pos]}>
            {isExpense ? '-' : '+'}
            {fmtPeso(tx.amount)}
          </Text>
        </Pressable>
      </SwipeableRow>
    );
  };

  const totalEntries = sections.reduce((s, sec) => s + sec.data.length, 0);
  const listBottomPadding = Math.max(insets.bottom + 96, 120);

  return (
    <View style={styles.container}>
      {/* ─── SCREEN TITLE ROW — pinned ─── */}
      <View style={styles.screenTitleRow}>
        <Text style={styles.headerTitle}>Transactions</Text>
        <TouchableOpacity
          style={styles.notifBtn}
          activeOpacity={0.75}
          onPress={() => searchInputRef.current?.focus()}
        >
          <Ionicons name="search-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ─── SINGLE FLATLIST — hero scrolls away, search bar sticks ─── */}
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item, index) => {
          if (item.type === 'hero') return 'hero';
          if (item.type === 'sticky') return 'sticky';
          if (item.type === 'controls') return 'controls';
          if (item.type === 'header') return `header-${item.title}`;
          return `tx-${item.data.id}-${index}`;
        }}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
        ListEmptyComponent={null}
        ListFooterComponent={() =>
          !loading && listData.length > 3 && hasMore ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              activeOpacity={0.7}
              onPress={loadMore}
              disabled={loadingMore}
            >
              {loadingMore
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={styles.loadMoreText}>Load 20 more</Text>
              }
            </TouchableOpacity>
          ) : null
        }
      />

      {/* ─── MONTH PICKER MODAL ─── */}
      <MonthPickerModal
        visible={monthPickerVisible}
        year={selectedYear}
        month={selectedMonth}
        onConfirm={(y, m) => {
          setSelectedYear(y);
          setSelectedMonth(m);
          if (filterPanelVisible) setDraftDatePreset('custom');
          setMonthPickerVisible(false);
        }}
        onClose={() => setMonthPickerVisible(false)}
      />

      {/* ─── DELETE TOAST ─── */}
      <Toast
        visible={toastVisible}
        title={toastTitle}
        subtitle={toastSubtitle}
        type="undo"
        onDismiss={() => setToastVisible(false)}
      />
    </View>
  );
}

// ─── DYNAMIC STYLES ──────────────────────────────────────────────────────────

const createSwipeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    deleteZone: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: SWIPE_DELETE_WIDTH,
      backgroundColor: colors.expenseRed,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteBtn: {
      width: SWIPE_DELETE_WIDTH,
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

const createPickerStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
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
      color: '#FFFFFF',
    },
  });

const createStyles = (colors: any, isDark: boolean, topInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Math.max(topInset + 8, 20),
    },

    // ── StatsScreen-style title row ──
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
      backgroundColor: isDark ? colors.blackTransparent15 : 'rgba(30,30,46,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
    },

    // ── Hero card ──
    heroClipper: {
      marginHorizontal: spacing.screenPadding,
      borderRadius: 28,
      overflow: 'hidden',
    },
    heroCard: {
      borderRadius: 28,
      padding: 20,
      marginHorizontal: spacing.screenPadding,
      marginBottom: 0,
      overflow: 'hidden',
      shadowColor: colors.statsHeroBg2 ?? '#1a3028',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.45,
      shadowRadius: 28,
      elevation: 8,
    },
    heroBlobOne: {
      position: 'absolute',
      width: 160, height: 160,
      borderRadius: 80,
      top: -30, right: -20,
      backgroundColor: colors.primaryTransparent30,
    },
    heroBlobTwo: {
      position: 'absolute',
      width: 110, height: 110,
      borderRadius: 55,
      left: -20, bottom: 44,
      backgroundColor: colors.primaryTransparent30,
      opacity: 0.6,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
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
      width: 28, height: 28,
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
    heroToggleBtnActive: { backgroundColor: colors.whiteTransparent18 },
    heroToggleText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.whiteTransparent55,
    },
    heroToggleTextActive: { color: colors.whiteTransparent80 },

    heroInfoHeader: {
      marginTop: 2,
      marginBottom: 10,
      zIndex: 2,
    },
    heroInfoTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.whiteTransparent80,
      marginBottom: 1,
    },
    heroInfoSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.whiteTransparent55,
    },

    // ── Balance carousel ──
    balanceCarousel: { gap: 8 },
    balanceCard: {
      minWidth: 100,
      backgroundColor: colors.whiteTransparent10 ?? 'rgba(255,255,255,0.10)',
      borderWidth: 1,
      borderColor: colors.whiteTransparent15 ?? 'rgba(255,255,255,0.15)',
      borderRadius: 14,
      padding: 10,
    },
    balanceCardLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 4,
    },
    balanceCardDot: { width: 6, height: 6, borderRadius: 3 },
    balanceCardLabelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: colors.whiteTransparent55 ?? 'rgba(255,255,255,0.55)',
      letterSpacing: 0.5,
    },
    balanceCardMeta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 10,
      color: colors.whiteTransparent55 ?? 'rgba(255,255,255,0.55)',
      marginBottom: 2,
    },
    balanceCardAmount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.whiteTransparent80 ?? 'rgba(255,255,255,0.90)',
    },

    // ── Hero metric row ──
    heroMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 2,
    },
    heroMetricCol: { flex: 1 },
    heroMetricLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.whiteTransparent55 ?? 'rgba(255,255,255,0.55)',
      marginBottom: 3,
    },
    heroMetricVal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 17,
      color: colors.whiteTransparent80 ?? 'rgba(255,255,255,0.90)',
    },
    heroMetricDivider: {
      width: 1,
      height: 32,
      backgroundColor: colors.whiteTransparent15 ?? 'rgba(255,255,255,0.15)',
      marginHorizontal: 12,
    },

    // ── Budget bar ──
    budgetBarTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.whiteTransparent15 ?? 'rgba(255,255,255,0.15)',
      overflow: 'hidden',
    },
    budgetBarFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.65)',
    },
    budgetBarHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.whiteTransparent55 ?? 'rgba(255,255,255,0.45)',
      marginTop: 5,
      textAlign: 'right',
    },

    // ── Savings badge ──
    savingsBadge: {
      marginTop: 12,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(106,200,140,0.20)',
      borderWidth: 1,
      borderColor: 'rgba(106,200,140,0.30)',
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    savingsBadgeText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: '#7ED8A0',
    },

    // ── Sticky search wrapper ──
    stickyBar: {
      backgroundColor: colors.background,
      paddingTop: 10,
    },

    // ── Search bar ──
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.screenPadding,
      marginBottom: 12,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textPrimary,
      padding: 0,
    },
    filterTriggerBtn: {
      width: 44, height: 44,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterTriggerBtnActive: {
      backgroundColor: colors.primaryLight ?? '#EBF2EE',
      borderColor: colors.primary,
    },
    filterBadge: {
      position: 'absolute',
      top: 8, right: 8,
      width: 7, height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },

    // ── Advanced filter panel ──
    filterPanel: {
      marginHorizontal: spacing.screenPadding,
      marginBottom: 14,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      borderRadius: 18,
      padding: 16,
    },
    filterPanelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    filterPanelTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 15,
      color: colors.textPrimary,
    },
    filterResetText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    filterSectionLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      backgroundColor: isDark ? '#1E1E1E' : '#F7F5F2',
    },
    filterChipSelected: {
      backgroundColor: colors.primaryLight ?? '#EBF2EE',
      borderColor: colors.primary,
    },
    filterChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    filterChipTextSelected: { color: colors.primary },
    filterPanelActions: { flexDirection: 'row', gap: 8 },
    filterCancelBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      alignItems: 'center',
    },
    filterCancelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    filterApplyBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    filterApplyText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#FFFFFF',
    },

    // ── Expense / Income toggle ──
    toggleRow: {
      flexDirection: 'row',
      marginHorizontal: spacing.screenPadding,
      marginBottom: 12,
      backgroundColor: isDark ? '#2A2A2A' : '#F0EFEA',
      borderRadius: 12,
      padding: 3,
    },
    toggleBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
    },
    toggleBtnActive: { backgroundColor: colors.expenseRed },
    toggleBtnIncomeActive: { backgroundColor: colors.incomeGreen },
    toggleBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    toggleBtnTextActive: { color: '#FFFFFF' },

    // ── Hero empty hint ──
    heroEmptyHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: 'rgba(255,255,255,0.45)',
      marginTop: 4,
      marginBottom: 4,
    },

    // ── Category filter chips ──
    filterWrapper: { height: 36, marginBottom: 16 },
    chipActive: {
      paddingHorizontal: 16,
      height: 34,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    chipInactive: {
      paddingHorizontal: 16,
      height: 34,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      overflow: 'hidden',
    },
    chipTextActive: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#FFFFFF',
    },
    chipTextInactive: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    chipProgressTrack: {
      position: 'absolute',
      left: 7,
      right: 7,
      bottom: 4,
      height: 2,
      borderRadius: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
      overflow: 'hidden',
    },
    chipProgressFill: {
      height: '100%',
      borderRadius: 1,
    },

    // ── Swipe hint ──
    swipeHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.screenPadding,
      paddingBottom: 8,
    },
    swipeHintText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
    },

    // ── Transaction list ──
    dateHeaderContainer: {
      backgroundColor: colors.background,
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 16,
      paddingBottom: 8,
    },
    dateHeader: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.44,
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.screenPadding,
      paddingVertical: 12,
      minHeight: 44,
      backgroundColor: colors.background,
    },
    txContent: { flex: 1, justifyContent: 'center' },
    txTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    txSubtitleRow: { flexDirection: 'row', alignItems: 'center' },
    txTime: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.textSecondary,
      marginHorizontal: 6,
    },
    acctTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    acctTagText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    txAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
    pos: { color: colors.incomeGreen },
    neg: { color: colors.expenseRed },

    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 60,
    },
    loadMoreBtn: {
      backgroundColor: colors.white,
      marginHorizontal: spacing.screenPadding,
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: radius.card,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
    },
    loadMoreText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.primary,
    },
  });
