import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, radius, spacing } from '../constants/theme';

// ─── SVG ICONS FROM HOME SCREEN ───────────────────────────────────────────────
function getCategoryIcon(id: string, color: string) {
  switch (id.toLowerCase()) {
    case 'food':
      return (
        <Path
          d="M11 2V9C11 10.1 10.1 11 9 11V20H7V11C5.9 11 5 10.1 5 9V2H6V7H7V2H8V7H9V2H11ZM15 2C16.1 2 17 2.9 17 4V10H14V20H12V2H15Z"
          fill={color}
        />
      );
    case 'transport':
      return (
        <Path
          d="M4 16C4 17.1 4.9 18 6 18H6.5L6 20H8L8.5 18H15.5L16 20H18L17.5 18H18C19.1 18 20 17.1 20 16V6C20 3.8 18.2 2 16 2H8C5.8 2 4 3.8 4 6V16ZM7.5 14C6.7 14 6 13.3 6 12.5C6 11.7 6.7 11 7.5 11C8.3 11 9 11.7 9 12.5C9 13.3 8.3 14 7.5 14ZM16.5 14C15.7 14 15 13.3 15 12.5C15 11.7 15.7 11 16.5 11C17.3 11 18 11.7 18 12.5C18 13.3 17.3 14 16.5 14ZM6 9V6H18V9H6Z"
          fill={color}
        />
      );
    case 'shopping':
      return (
        <Path
          d="M16 6V4C16 1.8 14.2 0 12 0C9.8 0 8 1.8 8 4V6H2V22C2 23.1 2.9 24 4 24H20C21.1 24 22 23.1 22 22V6H16ZM10 4C10 2.9 10.9 2 12 2C13.1 2 14 2.9 14 4V6H10V4ZM20 22H4V8H8V10C8 10.6 8.4 11 9 11C9.6 11 10 10.6 10 10V8H14V10C14 10.6 14.4 11 15 11C15.6 11 16 10.6 16 10V8H20V22Z"
          fill={color}
        />
      );
    case 'bills':
      return (
        <Path
          d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM13 9V3.5L18.5 9H13Z"
          fill={color}
        />
      );
    case 'income':
      return (
        <Path
          d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"
          fill={color}
        />
      );
    default:
      return (
        <Path
          d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z"
          fill={color}
        />
      );
  }
}

// ─── THEME & BUDGET METADATA ────────────────────────────────────────────────
const CATEGORY_THEME: Record<
  string,
  {
    barColor: string;
    iconGrad: readonly [string, string];
    badgeBg: string;
    nameColor: string;
  }
> = {
  Food: {
    nameColor: '#9B6B1A',
    barColor: '#E8856A',
    iconGrad: ['#FFF3E0', '#ffe4b5'] as const,
    badgeBg: '#FFF3E0',
  },
  Transport: {
    nameColor: '#1A5C9B',
    barColor: '#5B8C6E',
    iconGrad: ['#E8F4FD', '#c8e4f8'] as const,
    badgeBg: '#EEF6FF',
  },
  Shopping: {
    nameColor: '#9B1A5C',
    barColor: '#E8856A',
    iconGrad: ['#FDE8F0', '#fbc8dc'] as const,
    badgeBg: '#FFF0F3',
  },
  Bills: {
    nameColor: '#5C1A9B',
    barColor: '#C9B8F5',
    iconGrad: ['#EDE8FD', '#d8d0fa'] as const,
    badgeBg: '#F3EFFF',
  },
  Income: {
    nameColor: '#27500A',
    barColor: '#A8D5B5',
    iconGrad: ['#EFF8F2', '#d4eddf'] as const,
    badgeBg: '#EFF8F2',
  },
};

const CATEGORY_BUDGETS: Record<string, number> = {
  Food: 1500,
  Transport: 1000,
  Shopping: 2000,
  Bills: 1500,
};

