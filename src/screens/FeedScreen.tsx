import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing } from '../constants/theme';
import { useTransactions, FeedTransaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPeso(n: number): string {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Returns a light bg derived from a hex brand colour (12% opacity). */
function tagBg(hex: string): string {
  return hex + '20';
}

type ListItem =
  | { type: 'header'; title: string }
  | { type: 'transaction'; data: FeedTransaction };

// ─── Main component ──────────────────────────────────────────────────────────

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const [activeCategory, setActiveCategory] = useState('All');

  const { sections, loading, loadMore, hasMore, loadingMore, refetch } =
    useTransactions(activeCategory);

  const { categories } = useCategories();

  // Refresh when screen regains focus (e.g. after adding a transaction)
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  // ── Filter options ──
  const filterOptions = [
    'All',
    ...categories.map((c) => c.name),
    'Income',
  ];

  // ── Flatten sections → FlatList items ──
  const listData: ListItem[] = sections.flatMap((s) => [
    { type: 'header', title: s.title },
    ...s.data.map((tx) => ({ type: 'transaction' as const, data: tx })),
  ]);

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
    const catData = categories.find(
      (c) => c.name.toLowerCase() === (tx.category ?? '').toLowerCase()
    );
    const iconBg = isExpense
      ? (catData?.tile_bg_colour ?? '#F5F5F5')
      : '#E8F5EE';
    const emoji = isExpense ? (catData?.emoji ?? '📦') : '💵';
    const time = new Date(tx.date).toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <Pressable
        onPress={() =>
          navigation.navigate('TransactionDetail', { id: tx.id })
        }
        style={({ pressed }) => [
          styles.transactionItem,
          pressed && { backgroundColor: colors.primaryLight },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <Text style={styles.iconEmoji}>{emoji}</Text>
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

        <Text
          style={[
            styles.txAmount,
            isExpense ? styles.neg : styles.pos,
          ]}
        >
          {isExpense ? '-' : '+'}
          {fmtPeso(tx.amount)}
        </Text>
      </Pressable>
    );
  };

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Transactions</Text>
          <Text style={styles.headerSubtitle}>
            {monthLabel} · {sections.reduce((s, sec) => s + sec.data.length, 0)} entries
          </Text>
        </View>
        <TouchableOpacity style={styles.monthPill} activeOpacity={0.7}>
          <Text style={styles.monthPillText}>{monthLabel} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* ─── FILTER ROW ─── */}
      <View style={styles.filterWrapper}>
        <FlatList
          data={filterOptions}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding }}
          renderItem={({ item }) => {
            const isActive = activeCategory === item;
            return (
              <TouchableOpacity
                style={isActive ? styles.chipActive : styles.chipInactive}
                onPress={() => setActiveCategory(item)}
                activeOpacity={0.8}
              >
                <Text
                  style={
                    isActive ? styles.chipTextActive : styles.chipTextInactive
                  }
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
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
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
    marginBottom: 20,
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
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconEmoji: {
    fontSize: 20,
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
