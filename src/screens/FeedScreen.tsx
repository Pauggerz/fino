// src/screens/FeedScreen.tsx
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  useTransition,
} from 'react';
import { Q } from '@nozbe/watermelondb';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  useTransactions,
  FeedTransaction,
  DateRange,
  SortOrder,
} from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useIncomeCategories } from '@/hooks/useIncomeCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORY_COLOR } from '@/constants/categoryMappings';
import { deleteTransaction } from '@/services/localMutations';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import { useAuth } from '@/contexts/AuthContext';
import Toast from '../components/Toast';
import type { FeedStackParamList } from '../navigation/RootNavigator';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyTransactions } from '@/components/empty/EmptyTransactions';
import { AmbientOrb } from '@/components/empty/AnimatedAmbient';
import { MonthPickerModal } from '@/components/stats/MonthPickerModal';
import { useDeferredRender } from '@/hooks/useDeferredRender';

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
  // Local `date` column stores 'YYYY-MM-DD' (per the sync layer's toDayString),
  // so the bounds must be in the same format. Returning ISO timestamps would
  // make day-1 transactions fail `>=` because '2026-05-01' < '2026-05-01T...'
  // under string comparison.
  const pad = (n: number) => n.toString().padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${pad(month + 1)}-01`;
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
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
      <View style={swipeStyles.rowContent}>{children}</View>
    </ReanimatedSwipeable>
  );
}

const MemoizedSwipeableRow = React.memo(SwipeableRow);

// ─── List item type ───────────────────────────────────────────────────────────

type ListItem =
  | { type: 'hero' }
  | { type: 'sticky' }
  | { type: 'controls' }
  | { type: 'header'; title: string }
  | { type: 'transaction'; data: FeedTransaction };

type DatePreset = 'month' | '30d' | '90d' | 'custom';

type FeedStyles = ReturnType<typeof createStyles>;
type FeedSwipeStyles = ReturnType<typeof createSwipeStyles>;
type AccountSpend = { name: string; colour: string; amount: number };

const FeedSkeletonList = React.memo(
  ({ styles }: { styles: ReturnType<typeof createStyles> }) => (
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
  )
);

// ─── Hero (month nav + account-spend carousel) ───────────────────────────────

const FeedHero = React.memo(
  ({
    styles,
    colors,
    monthLabel,
    isAtMaxMonth,
    handlePrevMonth,
    handleNextMonth,
    onOpenMonthPicker,
    viewType,
    accountSpend,
    heroAmountPrefix,
    totalAmount,
    totalLabel,
    deltaPercent,
    deltaLabel,
  }: {
    styles: FeedStyles;
    colors: any;
    monthLabel: string;
    isAtMaxMonth: boolean;
    handlePrevMonth: () => void;
    handleNextMonth: () => void;
    onOpenMonthPicker: () => void;
    viewType: 'expense' | 'income';
    accountSpend: AccountSpend[];
    heroAmountPrefix: string;
    totalAmount: number;
    totalLabel: string;
    deltaPercent: number | null;
    deltaLabel: string;
  }) => (
    <View>
      <View style={styles.monthPillRow}>
        <View
          style={[
            styles.monthPill,
            { backgroundColor: colors.white, borderColor: colors.border },
          ]}
        >
          <Pressable
            onPress={handlePrevMonth}
            style={[
              styles.monthArrow,
              { backgroundColor: colors.surfaceSubdued },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={14}
              color={colors.textSecondary}
            />
          </Pressable>
          <Pressable onPress={onOpenMonthPicker} style={styles.monthLabelBtn}>
            <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
              {monthLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleNextMonth}
            disabled={isAtMaxMonth}
            style={[
              styles.monthArrow,
              { backgroundColor: colors.surfaceSubdued },
              isAtMaxMonth && { opacity: 0.35 },
            ]}
          >
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <View
        style={[styles.heroCard, { backgroundColor: colors.heroCardBg }]}
      >
        <AmbientOrb
          size={200}
          color={colors.primary}
          baseOpacity={0.28}
          amplitude={20}
          durationMs={12000}
          style={{ top: -40, right: -40 }}
        />
        <AmbientOrb
          size={150}
          color={colors.primary}
          baseOpacity={0.22}
          amplitude={18}
          durationMs={14000}
          phase={0.4}
          style={{ bottom: 60, left: -40 }}
        />

        <View style={styles.heroTotalBlock}>
        <Text style={styles.heroTotalLabel}>{totalLabel}</Text>
        <Text style={styles.heroTotalAmount}>
          {heroAmountPrefix}
          {fmtPeso(totalAmount)}
        </Text>
        {deltaPercent !== null &&
          (() => {
            // Good = "what the user wants": less spending OR more income.
            const isGood =
              viewType === 'expense' ? deltaPercent <= 0 : deltaPercent >= 0;
            return (
              <View
                style={[
                  styles.heroDeltaChip,
                  isGood ? styles.heroDeltaChipGood : styles.heroDeltaChipBad,
                ]}
              >
                <Text
                  style={[
                    styles.heroDeltaChipText,
                    isGood
                      ? styles.heroDeltaChipTextGood
                      : styles.heroDeltaChipTextBad,
                  ]}
                >
                  {deltaPercent >= 0 ? '↑' : '↓'} {Math.abs(deltaPercent)}%{' '}
                  {deltaLabel}
                </Text>
              </View>
            );
          })()}
      </View>

      {accountSpend.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.balanceCarousel}
        >
          {accountSpend.map((acc, i) => (
            <View key={`${acc.name}-${i}`} style={styles.balanceCard}>
              <View style={styles.balanceCardLabel}>
                <View
                  style={[
                    styles.balanceCardDot,
                    { backgroundColor: acc.colour },
                  ]}
                />
                <Text style={styles.balanceCardLabelText}>
                  {acc.name.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.balanceCardAmount}>
                {heroAmountPrefix}
                {fmtPeso(acc.amount)}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.heroEmptyHint}>
          No {viewType} transactions for this period
        </Text>
      )}
      </View>
    </View>
  )
);

// ─── Sticky search / segment / filter panel ──────────────────────────────────

const FeedSticky = React.memo(
  ({
    styles,
    colors,
    viewType,
    onSwitchViewType,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    hasActiveFilters,
    onToggleFilterPanel,
    filterPanelVisible,
    resetFilters,
    draftDatePreset,
    setDraftDatePreset,
    draftAccountId,
    setDraftAccountId,
    accounts,
    draftSortOrder,
    setDraftSortOrder,
    closeFilterPanel,
    applyFilters,
    isEmptyState,
  }: {
    styles: FeedStyles;
    colors: any;
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
    closeFilterPanel: () => void;
    applyFilters: () => void;
    isEmptyState: boolean;
  }) => (
    <View style={styles.stickyBar}>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            viewType === 'expense' && styles.segmentBtnExpenseActive,
          ]}
          onPress={() => onSwitchViewType('expense')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.segmentText,
              viewType === 'expense' && styles.segmentTextActive,
            ]}
          >
            Expenses
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            viewType === 'income' && styles.segmentBtnIncomeActive,
          ]}
          onPress={() => onSwitchViewType('income')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.segmentText,
              viewType === 'income' && styles.segmentTextActive,
            ]}
          >
            Income
          </Text>
        </TouchableOpacity>
      </View>

      {!isEmptyState && (
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons
              name="search-outline"
              size={16}
              color={colors.textSecondary}
            />
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
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                activeOpacity={0.7}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
              >
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.filterTriggerBtn,
              hasActiveFilters && styles.filterTriggerBtnActive,
            ]}
            activeOpacity={0.8}
            onPress={onToggleFilterPanel}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={hasActiveFilters ? colors.primary : colors.textSecondary}
            />
            {hasActiveFilters && <View style={styles.filterBadge} />}
          </TouchableOpacity>
        </View>
      )}

      {filterPanelVisible && (
        <View style={styles.filterPanel}>
          <View style={styles.filterPanelHeader}>
            <Text style={styles.filterPanelTitle}>Filters</Text>
            <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
              <Text style={styles.filterResetText}>Reset all</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.filterSectionLabel}>Date Range</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['month', '30d', '90d'] as const).map((preset) => {
                const labels = {
                  month: 'This Month',
                  '30d': 'Last 30 Days',
                  '90d': 'Last 3 Months',
                };
                const isSelected = draftDatePreset === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipSelected,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setDraftDatePreset(preset)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && styles.filterChipTextSelected,
                      ]}
                    >
                      {labels[preset]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <Text style={styles.filterSectionLabel}>Account</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  draftAccountId === undefined && styles.filterChipSelected,
                ]}
                activeOpacity={0.8}
                onPress={() => setDraftAccountId(undefined)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    draftAccountId === undefined &&
                      styles.filterChipTextSelected,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {accounts.map((acc) => {
                const isSelected = draftAccountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.filterChip,
                      isSelected && {
                        backgroundColor: `${acc.brand_colour}18`,
                        borderColor: acc.brand_colour,
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() =>
                      setDraftAccountId(isSelected ? undefined : acc.id)
                    }
                  >
                    <Text
                      style={[
                        styles.filterChipText,
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

          <Text style={styles.filterSectionLabel}>Sort By</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 14 }}
          >
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(
                [
                  { key: 'date_desc', label: 'Newest First' },
                  { key: 'date_asc', label: 'Oldest First' },
                  { key: 'amount_desc', label: 'Highest Amount' },
                ] as { key: SortOrder; label: string }[]
              ).map(({ key, label }) => {
                const isSelected = draftSortOrder === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipSelected,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setDraftSortOrder(key)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && styles.filterChipTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.filterPanelActions}>
            <TouchableOpacity
              style={styles.filterCancelBtn}
              activeOpacity={0.7}
              onPress={closeFilterPanel}
            >
              <Text style={styles.filterCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterApplyBtn}
              activeOpacity={0.8}
              onPress={applyFilters}
            >
              <Text style={styles.filterApplyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
);

// ─── Category chips + swipe hint + empty state ───────────────────────────────

const FeedControls = React.memo(
  ({
    styles,
    colors,
    viewType,
    filterOptions,
    activeCategory,
    setActiveCategory,
    categories,
    incomeCategories,
    loading,
    swipeHintVisible,
    totalEntries,
    sectionsLength,
    searchQuery,
    monthLabel,
    onAddTransaction,
    isEmptyState,
  }: {
    styles: FeedStyles;
    colors: any;
    viewType: 'expense' | 'income';
    filterOptions: string[];
    activeCategory: string;
    setActiveCategory: (value: string) => void;
    categories: any[];
    incomeCategories: any[];
    loading: boolean;
    swipeHintVisible: boolean;
    totalEntries: number;
    sectionsLength: number;
    searchQuery: string;
    monthLabel: string;
    onAddTransaction: () => void;
    isEmptyState: boolean;
  }) => {
    if (loading) {
      return <FeedSkeletonList styles={styles} />;
    }
    return (
      <View>
        {!isEmptyState && (
          <View style={styles.filterWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: spacing.screenPadding,
              }}
            >
              {filterOptions.map((chip) => {
              const isActive = activeCategory === chip;
              let activeBg = colors.primary;
              if (viewType === 'income' && chip !== 'All') {
                const incCat = incomeCategories.find((c) => c.name === chip);
                if (incCat?.text_colour) {
                  activeBg = incCat.text_colour;
                } else if (incCat?.emoji) {
                  activeBg = CATEGORY_COLOR[incCat.emoji] ?? colors.primary;
                }
              } else if (viewType === 'expense' && chip !== 'All') {
                const expCat = categories.find((c) => c.name === chip);
                if (expCat?.text_colour) {
                  activeBg = expCat.text_colour;
                }
              }

              return (
                <TouchableOpacity
                  key={chip}
                  style={[
                    isActive ? styles.chipActive : styles.chipInactive,
                    isActive && { backgroundColor: activeBg },
                  ]}
                  onPress={() => setActiveCategory(chip)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={
                      isActive ? styles.chipTextActive : styles.chipTextInactive
                    }
                  >
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </ScrollView>
          </View>
        )}

        {swipeHintVisible && totalEntries > 0 && (
          <View style={styles.swipeHint}>
            <Ionicons
              name="arrow-back-outline"
              size={12}
              color={colors.textSecondary}
            />
            <Text style={styles.swipeHintText}>
              Swipe left on a transaction to delete
            </Text>
          </View>
        )}

        {!loading && sectionsLength === 0 && (
          <EmptyTransactions
            title={searchQuery.length > 0 ? 'No matches' : `Nothing in ${monthLabel} yet`}
            body={
              searchQuery.length > 0
                ? 'No results for your search.'
                : `You don't have any transactions in ${monthLabel}. Use the month picker above to view another month, or add one now.`
            }
            ctaLabel={
              searchQuery.length > 0 ? undefined : `Add transaction for ${monthLabel}`
            }
            onPressCta={searchQuery.length > 0 ? undefined : onAddTransaction}
          />
        )}
      </View>
    );
  }
);

