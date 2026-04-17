// src/screens/FeedScreen.tsx
import React, { useState, useRef, useCallback, useMemo, useTransition } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
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
import { useDeferredRender } from '@/hooks/useDeferredRender';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

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
  swipeStyles,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  swipeStyles: ReturnType<typeof createSwipeStyles>;
}) {
  const swipeableRef = useRef<any>(null);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const handleDeletePress = useCallback(() => {
    swipeableRef.current?.close();
    onDelete();
  }, [onDelete]);

  const renderRightActions = useCallback(
    () => (
      <View style={swipeStyles.deleteZone}>
        <TouchableOpacity
          style={swipeStyles.deleteBtn}
          activeOpacity={0.8}
          onPress={handleDeletePress}
        >
          <Ionicons name="trash" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    ),
    [handleDeletePress, swipeStyles]
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      overshootRight={false}
      rightThreshold={SWIPE_DELETE_WIDTH * 0.55}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={handleOpen}
      containerStyle={swipeStyles.swipeContainer}
    >
      <View style={swipeStyles.rowContent}>
        {children}
      </View>
    </ReanimatedSwipeable>
  );
}

const MemoizedSwipeableRow = React.memo(SwipeableRow);

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

type DatePreset = 'month' | '30d' | '90d' | 'custom';

type FeedListItemContext = {
  colors: any;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
  swipeStyles: ReturnType<typeof createSwipeStyles>;
  navigation: any;
  monthLabel: string;
  isAtMaxMonth: boolean;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  onOpenMonthPicker: () => void;
  viewType: 'expense' | 'income';
  onSwitchViewType: (type: 'expense' | 'income') => void;
  searchInputRef: React.RefObject<TextInput | null>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  hasActiveFilters: boolean;
  onToggleFilterPanel: () => void;
  filterPanelVisible: boolean;
  resetFilters: () => void;
  draftDatePreset: DatePreset;
  setDraftDatePreset: (preset: DatePreset) => void;
  draftAccountId?: string;
  setDraftAccountId: (id: string | undefined) => void;
  accounts: any[];
  draftSortOrder: SortOrder;
  setDraftSortOrder: (value: SortOrder) => void;
  applyFilters: () => void;
  closeFilterPanel: () => void;
  filterOptions: string[];
  activeCategory: string;
  setActiveCategory: (value: string) => void;
  loading: boolean;
  totalEntries: number;
  swipeHintVisible: boolean;
  sectionsLength: number;
  accountSpend: { name: string; colour: string; amount: number }[];
  heroInfoTitle: string;
  heroInfoSubtitle: string;
  heroAmountLabel: string;
  heroAmountPrefix: string;
  categories: any[];
  onDeleteTransaction: (tx: FeedTransaction) => void;
};

