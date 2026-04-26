import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import { useAccounts } from '@/hooks/useAccounts';
import fmtPeso from '@/utils/format';
import { CATEGORY_COLOR } from '@/constants/categoryMappings';
import {
  CashFlowCard,
  type MonthTrendPoint,
} from '@/components/stats/CashFlowCard';
import { MonthPickerModal } from '@/components/stats/MonthPickerModal';
import type { RootStackParamList } from '../navigation/RootNavigator';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function categoryColor(cat: string | null): string {
  if (!cat) return CATEGORY_COLOR.default;
  return CATEGORY_COLOR[cat.toLowerCase()] ?? CATEGORY_COLOR.default;
}

function isTransferRow(t: TransactionModel): boolean {
  return t.isTransfer || (t.category ?? '').toLowerCase() === 'transfer';
}

type CategoryRow = { key: string; label: string; amount: number };
type TxnRow = {
  id: string;
  name: string;
  category: string | null;
  amount: number;
  date: string;
  type: 'income' | 'expense';
};

type Bundle = {
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
  trend: MonthTrendPoint[];
  largestExpense: number;
  txCount: number;
  topInflowCats: CategoryRow[];
  topOutflowCats: CategoryRow[];
  transactions: TxnRow[];
};

const EMPTY_BUNDLE: Bundle = {
  income: 0,
  expense: 0,
  prevIncome: 0,
  prevExpense: 0,
  trend: [],
  largestExpense: 0,
  txCount: 0,
  topInflowCats: [],
  topOutflowCats: [],
  transactions: [],
};

const TXN_PAGE_SIZE = 10;