// ─── Section header (date group) ─────────────────────────────────────────────

const FeedHeaderRow = React.memo(
  ({ styles, title }: { styles: FeedStyles; title: string }) => (
    <View style={styles.dateHeaderContainer}>
      <Text style={styles.dateHeader}>{title}</Text>
    </View>
  )
);

// ─── Transaction row ─────────────────────────────────────────────────────────

const FeedTransactionRow = React.memo(
  ({
    tx,
    categoryByName,
    incomeCategoryByName,
    styles,
    swipeStyles,
    colors,
    isDark,
    onPress,
    onDelete,
  }: {
    tx: FeedTransaction;
    categoryByName: Map<string, any>;
    incomeCategoryByName: Map<string, any>;
    styles: FeedStyles;
    swipeStyles: FeedSwipeStyles;
    colors: any;
    isDark: boolean;
    onPress: (id: string) => void;
    onDelete: (tx: FeedTransaction) => void;
  }) => {
    const isExpense = tx.type === 'expense';

    let iconKey = 'default';
    let iconColor = colors.textSecondary;

    const catKey = (tx.category ?? '').toLowerCase();
    if (catKey === 'transfer') {
      iconKey = 'transfer';
      iconColor = CATEGORY_COLOR.transfer;
    } else if (catKey === 'adjustment') {
      iconKey = 'adjustment';
      iconColor = CATEGORY_COLOR.adjustment;
    } else if (isExpense) {
      const catData = categoryByName.get(catKey);
      iconKey = catData?.emoji ?? 'default';
      iconColor = catData?.text_colour ?? colors.textSecondary;
    } else {
      const incCat = incomeCategoryByName.get(catKey);
      iconKey = incCat?.emoji ?? 'default';
      iconColor =
        incCat?.text_colour ??
        CATEGORY_COLOR[iconKey] ??
        colors.incomeGreen;
    }

    // Pre-formatted upstream in useTransactions.modelToPlain — row is now pure
    // presentation, no per-frame allocation.
    const { time } = tx;

    // Stable within the row's lifetime so MemoizedSwipeableRow's shallow
    // compare doesn't re-render it on every parent-driven render.
    const handleDelete = useCallback(() => onDelete(tx), [onDelete, tx]);
    const handlePress = useCallback(() => onPress(tx.id), [onPress, tx.id]);

    return (
      <MemoizedSwipeableRow swipeStyles={swipeStyles} onDelete={handleDelete}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`${tx.type === 'income' ? 'Income' : 'Expense'} ${tx.display_name ?? tx.category ?? ''}`}
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
              {time ? (
                <>
                  <Text style={styles.txTime}>{time}</Text>
                  <View style={styles.metaDot} />
                </>
              ) : null}
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
      </MemoizedSwipeableRow>
    );
  }
);