const FeedSkeletonList = React.memo(function FeedSkeletonList({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  return (
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
});

const FeedListItem = React.memo(function FeedListItem({
  item,
  ctx,
}: {
  item: ListItem;
  ctx: FeedListItemContext;
}) {
  if (item.type === 'hero') {
    return (
      <LinearGradient
        colors={[ctx.colors.statsHeroBg1, ctx.colors.statsHeroBg2]}
        style={ctx.styles.heroCard}
      >
        <LinearGradient
          colors={[ctx.colors.primaryLight60, 'transparent']}
          style={[
            ctx.styles.heroBlob,
            { top: -30, right: -20, width: 160, height: 160 },
          ]}
        />
        <LinearGradient
          colors={[ctx.colors.primaryTransparent50, 'transparent']}
          style={[
            ctx.styles.heroBlob,
            { bottom: 44, left: -20, width: 110, height: 110, opacity: 0.6 },
          ]}
        />

        <View style={ctx.styles.heroTopRow}>
          <View style={ctx.styles.monthNavPill}>
            <TouchableOpacity
              style={ctx.styles.monthArrow}
              activeOpacity={0.75}
              onPress={ctx.handlePrevMonth}
            >
              <Ionicons
                name="chevron-back"
                size={14}
                color={ctx.colors.whiteTransparent80}
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75} onPress={ctx.onOpenMonthPicker}>
              <Text style={ctx.styles.monthNavLabel}>{ctx.monthLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ctx.styles.monthArrow, ctx.isAtMaxMonth && { opacity: 0.35 }]}
              activeOpacity={0.75}
              onPress={ctx.handleNextMonth}
              disabled={ctx.isAtMaxMonth}
            >
              <Ionicons
                name="chevron-forward"
                size={14}
                color={ctx.colors.whiteTransparent80}
              />
            </TouchableOpacity>
          </View>

          <View style={ctx.styles.heroTypeChip}>
            <Ionicons
              name={ctx.viewType === 'expense' ? 'trending-down' : 'trending-up'}
              size={12}
              color={
                ctx.viewType === 'expense'
                  ? ctx.colors.expenseRed
                  : ctx.colors.incomeGreen
              }
            />
            <Text
              style={[
                ctx.styles.heroTypeChipText,
                {
                  color:
                    ctx.viewType === 'expense'
                      ? ctx.colors.expenseRed
                      : ctx.colors.incomeGreen,
                },
              ]}
            >
              {ctx.viewType === 'expense' ? 'Expenses' : 'Income'}
            </Text>
          </View>
        </View>

        <View style={ctx.styles.heroInfoHeader}>
          <Text style={ctx.styles.heroInfoTitle}>{ctx.heroInfoTitle}</Text>
          <Text style={ctx.styles.heroInfoSubtitle}>{ctx.heroInfoSubtitle}</Text>
        </View>

        {ctx.accountSpend.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={ctx.styles.balanceCarousel}
          >
            {ctx.accountSpend.map((acc, i) => (
              <View key={`${acc.name}-${i}`} style={ctx.styles.balanceCard}>
                <View style={ctx.styles.balanceCardLabel}>
                  <View
                    style={[
                      ctx.styles.balanceCardDot,
                      { backgroundColor: acc.colour },
                    ]}
                  />
                  <Text style={ctx.styles.balanceCardLabelText}>
                    {acc.name.toUpperCase()}
                  </Text>
                </View>
                <Text style={ctx.styles.balanceCardMeta}>{ctx.heroAmountLabel}</Text>
                <Text style={ctx.styles.balanceCardAmount}>
                  {ctx.heroAmountPrefix}
                  {fmtPeso(acc.amount)}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={ctx.styles.heroEmptyHint}>
            No {ctx.viewType} transactions for this period
          </Text>
        )}
      </LinearGradient>
    );
  }

  if (item.type === 'sticky') {
    return (
      <View style={ctx.styles.stickyBar}>
        <View style={ctx.styles.segmentRow}>
          <TouchableOpacity
            style={[
              ctx.styles.segmentBtn,
              ctx.viewType === 'expense' && ctx.styles.segmentBtnExpenseActive,
            ]}
            onPress={() => ctx.onSwitchViewType('expense')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                ctx.styles.segmentText,
                ctx.viewType === 'expense' && ctx.styles.segmentTextActive,
              ]}
            >
              Expenses
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              ctx.styles.segmentBtn,
              ctx.viewType === 'income' && ctx.styles.segmentBtnIncomeActive,
            ]}
            onPress={() => ctx.onSwitchViewType('income')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                ctx.styles.segmentText,
                ctx.viewType === 'income' && ctx.styles.segmentTextActive,
              ]}
            >
              Income
            </Text>
          </TouchableOpacity>
        </View>

        <View style={ctx.styles.searchRow}>
          <View style={ctx.styles.searchBar}>
            <Ionicons
              name="search-outline"
              size={16}
              color={ctx.colors.textSecondary}
            />
            <TextInput
              ref={ctx.searchInputRef}
              style={ctx.styles.searchInput}
              placeholder="Search by name, amount…"
              placeholderTextColor={ctx.colors.textSecondary}
              value={ctx.searchQuery}
              onChangeText={ctx.setSearchQuery}
              returnKeyType="search"
            />
            {ctx.searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => ctx.setSearchQuery('')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={ctx.colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              ctx.styles.filterTriggerBtn,
              ctx.hasActiveFilters && ctx.styles.filterTriggerBtnActive,
            ]}
            activeOpacity={0.8}
            onPress={ctx.onToggleFilterPanel}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={
                ctx.hasActiveFilters ? ctx.colors.primary : ctx.colors.textSecondary
              }
            />
            {ctx.hasActiveFilters && <View style={ctx.styles.filterBadge} />}
          </TouchableOpacity>
        </View>

        {ctx.filterPanelVisible && (
          <View style={ctx.styles.filterPanel}>
            <View style={ctx.styles.filterPanelHeader}>
              <Text style={ctx.styles.filterPanelTitle}>Filters</Text>
              <TouchableOpacity onPress={ctx.resetFilters} activeOpacity={0.7}>
                <Text style={ctx.styles.filterResetText}>Reset all</Text>
              </TouchableOpacity>
            </View>

            <Text style={ctx.styles.filterSectionLabel}>Date Range</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['month', '30d', '90d', 'custom'] as const).map((preset) => {
                  const labels = {
                    month: 'This Month',
                    '30d': 'Last 30 Days',
                    '90d': 'Last 3 Months',
                    custom: 'Custom…',
                  };
                  const isSelected = ctx.draftDatePreset === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        ctx.styles.filterChip,
                        isSelected && ctx.styles.filterChipSelected,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (preset === 'custom') {
                          ctx.setDraftDatePreset('custom');
                          ctx.onOpenMonthPicker();
                        } else {
                          ctx.setDraftDatePreset(preset);
                        }
                      }}
                    >
                      <Text
                        style={[
                          ctx.styles.filterChipText,
                          isSelected && ctx.styles.filterChipTextSelected,
                        ]}
                      >
                        {labels[preset]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={ctx.styles.filterSectionLabel}>Account</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[
                    ctx.styles.filterChip,
                    ctx.draftAccountId === undefined && ctx.styles.filterChipSelected,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => ctx.setDraftAccountId(undefined)}
                >
                  <Text
                    style={[
                      ctx.styles.filterChipText,
                      ctx.draftAccountId === undefined &&
                        ctx.styles.filterChipTextSelected,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {ctx.accounts.map((acc) => {
                  const isSelected = ctx.draftAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        ctx.styles.filterChip,
                        isSelected && {
                          backgroundColor: `${acc.brand_colour}18`,
                          borderColor: acc.brand_colour,
                        },
                      ]}
                      activeOpacity={0.8}
                      onPress={() =>
                        ctx.setDraftAccountId(isSelected ? undefined : acc.id)
                      }
                    >
                      <Text
                        style={[
                          ctx.styles.filterChipText,
                          isSelected && { color: acc.brand_colour },
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={ctx.styles.filterSectionLabel}>Sort By</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {([
                  { key: 'date_desc', label: 'Newest First' },
                  { key: 'date_asc', label: 'Oldest First' },
                  { key: 'amount_desc', label: 'Highest Amount' },
                ] as { key: SortOrder; label: string }[]).map(({ key, label }) => {
                  const isSelected = ctx.draftSortOrder === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        ctx.styles.filterChip,
                        isSelected && ctx.styles.filterChipSelected,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => ctx.setDraftSortOrder(key)}
                    >
                      <Text
                        style={[
                          ctx.styles.filterChipText,
                          isSelected && ctx.styles.filterChipTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={ctx.styles.filterPanelActions}>
              <TouchableOpacity
                style={ctx.styles.filterCancelBtn}
                activeOpacity={0.7}
                onPress={ctx.closeFilterPanel}
              >
                <Text style={ctx.styles.filterCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ctx.styles.filterApplyBtn}
                activeOpacity={0.8}
                onPress={ctx.applyFilters}
              >
                <Text style={ctx.styles.filterApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (item.type === 'controls') {
    if (ctx.loading) {
      return <FeedSkeletonList styles={ctx.styles} />;
    }

    return (
      <View>
        <View style={ctx.styles.filterWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.screenPadding }}
          >
            {ctx.filterOptions.map((chip) => {
              const isActive = ctx.activeCategory === chip;
              let activeBg = ctx.colors.primary;
              if (ctx.viewType === 'income' && chip !== 'All') {
                const incCat = INCOME_CATEGORIES.find((c) => c.name === chip);
                if (incCat) {
                  activeBg = CATEGORY_COLOR[incCat.key] ?? ctx.colors.primary;
                }
              } else if (ctx.viewType === 'expense' && chip !== 'All') {
                const expCat = ctx.categories.find((c) => c.name === chip);
                if (expCat?.text_colour) {
                  activeBg = expCat.text_colour;
                }
              }

              return (
                <TouchableOpacity
                  key={chip}
                  style={[
                    isActive ? ctx.styles.chipActive : ctx.styles.chipInactive,
                    isActive && { backgroundColor: activeBg },
                  ]}
                  onPress={() => ctx.setActiveCategory(chip)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={
                      isActive
                        ? ctx.styles.chipTextActive
                        : ctx.styles.chipTextInactive
                    }
                  >
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {ctx.swipeHintVisible && ctx.totalEntries > 0 && (
          <View style={ctx.styles.swipeHint}>
            <Ionicons
              name="arrow-back-outline"
              size={12}
              color={ctx.colors.textSecondary}
            />
            <Text style={ctx.styles.swipeHintText}>
              Swipe left on a transaction to delete
            </Text>
          </View>
        )}

        {!ctx.loading && ctx.sectionsLength === 0 && (
          <View style={ctx.styles.emptyState}>
            {/* Branded receipt illustration */}
            <Svg width={56} height={64} viewBox="0 0 56 64" style={{ opacity: 0.55 }}>
              {/* Receipt body */}
              <SvgPath d="M6 2 L50 2 L50 58 L44 54 L38 58 L32 54 L26 58 L20 54 L14 58 L8 54 L6 58 Z" fill={ctx.colors.primary} opacity={0.12} stroke={ctx.colors.primary} strokeWidth="1.5" />
              {/* Lines */}
              <SvgPath d="M14 16 H42" stroke={ctx.colors.textSecondary} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
              <SvgPath d="M14 24 H36" stroke={ctx.colors.textSecondary} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
              <SvgPath d="M14 32 H39" stroke={ctx.colors.textSecondary} strokeWidth="2" strokeLinecap="round" opacity="0.25" />
              {/* Amount */}
              <SvgPath d="M14 42 H28" stroke={ctx.colors.primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
              <SvgPath d="M34 42 H42" stroke={ctx.colors.primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            </Svg>
            <Text style={ctx.styles.emptyStateTitle}>No transactions</Text>
            <Text style={ctx.styles.emptyStateText}>
              {ctx.searchQuery.length > 0
                ? 'No results for your search.'
                : 'No transactions recorded for this period.'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (item.type === 'header') {
    return (
      <View style={ctx.styles.dateHeaderContainer}>
        <Text style={ctx.styles.dateHeader}>{item.title}</Text>
      </View>
    );
  }

  const tx = item.data;
  const isExpense = tx.type === 'expense';

  let iconKey = 'default';
  let iconColor = ctx.colors.textSecondary;

  if (isExpense) {
    const catData = ctx.categories.find(
      (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
    );
    iconKey = catData?.emoji ?? 'default';
    iconColor = catData?.text_colour ?? ctx.colors.textSecondary;
  } else {
    const incCat = INCOME_CATEGORIES.find(
      (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
    );
    iconKey = incCat?.key ?? 'default';
    iconColor = CATEGORY_COLOR[iconKey] ?? ctx.colors.incomeGreen;
  }

  const time = new Date(tx.date).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <MemoizedSwipeableRow
      swipeStyles={ctx.swipeStyles}
      onDelete={() => ctx.onDeleteTransaction(tx)}
    >
      <Pressable
        onPress={() => ctx.navigation.navigate('TransactionDetail', { id: tx.id })}
        style={({ pressed }) => [
          ctx.styles.transactionItem,
          pressed && {
            backgroundColor: ctx.isDark
              ? 'rgba(255,255,255,0.05)'
              : ctx.colors.primaryLight,
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

        <View style={ctx.styles.txContent}>
          <Text style={ctx.styles.txTitle} numberOfLines={1}>
            {tx.display_name ?? tx.merchant_name ?? tx.category ?? '—'}
          </Text>
          <View style={ctx.styles.txSubtitleRow}>
            <Text style={ctx.styles.txTime}>{time}</Text>
            <View style={ctx.styles.metaDot} />
            <View
              style={[
                ctx.styles.acctTag,
                { backgroundColor: tagBg(tx.account_brand_colour) },
              ]}
            >
              <Text
                style={[
                  ctx.styles.acctTagText,
                  { color: tx.account_brand_colour },
                ]}
              >
                {tx.account_name}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[ctx.styles.txAmount, isExpense ? ctx.styles.neg : ctx.styles.pos]}>
          {isExpense ? '-' : '+'}
          {fmtPeso(tx.amount)}
        </Text>
      </Pressable>
    </MemoizedSwipeableRow>
  );
});

// ─── Main component ──────────────────────────────────────────────────────────

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<FeedStackParamList, 'FeedMain'>>();
  const insets = useSafeAreaInsets();
  const [, startTransition] = useTransition();
  // hero is index 0 in listData; search bar is index 1 (sticky via stickyHeaderIndices)

  // 🌙 Dynamic Theme Injection
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () => createStyles(colors, isDark, insets.top),
    [colors, isDark, insets.top]
  );
  const swipeStyles = useMemo(
    () => createSwipeStyles(colors, isDark),
    [colors, isDark]
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
  const [filterAccountId, setFilterAccountId] = useState<string | undefined>(
    route.params?.filterAccount ?? undefined
  );
  const [filterSortOrder, setFilterSortOrder] = useState<SortOrder>(
    (route.params?.filterSortOrder as SortOrder | undefined) ?? 'date_desc'
  );
  // draft state while panel is open
  const [draftAccountId, setDraftAccountId] = useState<string | undefined>(undefined);
  const [draftSortOrder, setDraftSortOrder] = useState<SortOrder>('date_desc');
  const [draftDatePreset, setDraftDatePreset] = useState<'month' | '30d' | '90d' | 'custom'>('month');
  const [filterDatePreset, setFilterDatePreset] = useState<'month' | '30d' | '90d' | 'custom'>('month');

  // ── Swipe hint ──
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const searchInputRef = useRef<TextInput>(null);

  // ── Entrance animation ────────────────────────────────────────────────────
  const headerOpacity = useSharedValue(0);
  const headerTransY = useSharedValue(-8);
  const listOpacity = useSharedValue(0);
  const listTransY = useSharedValue(16);

  const headerAnim = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTransY.value }],
  }));
  const listAnim = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
    transform: [{ translateY: listTransY.value }],
  }));

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

  const hasAnimated = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        hasAnimated.current = true;
        headerOpacity.value = 0; headerTransY.value = -8;
        listOpacity.value = 0;   listTransY.value = 16;
        headerOpacity.value = withTiming(1, { duration: 260 });
        headerTransY.value  = withTiming(0, { duration: 260 });
        listOpacity.value   = withDelay(60, withTiming(1, { duration: 320 }));
        listTransY.value    = withDelay(60, withSpring(0, { damping: 18, stiffness: 180 }));
      }
      startTransition(() => { refetch(); });
    }, [startTransition, refetch, headerOpacity, headerTransY, listOpacity, listTransY])
  );

  React.useEffect(() => {
    setActiveCategory(route.params?.filterCategory ?? 'All');
  }, [route.params?.filterCategory]);

  React.useEffect(() => {
    if (route.params?.filterAccount !== undefined) {
      setFilterAccountId(route.params.filterAccount);
    }
  }, [route.params?.filterAccount]);

  React.useEffect(() => {
    if (route.params?.filterSortOrder !== undefined) {
      setFilterSortOrder(route.params.filterSortOrder as SortOrder);
    }
  }, [route.params?.filterSortOrder]);

  // Reset category filter when switching tabs
  const handleViewTypeSwitch = useCallback((type: 'expense' | 'income') => {
    setViewType(type);
    setActiveCategory('All');
  }, []);

  // ── Filter chip options ──
  const expenseFilterOptions = ['All', ...categories.map((c) => c.name)];
  const incomeFilterOptions = ['All', ...INCOME_CATEGORIES.map((c) => c.name)];
  const filterOptions =
    viewType === 'income' ? incomeFilterOptions : expenseFilterOptions;

  // ── Delete handler ──
  const handleDelete = useCallback(async (tx: FeedTransaction) => {
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
  }, [refetch]);

  const isAtMaxMonth =
    selectedYear > now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth());

  const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  const handlePrevMonth = useCallback(() => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const handleNextMonth = useCallback(() => {
    if (isAtMaxMonth) return;
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [isAtMaxMonth, selectedMonth]);

  // ── Apply / reset advanced filters ──
  const applyFilters = useCallback(() => {
    setFilterAccountId(draftAccountId);
    setFilterSortOrder(draftSortOrder);
    setFilterDatePreset(draftDatePreset);
    setFilterPanelVisible(false);
  }, [draftAccountId, draftSortOrder, draftDatePreset]);

  const resetFilters = useCallback(() => {
    setDraftAccountId(undefined);
    setDraftSortOrder('date_desc');
    setDraftDatePreset('month');
    setFilterAccountId(undefined);
    setFilterSortOrder('date_desc');
    setFilterDatePreset('month');
    setFilterPanelVisible(false);
  }, []);

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

  // ── Flatten sections → list items ──
  const listData: ListItem[] = [
    { type: 'hero' },
    { type: 'sticky' },
    { type: 'controls' },
    ...sections.flatMap((s) => [
      { type: 'header' as const, title: s.title },
      ...s.data.map((tx) => ({ type: 'transaction' as const, data: tx })),
    ]),
  ];

  const handleDeleteTransaction = useCallback(
    (tx: FeedTransaction) => {
      setSwipeHintVisible(false);
      handleDelete(tx);
    },
    [handleDelete]
  );

  const toggleFilterPanel = useCallback(() => {
    setDraftAccountId(filterAccountId);
    setDraftSortOrder(filterSortOrder);
    setDraftDatePreset(filterDatePreset);
    setFilterPanelVisible((v) => !v);
  }, [filterAccountId, filterSortOrder, filterDatePreset]);

  const listItemContext = useMemo<FeedListItemContext>(
    () => ({
      colors,
      isDark,
      styles,
      swipeStyles,
      navigation,
      monthLabel,
      isAtMaxMonth,
      handlePrevMonth,
      handleNextMonth,
      onOpenMonthPicker: () => setMonthPickerVisible(true),
      viewType,
      onSwitchViewType: handleViewTypeSwitch,
      searchInputRef,
      searchQuery,
      setSearchQuery,
      hasActiveFilters,
      onToggleFilterPanel: toggleFilterPanel,
      filterPanelVisible,
      resetFilters,
      draftDatePreset,
      setDraftDatePreset,
      draftAccountId,
      setDraftAccountId,
      accounts,
      draftSortOrder,
      setDraftSortOrder,
      applyFilters,
      closeFilterPanel: () => setFilterPanelVisible(false),
      filterOptions,
      activeCategory,
      setActiveCategory,
      loading,
      totalEntries: sections.reduce((s, sec) => s + sec.data.length, 0),
      swipeHintVisible,
      sectionsLength: sections.length,
      accountSpend,
      heroInfoTitle,
      heroInfoSubtitle,
      heroAmountLabel,
      heroAmountPrefix,
      categories,
      onDeleteTransaction: handleDeleteTransaction,
    }),
    [
      colors,
      isDark,
      styles,
      swipeStyles,
      navigation,
      monthLabel,
      isAtMaxMonth,
      handlePrevMonth,
      handleNextMonth,
      viewType,
      handleViewTypeSwitch,
      searchInputRef,
      searchQuery,
      hasActiveFilters,
      toggleFilterPanel,
      filterPanelVisible,
      resetFilters,
      draftDatePreset,
      draftAccountId,
      accounts,
      draftSortOrder,
      applyFilters,
      filterOptions,
      activeCategory,
      loading,
      sections,
      swipeHintVisible,
      accountSpend,
      heroInfoTitle,
      heroInfoSubtitle,
      heroAmountLabel,
      heroAmountPrefix,
      categories,
      handleDeleteTransaction,
    ]
  );

  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => <FeedListItem item={item} ctx={listItemContext} />,
    [listItemContext]
  );

  const getItemType = useCallback((item: ListItem) => item.type, []);

  const isListReady = useDeferredRender();
  const totalEntries = sections.reduce((s, sec) => s + sec.data.length, 0);
  const listBottomPadding = Math.max(insets.bottom + 96, 120);

  return (
    <View style={styles.container}>
      {/* ─── SCREEN TITLE ROW — pinned ─── */}
      <RAnim.View style={[styles.screenTitleRow, headerAnim]}>
        <Text style={styles.headerTitle}>Transactions</Text>
        <TouchableOpacity
          style={styles.notifBtn}
          activeOpacity={0.75}
          onPress={() => searchInputRef.current?.focus()}
        >
          <Ionicons name="search-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </RAnim.View>

      {/* ─── SINGLE FLASHLIST — hero scrolls away, search bar sticks ─── */}
      <RAnim.View style={[{ flex: 1 }, listAnim]}>
        {isListReady ? (
          <FlashList
            data={listData}
            renderItem={renderItem}
            getItemType={getItemType}
            drawDistance={250}
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
              !loading && totalEntries > 0 && hasMore ? (
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
        ) : (
          <FeedSkeletonList styles={styles} />
        )}
      </RAnim.View>

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

const createSwipeStyles = (colors: any, _isDark: boolean) =>
  StyleSheet.create({
    swipeContainer: {
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    rowContent: {
      backgroundColor: colors.background,
    },
    deleteZone: {
      width: SWIPE_DELETE_WIDTH,
      backgroundColor: colors.expenseRed,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteBtn: {
      width: SWIPE_DELETE_WIDTH,
      flex: 1,
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
    heroBlob: {
      position: 'absolute',
      borderRadius: 999,
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
    // Hero type chip (read-only indicator replacing the old toggle)
    heroTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.blackTransparent15,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    heroTypeChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },

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
      paddingTop: 14,
      paddingBottom: 2,
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

    // ── Segment control (in sticky bar) ──
    segmentRow: {
      flexDirection: 'row',
      marginHorizontal: spacing.screenPadding,
      marginBottom: 10,
      backgroundColor: isDark ? colors.surfaceSubdued : '#F0EFEA',
      borderRadius: 14,
      padding: 3,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 11,
      alignItems: 'center',
    },
    segmentBtnExpenseActive: {
      backgroundColor: colors.expenseRed,
      shadowColor: colors.expenseRed,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    segmentBtnIncomeActive: {
      backgroundColor: colors.incomeGreen,
      shadowColor: colors.incomeGreen,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    segmentText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13.5,
      color: colors.textSecondary,
    },
    segmentTextActive: { color: '#FFFFFF' },

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
      marginRight: 8,
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
      marginRight: 8,
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
      fontFamily: 'Nunito_700Bold',
      fontSize: 13,
      color: colors.textPrimary,
      letterSpacing: 0.3,
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
    // ── Empty state ───────────────────────────────────────────────────────────
    emptyState: {
      alignItems: 'center' as const,
      paddingTop: 48,
      paddingBottom: 32,
      gap: 8,
    },
    emptyStateTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: colors.textPrimary,
      marginTop: 8,
    },
    emptyStateText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center' as const,
      paddingHorizontal: 32,
    },
  });