export default function CashFlowScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'CashFlow'>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();

  const accountId = route.params?.accountId;
  const account = useMemo(
    () => (accountId ? accounts.find((a) => a.id === accountId) : null),
    [accounts, accountId]
  );
  const headerLabel = account
    ? account.name
    : accountId
      ? 'Account Cash Flow'
      : 'All Accounts';

  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [pickerVisible, setPickerVisible] = useState(false);

  const isCurrentMonth =
    selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
  const monthLabel = `${MONTHS_SHORT[selectedMonth]} ${selectedYear}`;
  const daysInMonth = useMemo(
    () => new Date(selectedYear, selectedMonth + 1, 0).getDate(),
    [selectedYear, selectedMonth]
  );
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;

  const [bundle, setBundle] = useState<Bundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [txnPage, setTxnPage] = useState(0);

  // Reset pagination when month/account changes — old page index could
  // point past the end of a smaller dataset.
  useEffect(() => {
    setTxnPage(0);
  }, [selectedYear, selectedMonth, accountId]);

  const txnPageCount = Math.max(
    1,
    Math.ceil(bundle.transactions.length / TXN_PAGE_SIZE)
  );
  const txnPageRows = useMemo(
    () =>
      bundle.transactions.slice(
        txnPage * TXN_PAGE_SIZE,
        (txnPage + 1) * TXN_PAGE_SIZE
      ),
    [bundle.transactions, txnPage]
  );

  const fetchData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const from = new Date(selectedYear, selectedMonth, 1).toISOString();
      const to = new Date(
        selectedYear,
        selectedMonth + 1,
        0,
        23, 59, 59, 999
      ).toISOString();
      const sixMoStart = new Date(
        selectedYear,
        selectedMonth - 5,
        1
      ).toISOString();
      const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYearIdx = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const prevFrom = new Date(prevYearIdx, prevMonthIdx, 1).toISOString();
      const prevTo = new Date(
        prevYearIdx,
        prevMonthIdx + 1,
        0,
        23, 59, 59, 999
      ).toISOString();

      const txCol = database.get<TransactionModel>('transactions');

      const baseFilters = [Q.where('user_id', userId)];
      if (accountId) baseFilters.push(Q.where('account_id', accountId));

      const [monthTx, prevTx, sixMoTx] = await Promise.all([
        txCol
          .query(
            ...baseFilters,
            Q.where('date', Q.gte(from)),
            Q.where('date', Q.lte(to)),
            Q.sortBy('date', Q.desc)
          )
          .fetch(),
        txCol
          .query(
            ...baseFilters,
            Q.where('date', Q.gte(prevFrom)),
            Q.where('date', Q.lte(prevTo))
          )
          .fetch(),
        txCol
          .query(
            ...baseFilters,
            Q.where('date', Q.gte(sixMoStart)),
            Q.where('date', Q.lte(to))
          )
          .fetch(),
      ]);

      let income = 0;
      let expense = 0;
      let largestExpense = 0;
      let txCount = 0;
      const inflowByCat: Record<string, number> = {};
      const outflowByCat: Record<string, number> = {};
      const transactions: TxnRow[] = [];

      monthTx.forEach((t) => {
        if (isTransferRow(t)) return;
        const catKey = (t.category ?? '').trim().toLowerCase();
        if (t.type === 'income') {
          income += t.amount;
          if (catKey) inflowByCat[catKey] = (inflowByCat[catKey] ?? 0) + t.amount;
        } else if (t.type === 'expense') {
          expense += t.amount;
          txCount += 1;
          if (t.amount > largestExpense) largestExpense = t.amount;
          if (catKey) outflowByCat[catKey] = (outflowByCat[catKey] ?? 0) + t.amount;
        } else {
          return;
        }
        transactions.push({
          id: t.id,
          name:
            t.displayName ??
            t.merchantName ??
            cap(t.category ?? (t.type === 'income' ? 'Income' : 'Expense')),
          category: t.category ?? null,
          amount: t.amount,
          date: t.date,
          type: t.type as 'income' | 'expense',
        });
      });

      let prevIncome = 0;
      let prevExpense = 0;
      prevTx.forEach((t) => {
        if (isTransferRow(t)) return;
        if (t.type === 'income') prevIncome += t.amount;
        else if (t.type === 'expense') prevExpense += t.amount;
      });

      const trendMap: Record<string, { income: number; expense: number }> = {};
      sixMoTx.forEach((t) => {
        if (isTransferRow(t)) return;
        const ym = t.date.slice(0, 7);
        const m = trendMap[ym] ?? { income: 0, expense: 0 };
        if (t.type === 'income') m.income += t.amount;
        else if (t.type === 'expense') m.expense += t.amount;
        trendMap[ym] = m;
      });
      const trend: MonthTrendPoint[] = [];
      for (let i = 5; i >= 0; i--) {
        const dt = new Date(selectedYear, selectedMonth - i, 1);
        const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const m = trendMap[ym] ?? { income: 0, expense: 0 };
        trend.push({
          label: MONTHS_SHORT[dt.getMonth()],
          net: m.income - m.expense,
          isCurrent: i === 0,
        });
      }

      const toRows = (map: Record<string, number>): CategoryRow[] =>
        Object.entries(map)
          .map(([key, amount]) => ({ key, label: cap(key), amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);

      setBundle({
        income,
        expense,
        prevIncome,
        prevExpense,
        trend,
        largestExpense,
        txCount,
        topInflowCats: toRows(inflowByCat),
        topOutflowCats: toRows(outflowByCat),
        transactions,
      });
    } finally {
      setLoading(false);
    }
  }, [userId, accountId, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const styles = useMemo(
    () => createStyles(colors, insets.top),
    [colors, insets.top]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.iconBtn,
            { backgroundColor: colors.white, borderColor: colors.border },
          ]}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerEyebrow, { color: colors.textSecondary }]}>
            CASH FLOW
          </Text>
          <Text
            style={[styles.headerTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {headerLabel}
          </Text>
        </View>
        <View style={styles.iconBtnSpacer} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            <Pressable
              onPress={() => setPickerVisible(true)}
              style={styles.monthLabelBtn}
            >
              <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
                {monthLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleNextMonth}
              style={[
                styles.monthArrow,
                { backgroundColor: colors.surfaceSubdued },
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

        {loading ? (
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading cash flow…
          </Text>
        ) : (
          <>
            <CashFlowCard
              income={bundle.income}
              expenses={bundle.expense}
              prevNet={
                bundle.prevIncome === 0 && bundle.prevExpense === 0
                  ? null
                  : bundle.prevIncome - bundle.prevExpense
              }
              trend={bundle.trend}
              largest={bundle.largestExpense}
              txCount={bundle.txCount}
              daysElapsed={daysElapsed}
            />

            <View style={styles.dualSection}>
              <CategoryList
                title="TOP INFLOWS"
                rows={bundle.topInflowCats}
                accent={colors.incomeGreen}
                styles={styles}
                colors={colors}
              />
              <CategoryList
                title="TOP OUTFLOWS"
                rows={bundle.topOutflowCats}
                accent={colors.expenseRed}
                styles={styles}
                colors={colors}
              />
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.white,
                  borderColor: colors.cardBorderTransparent,
                },
              ]}
            >
              <View style={styles.txnHeader}>
                <Text
                  style={[styles.cardTitle, { color: colors.textSecondary }]}
                >
                  TRANSACTIONS
                </Text>
                {bundle.transactions.length > 0 ? (
                  <Text
                    style={[styles.txnHeaderCount, { color: colors.textSecondary }]}
                  >
                    {bundle.transactions.length}
                  </Text>
                ) : null}
              </View>
              {bundle.transactions.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  No transactions in {monthLabel}
                  {account ? ` for ${account.name}` : ''}.
                </Text>
              ) : (
                <>
                  {txnPageRows.map((t, i) => {
                    const isInc = t.type === 'income';
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() =>
                          navigation.navigate('TransactionDetail', { id: t.id })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${t.name}`}
                        android_ripple={{ color: colors.surfaceSubdued }}
                        style={({ pressed }) => [
                          styles.txnRow,
                          i < txnPageRows.length - 1 && {
                            borderBottomColor: colors.border,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                          },
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <View
                          style={[
                            styles.txnTypeIcon,
                            {
                              backgroundColor: isInc
                                ? colors.incomeGreen + '1F'
                                : colors.expenseRed + '1F',
                            },
                          ]}
                          accessibilityLabel={isInc ? 'Income' : 'Expense'}
                        >
                          <Ionicons
                            name={isInc ? 'arrow-down' : 'arrow-up'}
                            size={14}
                            color={
                              isInc ? colors.incomeGreen : colors.expenseRed
                            }
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.txnName,
                              { color: colors.textPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {t.name}
                          </Text>
                          <Text
                            style={[
                              styles.txnSub,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {formatShort(t.date)}
                            {t.category ? ` · ${cap(t.category)}` : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.txnAmt,
                            {
                              color: isInc
                                ? colors.incomeGreen
                                : colors.expenseRed,
                            },
                          ]}
                        >
                          {isInc ? '+' : '−'}
                          {fmtPeso(t.amount)}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {txnPageCount > 1 ? (
                    <View
                      style={[
                        styles.pagerRow,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <Pressable
                        onPress={() =>
                          setTxnPage((p) => Math.max(0, p - 1))
                        }
                        disabled={txnPage === 0}
                        accessibilityRole="button"
                        accessibilityLabel="Previous page"
                        style={[
                          styles.pagerBtn,
                          {
                            backgroundColor: colors.surfaceSubdued,
                            opacity: txnPage === 0 ? 0.4 : 1,
                          },
                        ]}
                      >
                        <Ionicons
                          name="chevron-back"
                          size={14}
                          color={colors.textPrimary}
                        />
                        <Text
                          style={[
                            styles.pagerBtnText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          Prev
                        </Text>
                      </Pressable>

                      <Text
                        style={[styles.pagerLabel, { color: colors.textSecondary }]}
                      >
                        Page {txnPage + 1} of {txnPageCount}
                      </Text>

                      <Pressable
                        onPress={() =>
                          setTxnPage((p) =>
                            Math.min(txnPageCount - 1, p + 1)
                          )
                        }
                        disabled={txnPage >= txnPageCount - 1}
                        accessibilityRole="button"
                        accessibilityLabel="Next page"
                        style={[
                          styles.pagerBtn,
                          {
                            backgroundColor: colors.surfaceSubdued,
                            opacity:
                              txnPage >= txnPageCount - 1 ? 0.4 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pagerBtnText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          Next
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color={colors.textPrimary}
                        />
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <MonthPickerModal
        visible={pickerVisible}
        year={selectedYear}
        month={selectedMonth}
        onConfirm={(y, m) => {
          setSelectedYear(y);
          setSelectedMonth(m);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

function CategoryList({
  title,
  rows,
  accent,
  styles,
  colors,
}: {
  title: string;
  rows: CategoryRow[];
  accent: string;
  styles: ReturnType<typeof createStyles>;
  colors: any;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <View
      style={[
        styles.miniCard,
        {
          backgroundColor: colors.white,
          borderColor: colors.cardBorderTransparent,
        },
      ]}
    >
      <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text
          style={[
            styles.empty,
            { color: colors.textSecondary, marginTop: 8 },
          ]}
        >
          No data this month.
        </Text>
      ) : (
        rows.map((r) => {
          const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
          return (
            <View key={r.key} style={styles.catRow}>
              <View
                style={[styles.catBadge, { backgroundColor: accent + '22' }]}
              >
                <Text style={[styles.catBadgeText, { color: accent }]}>
                  {pct}%
                </Text>
              </View>
              <Text
                style={[styles.catName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {r.label}
              </Text>
              <Text style={[styles.catAmt, { color: colors.textPrimary }]}>
                {fmtPeso(r.amount)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function cap(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function createStyles(colors: any, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topInset,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      gap: 8,
    },
    headerEyebrow: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 1.2,
    },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 18,
      letterSpacing: -0.4,
      marginTop: 2,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnSpacer: { width: 38, height: 38 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 60,
    },
    monthPillRow: {
      paddingTop: 8,
      paddingBottom: 14,
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
    monthLabelBtn: { paddingHorizontal: 4 },
    monthLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    loadingText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      paddingVertical: 24,
      textAlign: 'center',
    },
    dualSection: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    card: {
      borderRadius: 20,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 12,
    },
    miniCard: {
      flex: 1,
      borderRadius: 18,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    catBadge: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      minWidth: 36,
      alignItems: 'center',
    },
    catBadgeText: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 10,
    },
    catName: {
      flex: 1,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    catAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
    },
    cardTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 1.2,
    },
    empty: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      paddingVertical: 8,
    },
    txnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    txnTypeIcon: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txnName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    txnSub: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      marginTop: 2,
    },
    txnAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 13,
    },
    txnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    txnHeaderCount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 11,
    },
    pagerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 12,
      marginTop: 6,
    },
    pagerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    pagerBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    pagerLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
    },
  });
}