// ─── MOCK DATA & TYPES ──────────────────────────────────────────────────────
type Transaction = {
  id: string;
  dateStr: string;
  title: string;
  category: string;
  account: 'GCash' | 'Cash' | 'BDO' | 'Maya';
  amount: number;
  isExpense: boolean;
  time: string;
};

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    dateStr: 'Today',
    title: 'Jollibee Drive Thru',
    category: 'Food',
    account: 'GCash',
    amount: 185.0,
    isExpense: true,
    time: '12:30 PM',
  },
  {
    id: '2',
    dateStr: 'Today',
    title: 'Freelance Payout',
    category: 'Income',
    account: 'BDO',
    amount: 25000.0,
    isExpense: false,
    time: '09:00 AM',
  },
  {
    id: '3',
    dateStr: 'Yesterday',
    title: 'Veco Bill',
    category: 'Bills',
    account: 'Maya',
    amount: 1450.0,
    isExpense: true,
    time: '08:15 PM',
  },
  {
    id: '4',
    dateStr: 'Yesterday',
    title: 'Angkas',
    category: 'Transport',
    account: 'Cash',
    amount: 80.0,
    isExpense: true,
    time: '06:00 PM',
  },
  {
    id: '5',
    dateStr: 'Mar 24',
    title: 'SM Supermarket',
    category: 'Shopping',
    account: 'BDO',
    amount: 3200.5,
    isExpense: true,
    time: '04:20 PM',
  },
  {
    id: '6',
    dateStr: 'Mar 24',
    title: 'Spotify Premium',
    category: 'Bills',
    account: 'GCash',
    amount: 149.0,
    isExpense: true,
    time: '10:00 AM',
  },
];

const CATEGORIES = ['All', 'Food', 'Transport', 'Shopping', 'Bills', 'Income'];

const ACCOUNT_TAG_STYLES = {
  GCash: { bg: '#E5F1FF', text: '#007DFF' },
  Cash: { bg: '#F0F0F0', text: '#555555' },
  BDO: { bg: '#E5EFF9', text: '#0038A8' },
  Maya: { bg: '#E6F7EC', text: '#000000' },
};

