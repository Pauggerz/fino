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
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../constants/theme';
import {
  useTransactions,
  FeedTransaction,
  DateRange,
} from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  INCOME_CATEGORIES,
  CATEGORY_COLOR,
} from '@/constants/categoryMappings';
import { supabase } from '@/services/supabase';
import Toast from '../components/Toast';
import type { FeedStackParamList } from '../navigation/RootNavigator';
import { Skeleton } from '@/components/Skeleton'; // <-- Added Skeleton Import

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
          <Ionicons name="trash" size={22} color="#fff" />
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

const swipeStyles = StyleSheet.create({
  deleteZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_DELETE_WIDTH,
    backgroundColor: '#E53935',
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

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
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
    backgroundColor: '#F7F5F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0dfd7',
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

// ─── List item type ───────────────────────────────────────────────────────────

type ListItem =
  | { type: 'header'; title: string }
  | { type: 'transaction'; data: FeedTransaction };

// ─── Main component ──────────────────────────────────────────────────────────

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<FeedStackParamList, 'FeedMain'>>();

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

  const dateRange = useMemo(
    () => getMonthRange(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  // Build effective category filter for the hook
  let hookCategory = activeCategory;
  if (viewType === 'income' && activeCategory === 'All') {
    hookCategory = 'Income';
  }

  const { sections, loading, loadMore, hasMore, loadingMore, refetch } =
    useTransactions(hookCategory, dateRange);

  const { categories } = useCategories();

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

  // ── Flatten sections → FlatList items ──
  const listData: ListItem[] = sections.flatMap((s) => [
    { type: 'header', title: s.title },
    ...s.data.map((tx) => ({ type: 'transaction' as const, data: tx })),
  ]);

  // 👇 Render Skeleton Rows when Loading 👇
  const renderSkeletonList = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.dateHeaderContainer}>
        <Skeleton width={100} height={12} borderRadius={4} />
      </View>
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={`skel-tx-${i}`} style={styles.transactionItem}>
          <Skeleton width={44} height={44} borderRadius={22} style={{ marginRight: 14 }} />
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
    let iconColor = '#888780';

    if (isExpense) {
      const catData = categories.find(
        (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
      );
      iconKey = catData?.emoji ?? 'default';
      iconColor = catData?.text_colour ?? '#888780';
    } else {
      const incCat = INCOME_CATEGORIES.find(
        (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
      );
      iconKey = incCat?.key ?? 'default';
      iconColor = CATEGORY_COLOR[iconKey] ?? '#2d6a4f';
    }

    const time = new Date(tx.date).toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <SwipeableRow onDelete={() => handleDelete(tx)}>
        <Pressable
          onPress={() =>
            navigation.navigate('TransactionDetail', { id: tx.id })
          }
          style={({ pressed }) => [
            styles.transactionItem,
            pressed && { backgroundColor: colors.primaryLight },
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

  const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
  const totalEntries = sections.reduce((s, sec) => s + sec.data.length, 0);

  return (
    <View style={styles.container}>
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Transactions</Text>
          <Text style={styles.headerSubtitle}>
            {monthLabel} · {totalEntries} entries
          </Text>
        </View>
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
          style={[
            styles.toggleBtn,
            viewType === 'expense' && styles.toggleBtnActive,
          ]}
          onPress={() => handleViewTypeSwitch('expense')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.toggleBtnText,
              viewType === 'expense' && styles.toggleBtnTextActive,
            ]}
          >
            Expenses
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            viewType === 'income' && styles.toggleBtnIncomeActive,
          ]}
          onPress={() => handleViewTypeSwitch('income')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.toggleBtnText,
              viewType === 'income' && styles.toggleBtnTextActive,
            ]}
          >
            Income
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── FILTER CHIPS ─── */}
      <View style={styles.filterWrapper}>
        <FlatList
          data={filterOptions}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding }}
          renderItem={({ item }) => {
            const isActive = activeCategory === item;

            // Resolve chip accent color for income categories
            let activeBg = colors.primary;
            const activeText = colors.white;
            if (viewType === 'income' && item !== 'All') {
              const incCat = INCOME_CATEGORIES.find((c) => c.name === item);
              if (incCat) {
                activeBg = CATEGORY_COLOR[incCat.key] ?? colors.primary;
              }
            }

            return (
              <TouchableOpacity
                style={[
                  isActive ? styles.chipActive : styles.chipInactive,
                  isActive && { backgroundColor: activeBg },
                ]}
                onPress={() => setActiveCategory(item)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    isActive ? styles.chipTextActive : styles.chipTextInactive,
                    isActive && { color: activeText },
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ─── TRANSACTION LIST ─── */}
      <View style={{ flex: 1 }}>
        {loading ? (
          // 👇 Replaced ActivityIndicator with Skeleton Rows 👇
          renderSkeletonList()
        ) : (
          <FlatList
            data={listData}
            renderItem={renderItem}
            keyExtractor={(item, index) =>
              item.type === 'header'
                ? `header-${item.title}`
                : `tx-${item.data.id}-${index}`
            }
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No transactions found.</Text>
            }
            ListFooterComponent={() =>
              listData.length > 0 && hasMore ? (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  activeOpacity={0.7}
                  onPress={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>Load 20 more</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
        )}
      </View>

      {/* ─── MONTH PICKER MODAL ─── */}
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

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  monthPill: {
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: '#2d6a4f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  monthPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#2d6a4f',
  },
  // ── Income/Expense toggle ──
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.screenPadding,
    marginBottom: 12,
    backgroundColor: '#F0EFEA',
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#C0503A',
  },
  toggleBtnIncomeActive: {
    backgroundColor: '#2d6a4f',
  },
  toggleBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  // ── Filter chips ──
  filterWrapper: {
    height: 36,
    marginBottom: 16,
  },
  chipActive: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: colors.primary,
  },
  chipInactive: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#e0dfd7',
  },
  chipTextActive: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.white,
  },
  chipTextInactive: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
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
  txContent: {
    flex: 1,
    justifyContent: 'center',
  },
  txTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  txSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#B4B2A9',
    marginHorizontal: 6,
  },
  acctTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  acctTagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  txAmount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 14,
  },
  pos: {
    color: colors.incomeGreen,
  },
  neg: {
    color: '#C0503A',
  },
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
    borderColor: 'rgba(45, 106, 79, 0.1)',
  },
  loadMoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#2d6a4f',
  },
});