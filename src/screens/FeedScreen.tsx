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
import { CategoryIcon } from '@/components/CategoryIcon';

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
  const route = useRoute<any>();

  const initialCategory = route.params?.filterCategory || 'All';
  const [activeCategory, setActiveCategory] = useState(initialCategory);

  // Modal State for Scalable Category Filter
  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);

  useEffect(() => {
    if (route.params?.filterCategory) {
      setActiveCategory(route.params.filterCategory);
    }
  }, [route.params?.filterCategory]);

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
    
    // Map properties for CategoryIcon
    const iconKey = isExpense ? (catData?.emoji ?? 'default') : 'default';
    const iconColor = isExpense ? (catData?.text_colour ?? '#888780') : '#2d6a4f';
    
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

      {/* ─── CATEGORY SELECTION MODAL ─── */}
      <Modal
        visible={isCategoryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCategoryModalVisible(false)}
          />

          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Category</Text>
              <TouchableOpacity
                onPress={() => setCategoryModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat;
                const theme = CATEGORY_THEME[cat];

                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.modalRow, isActive && styles.modalRowActive]}
                    onPress={() => {
                      setActiveCategory(cat);
                      setCategoryModalVisible(false);
                    }}
                  >
                    {/* Render Icon or Generic App Icon for "All" */}
                    {cat === 'All' ? (
                      <View
                        style={[
                          styles.modalIconWrap,
                          { backgroundColor: '#F0F0F0' },
                        ]}
                      >
                        <Ionicons
                          name="apps"
                          size={18}
                          color={colors.textSecondary}
                        />
                      </View>
                    ) : (
                      <LinearGradient
                        colors={theme.iconGrad}
                        style={styles.modalIconWrap}
                      >
                        <Svg width={18} height={18} viewBox="0 0 24 24">
                          {getCategoryIcon(cat, theme.nameColor)}
                        </Svg>
                      </LinearGradient>
                    )}

                    <Text
                      style={[
                        styles.modalRowText,
                        isActive && styles.modalRowTextActive,
                      ]}
                    >
                      {cat}
                    </Text>

                    {isActive && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // New Scalable Controls Row
  controlsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 16,
    gap: 10,
  },
  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: 'rgba(45, 106, 79, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  pillIcon: { marginRight: 6 },
  dropdownPillText: {
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

  progressCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.screenPadding,
    marginTop: 4,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(30,30,46,0.08)',
  },
  progHd: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progName: { fontFamily: 'Nunito_700Bold', fontSize: 14, fontWeight: '700' },
  progMetaWrap: { flexDirection: 'row', alignItems: 'center' },
  progBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    marginRight: 6,
  },
  progBadgeText: { fontSize: 10, fontWeight: '700' },
  progMeta: { fontFamily: 'DMMono_400Regular', fontSize: 11, color: '#6B6B7A' },
  progTrack: {
    height: 6,
    backgroundColor: 'rgba(30,30,46,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progFillBar: { height: '100%', borderRadius: 4 },

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
  txContent: {
    flex: 1,
    justifyContent: 'center',
  },
  txTitle: {
    fontFamily: 'Nunito_600SemiBold',
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