type ListItem =
  | { type: 'header'; title: string }
  | { type: 'transaction'; data: Transaction };

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
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

  const listData = useMemo(() => {
    const filtered =
      activeCategory === 'All'
        ? MOCK_TRANSACTIONS
        : MOCK_TRANSACTIONS.filter((t) => t.category === activeCategory);

    const grouped: Record<string, Transaction[]> = {};
    filtered.forEach((t) => {
      if (!grouped[t.dateStr]) grouped[t.dateStr] = [];
      grouped[t.dateStr].push(t);
    });

    const flattened: ListItem[] = [];
    Object.keys(grouped).forEach((date) => {
      flattened.push({ type: 'header', title: date });
      grouped[date].forEach((t) =>
        flattened.push({ type: 'transaction', data: t })
      );
    });
    return flattened;
  }, [activeCategory]);

  const renderCategoryProgress = () => {
    if (activeCategory === 'All' || activeCategory === 'Income') return null;

    const theme = CATEGORY_THEME[activeCategory];
    const catBudget = CATEGORY_BUDGETS[activeCategory] || 1000;

    const catSpent = MOCK_TRANSACTIONS.filter(
      (t) => t.category === activeCategory && t.isExpense
    ).reduce((sum, t) => sum + t.amount, 0);

    const pct = (catSpent / catBudget) * 100;
    const isOver = pct >= 100;
    const activeTextColor = isOver ? colors.expenseRed : theme.nameColor;

    return (
      <View style={styles.progressCard}>
        <View style={styles.progHd}>
          <Text style={[styles.progName, { color: activeTextColor }]}>
            {activeCategory} Budget
          </Text>
          <View style={styles.progMetaWrap}>
            <View
              style={[styles.progBadge, { backgroundColor: theme.badgeBg }]}
            >
              <Text style={[styles.progBadgeText, { color: activeTextColor }]}>
                {isOver ? 'Over!' : `${pct.toFixed(0)}%`}
              </Text>
            </View>
            <Text
              style={[styles.progMeta, isOver && { color: activeTextColor }]}
            >
              ₱{catSpent.toLocaleString()} / ₱{catBudget.toLocaleString()}
            </Text>
          </View>
        </View>
        <View style={styles.progTrack}>
          <View
            style={[
              styles.progFillBar,
              {
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: theme.barColor,
              },
            ]}
          />
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.dateHeaderContainer}>
          <Text style={styles.dateHeader}>{item.title.toUpperCase()}</Text>
        </View>
      );
    }
    const tx = item.data;
    const acctStyle = ACCOUNT_TAG_STYLES[tx.account];
    const theme = CATEGORY_THEME[tx.category] || CATEGORY_THEME.Shopping;

    return (
      <Pressable
        onPress={() => navigation.navigate('TransactionDetail', { id: tx.id })}
        style={({ pressed }) => [
          styles.transactionItem,
          pressed && { backgroundColor: colors.primaryLight },
        ]}
      >
        <LinearGradient colors={theme.iconGrad} style={styles.iconBox}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            {getCategoryIcon(tx.category, theme.nameColor)}
          </Svg>
        </LinearGradient>

        <View style={styles.txContent}>
          <Text style={styles.txTitle} numberOfLines={1}>
            {tx.title}
          </Text>
          <View style={styles.txSubtitleRow}>
            <Text style={styles.txTime}>{tx.time}</Text>
            <View style={styles.metaDot} />
            <View style={[styles.acctTag, { backgroundColor: acctStyle.bg }]}>
              <Text style={[styles.acctTagText, { color: acctStyle.text }]}>
                {tx.account}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.txAmount, tx.isExpense ? styles.neg : styles.pos]}>
          {tx.isExpense ? '-' : '+'}₱{tx.amount.toFixed(2)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Transactions</Text>
          <Text style={styles.headerSubtitle}>
            {listData.filter((d) => d.type === 'transaction').length} entries
            found
          </Text>
        </View>
      </View>

      {/* ─── FILTER CONTROLS ROW ─── */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.dropdownPill} activeOpacity={0.7}>
          <Ionicons
            name="calendar-outline"
            size={14}
            color={colors.primaryDark}
            style={styles.pillIcon}
          />
          <Text style={styles.dropdownPillText}>March 2026</Text>
          <Ionicons name="chevron-down" size={14} color={colors.primaryDark} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dropdownPill}
          activeOpacity={0.7}
          onPress={() => setCategoryModalVisible(true)}
        >
          <Ionicons
            name="filter-outline"
            size={14}
            color={colors.primaryDark}
            style={styles.pillIcon}
          />
          <Text style={styles.dropdownPillText}>
            {activeCategory === 'All' ? 'All Categories' : activeCategory}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primaryDark} />
        </TouchableOpacity>
      </View>

      {/* ─── TRANSACTION LIST ─── */}
      <View style={{ flex: 1 }}>
        <FlashList
          data={listData}
          renderItem={renderItem}
          ListHeaderComponent={renderCategoryProgress}
          keyExtractor={(item, index) =>
            item.type === 'header'
              ? `header-${item.title}`
              : `tx-${(item as any).data.id}-${index}`
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListFooterComponent={() =>
            listData.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreBtn} activeOpacity={0.7}>
                <Text style={styles.loadMoreText}>Load 20 more</Text>
              </TouchableOpacity>
            ) : null
          }
        />
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
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  header: { paddingHorizontal: spacing.screenPadding, marginBottom: 16 },
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
    fontSize: 13,
    color: colors.primaryDark,
    marginRight: 4,
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
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  txContent: { flex: 1, justifyContent: 'center' },
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
  acctTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  acctTagText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  txAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
  pos: { color: colors.incomeGreen },
  neg: { color: '#C0503A' },
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

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,30,46,0.06)',
  },
  modalTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: 'rgba(30,30,46,0.04)',
    borderRadius: 20,
  },
  modalScroll: { paddingHorizontal: spacing.screenPadding, paddingTop: 10 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,30,46,0.04)',
  },
  modalRowActive: {
    backgroundColor: 'rgba(45, 106, 79, 0.04)',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderBottomWidth: 0,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  modalRowText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalRowTextActive: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark,
  },
});