// ─── Main component ──────────────────────────────────────────────────────────

function FeedScreen() {
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
  const [viewType, setViewType] = useState<'expense' | 'income'>(
    route.params?.initialViewType ?? 'expense'
  );

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
  const [draftAccountId, setDraftAccountId] = useState<string | undefined>(
    undefined
  );
  const [draftSortOrder, setDraftSortOrder] = useState<SortOrder>('date_desc');
  const [draftDatePreset, setDraftDatePreset] = useState<
    'month' | '30d' | '90d' | 'custom'
  >('month');
  const [filterDatePreset, setFilterDatePreset] = useState<
    'month' | '30d' | '90d' | 'custom'
  >('month');

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

  const {
    categories,
    error: categoriesError,
    refetch: refetchCategories,
  } = useCategories();
  const { categories: incomeCategories } = useIncomeCategories();
  const {
    accounts,
    error: accountsError,
    refetch: refetchAccounts,
  } = useAccounts();
  const fetchError = categoriesError ?? accountsError;
  const retryAll = useCallback(() => {
    refetch();
    refetchCategories(true);
    refetchAccounts();
  }, [refetch, refetchCategories, refetchAccounts]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchCategories(true),
        refetchAccounts(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, refetchCategories, refetchAccounts]);

  const hasAnimated = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasAnimated.current) {
        // Full entrance on first mount
        hasAnimated.current = true;
        headerOpacity.value = 0;
        headerTransY.value = -8;
        listOpacity.value = 0;
        listTransY.value = 16;
        headerOpacity.value = withTiming(1, { duration: 260 });
        headerTransY.value = withTiming(0, { duration: 260 });
        listOpacity.value = withDelay(60, withTiming(1, { duration: 320 }));
        listTransY.value = withDelay(
          60,
          withSpring(0, { damping: 18, stiffness: 180 })
        );
      }
      startTransition(() => {
        refetch();
      });
    }, [
      startTransition,
      refetch,
      headerOpacity,
      headerTransY,
      listOpacity,
      listTransY,
    ])
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

  React.useEffect(() => {
    if (route.params?.initialViewType !== undefined) {
      setViewType(route.params.initialViewType);
    }
  }, [route.params?.initialViewType]);

  // Reset category filter when switching tabs
  const handleViewTypeSwitch = useCallback((type: 'expense' | 'income') => {
    setViewType(type);
    setActiveCategory('All');
  }, []);

  // ── Filter chip options ──
  // Fresh arrays per render previously broke FeedControls' React.memo — every
  // keystroke in the search box re-rendered the chip carousel.
  const filterOptions = useMemo<string[]>(() => {
    const source = viewType === 'income' ? incomeCategories : categories;
    const seen = new Set<string>();
    const names: string[] = ['All'];
    for (const c of source) {
      const k = c.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      names.push(c.name);
    }
    return names;
  }, [viewType, categories, incomeCategories]);

  // O(1) category lookup for FeedTransactionRow. Was a linear .find() per row,
  // per render — the single biggest scroll-frame cost in the profiler.
  const categoryByName = useMemo(
    () => new Map(categories.map((c) => [c.name.toLowerCase(), c])),
    [categories]
  );

  const incomeCategoryByName = useMemo(
    () => new Map(incomeCategories.map((c) => [c.name.toLowerCase(), c])),
    [incomeCategories]
  );

  // ── Delete handler ──
  const handleDelete = useCallback(
    async (tx: FeedTransaction) => {
      await deleteTransaction(tx.id);
      refetch();
      setToastTitle('Deleted');
      setToastSubtitle(
        `${tx.display_name ?? tx.category ?? 'Transaction'} has been removed`
      );
      setToastVisible(true);
    },
    [refetch]
  );

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
    const map: Record<
      string,
      { name: string; colour: string; amount: number }
    > = {};
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

  const heroAmountPrefix = viewType === 'expense' ? '-' : '+';

  // ── Hero total + previous-period total (for the delta chip) ──
  // Sums the full period via DB query rather than the paginated `sections`,
  // so the headline figure is accurate even when only the first 20 rows are
  // loaded. Mirrors the prevIncome/prevExpense pattern in CashFlowScreen.
  const { user } = useAuth();
  const userId = user?.id;
  const [periodTotal, setPeriodTotal] = useState(0);
  const [prevPeriodTotal, setPrevPeriodTotal] = useState(0);

  const periodRanges = useMemo(() => {
    if (filterDatePreset === '30d') {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - 30);
      return {
        curFrom: from.toISOString(),
        curTo: to.toISOString(),
        prevFrom: prevFrom.toISOString(),
        prevTo: prevTo.toISOString(),
        deltaLabel: 'vs prev 30 days',
      };
    }
    if (filterDatePreset === '90d') {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - 90);
      return {
        curFrom: from.toISOString(),
        curTo: to.toISOString(),
        prevFrom: prevFrom.toISOString(),
        prevTo: prevTo.toISOString(),
        deltaLabel: 'vs prev 90 days',
      };
    }
    const curFrom = new Date(selectedYear, selectedMonth, 1).toISOString();
    const curTo = new Date(
      selectedYear,
      selectedMonth + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();
    const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYearIdx = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const prevFrom = new Date(prevYearIdx, prevMonthIdx, 1).toISOString();
    const prevTo = new Date(
      prevYearIdx,
      prevMonthIdx + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();
    return {
      curFrom,
      curTo,
      prevFrom,
      prevTo,
      deltaLabel: `vs ${MONTH_NAMES[prevMonthIdx]}`,
    };
  }, [filterDatePreset, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!userId) {
      setPeriodTotal(0);
      setPrevPeriodTotal(0);
      return;
    }
    const baseFilters: Q.Clause[] = [
      Q.where('user_id', userId),
      Q.where('type', viewType),
      Q.where('account_deleted', false),
    ];
    if (filterAccountId) {
      baseFilters.push(Q.where('account_id', filterAccountId));
    }
    const txCol = database.get<TransactionModel>('transactions');
    const sumNonTransfer = (records: TransactionModel[]) => {
      let sum = 0;
      for (const t of records) {
        const isTransfer =
          t.isTransfer || (t.category ?? '').toLowerCase() === 'transfer';
        if (!isTransfer) sum += t.amount;
      }
      return sum;
    };
    const curSub = txCol
      .query(
        ...baseFilters,
        Q.where('date', Q.gte(periodRanges.curFrom)),
        Q.where('date', Q.lte(periodRanges.curTo))
      )
      .observeWithColumns(['amount', 'type', 'category', 'is_transfer'])
      .subscribe((records) => setPeriodTotal(sumNonTransfer(records)));
    const prevSub = txCol
      .query(
        ...baseFilters,
        Q.where('date', Q.gte(periodRanges.prevFrom)),
        Q.where('date', Q.lte(periodRanges.prevTo))
      )
      .observeWithColumns(['amount', 'type', 'category', 'is_transfer'])
      .subscribe((records) => setPrevPeriodTotal(sumNonTransfer(records)));
    return () => {
      curSub.unsubscribe();
      prevSub.unsubscribe();
    };
  }, [userId, viewType, filterAccountId, periodRanges]);

  const periodMonthName = MONTH_NAMES[selectedMonth];
  const totalLabel = useMemo(() => {
    const verb = viewType === 'expense' ? 'Spent' : 'Received';
    if (filterDatePreset === '30d') return `${verb} in last 30 days`;
    if (filterDatePreset === '90d') return `${verb} in last 90 days`;
    return `${verb} in ${periodMonthName}`;
  }, [viewType, filterDatePreset, periodMonthName]);

  const deltaPercent = useMemo<number | null>(() => {
    if (prevPeriodTotal <= 0) return null;
    if (periodTotal <= 0 && prevPeriodTotal <= 0) return null;
    const pct = ((periodTotal - prevPeriodTotal) / prevPeriodTotal) * 100;
    return Math.round(pct);
  }, [periodTotal, prevPeriodTotal]);

  // ── Flatten sections → list items ──
  // Memoised on `sections` — list identity is stable across unrelated parent
  // re-renders, so FlashList's diffing stays cheap.
  const listData = useMemo<ListItem[]>(
    () => [
      { type: 'hero' },
      { type: 'sticky' },
      { type: 'controls' },
      ...sections.flatMap((s) => [
        { type: 'header' as const, title: s.title },
        ...s.data.map((tx) => ({ type: 'transaction' as const, data: tx })),
      ]),
    ],
    [sections]
  );

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

  const openMonthPicker = useCallback(() => setMonthPickerVisible(true), []);
  const closeFilterPanel = useCallback(() => setFilterPanelVisible(false), []);

  const handleTxPress = useCallback(
    (id: string) => navigation.navigate('TransactionDetail', { id }),
    [navigation]
  );

  const handleAddTransaction = useCallback(
    () => navigation.navigate('AddTransaction'),
    [navigation]
  );

  const totalEntries = useMemo(
    () => sections.reduce((s, sec) => s + sec.data.length, 0),
    [sections]
  );

  // True empty state: no transactions in this month and no filters/search
  // narrowing the view. When true we hide the search bar + category chips
  // so the empty illustration owns the screen.
  const isEmptyState =
    !loading &&
    totalEntries === 0 &&
    searchQuery.length === 0 &&
    !hasActiveFilters &&
    activeCategory === 'All';

  // renderItem dispatches by item.type into independently-memoized
  // sub-components. Each sub-component only receives the narrow slice of
  // props it actually reads — so typing in the search bar, for example,
  // re-renders FeedSticky alone instead of every transaction row below it.
  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => {
      if (item.type === 'hero') {
        return (
          <FeedHero
            styles={styles}
            colors={colors}
            monthLabel={monthLabel}
            isAtMaxMonth={isAtMaxMonth}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
            onOpenMonthPicker={openMonthPicker}
            viewType={viewType}
            accountSpend={accountSpend}
            heroAmountPrefix={heroAmountPrefix}
            totalAmount={periodTotal}
            totalLabel={totalLabel}
            deltaPercent={deltaPercent}
            deltaLabel={periodRanges.deltaLabel}
          />
        );
      }
      if (item.type === 'sticky') {
        return (
          <FeedSticky
            styles={styles}
            colors={colors}
            viewType={viewType}
            onSwitchViewType={handleViewTypeSwitch}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            hasActiveFilters={hasActiveFilters}
            onToggleFilterPanel={toggleFilterPanel}
            filterPanelVisible={filterPanelVisible}
            resetFilters={resetFilters}
            draftDatePreset={draftDatePreset}
            setDraftDatePreset={setDraftDatePreset}
            draftAccountId={draftAccountId}
            setDraftAccountId={setDraftAccountId}
            accounts={accounts}
            draftSortOrder={draftSortOrder}
            setDraftSortOrder={setDraftSortOrder}
            closeFilterPanel={closeFilterPanel}
            applyFilters={applyFilters}
            isEmptyState={isEmptyState}
          />
        );
      }
      if (item.type === 'controls') {
        return (
          <FeedControls
            styles={styles}
            colors={colors}
            viewType={viewType}
            filterOptions={filterOptions}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            categories={categories}
            incomeCategories={incomeCategories}
            loading={loading}
            swipeHintVisible={swipeHintVisible}
            totalEntries={totalEntries}
            sectionsLength={sections.length}
            searchQuery={searchQuery}
            monthLabel={monthLabel}
            onAddTransaction={handleAddTransaction}
            isEmptyState={isEmptyState}
          />
        );
      }
      if (item.type === 'header') {
        return <FeedHeaderRow styles={styles} title={item.title} />;
      }
      return (
        <FeedTransactionRow
          tx={item.data}
          categoryByName={categoryByName}
          incomeCategoryByName={incomeCategoryByName}
          styles={styles}
          swipeStyles={swipeStyles}
          colors={colors}
          isDark={isDark}
          onPress={handleTxPress}
          onDelete={handleDeleteTransaction}
        />
      );
    },
    [
      styles,
      swipeStyles,
      colors,
      isDark,
      monthLabel,
      isAtMaxMonth,
      handlePrevMonth,
      handleNextMonth,
      openMonthPicker,
      viewType,
      handleViewTypeSwitch,
      searchQuery,
      hasActiveFilters,
      toggleFilterPanel,
      filterPanelVisible,
      resetFilters,
      draftDatePreset,
      draftAccountId,
      accounts,
      draftSortOrder,
      closeFilterPanel,
      applyFilters,
      filterOptions,
      activeCategory,
      categories,
      incomeCategories,
      categoryByName,
      incomeCategoryByName,
      loading,
      swipeHintVisible,
      totalEntries,
      sections.length,
      accountSpend,
      heroAmountPrefix,
      periodTotal,
      totalLabel,
      deltaPercent,
      periodRanges.deltaLabel,
      handleTxPress,
      handleDeleteTransaction,
      handleAddTransaction,
      isEmptyState,
    ]
  );

  const getItemType = useCallback((item: ListItem) => item.type, []);

  const isListReady = useDeferredRender();
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
          <Ionicons
            name="search-outline"
            size={18}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
      </RAnim.View>

      {fetchError ? (
        <ErrorBanner
          message="Can't reach server — showing cached data."
          onRetry={retryAll}
        />
      ) : null}

      {/* ─── SINGLE FLASHLIST — hero scrolls away, search bar sticks ─── */}
      <RAnim.View style={[{ flex: 1 }, listAnim]}>
        {isListReady ? (
          <FlashList
            data={listData}
            renderItem={renderItem}
            extraData={isEmptyState}
            getItemType={getItemType}
            drawDistance={500}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
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

const createStyles = (colors: any, isDark: boolean, topInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topInset,
    },

    // ── StatsScreen-style title row ──
    screenTitleRow: {
      paddingTop: 12,
      paddingBottom: 4,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      // Match Insights headerRow so the month pill below sits at the same Y
      // when switching between Transactions and Insights tabs.
      minHeight: 54,
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
      borderRadius: 18,
      backgroundColor: isDark
        ? colors.blackTransparent15
        : 'rgba(30,30,46,0.06)',
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
      shadowColor: colors.heroCardShadow ?? '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    monthPillRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 6,
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
    // ── Hero total + delta block ──
    heroTotalBlock: {
      marginTop: 4,
      marginBottom: 14,
      zIndex: 2,
    },
    heroTotalLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.whiteTransparent55,
      marginBottom: 4,
    },
    heroTotalAmount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 30,
      letterSpacing: -0.5,
      lineHeight: 36,
      color: '#FFFFFF',
    },
    // Mirrors HomeScreen `trendBadge` so the % delta speaks one design language
    // across the app. Good/bad variants reuse existing theme tokens.
    heroDeltaChip: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      paddingVertical: 3,
      paddingHorizontal: 8,
      marginTop: 8,
    },
    heroDeltaChipGood: {
      backgroundColor: colors.primaryLight25,
    },
    heroDeltaChipBad: {
      backgroundColor: colors.coralLight,
    },
    heroDeltaChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
    },
    heroDeltaChipTextGood: {
      color: colors.mint,
    },
    heroDeltaChipTextBad: {
      color: colors.coralDark,
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
      borderColor: colors.border,
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
      width: 44,
      height: 44,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
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
      top: 8,
      right: 8,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },

    // ── Advanced filter panel ──
    filterPanel: {
      marginHorizontal: spacing.screenPadding,
      marginBottom: 14,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
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
      borderColor: colors.border,
      backgroundColor: isDark ? colors.surfaceSubdued : '#F7F5F2',
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
      borderColor: colors.border,
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
      borderColor: colors.border,
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
  });

export default React.memo(FeedScreen);
