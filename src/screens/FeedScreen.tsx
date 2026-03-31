import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, gradients, radius, spacing } from '../constants/theme';

// ─── MOCK DATA & TYPES ──────────────────────────────────────────────────────

type Transaction = {
  id: string;
  dateStr: string;
  title: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
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
    icon: 'fast-food',
    iconBg: colors.pillFoodBg,
    iconColor: colors.pillFoodText,
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
    icon: 'cash',
    iconBg: '#E8F5EE',
    iconColor: '#27500A',
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
    icon: 'bulb',
    iconBg: '#EEEDFE',
    iconColor: '#4B2DA3',
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
    icon: 'car',
    iconBg: colors.pillTransportBg,
    iconColor: colors.pillTransportText,
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
    icon: 'cart',
    iconBg: colors.pillShoppingBg,
    iconColor: colors.pillShoppingText,
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
    icon: 'musical-notes',
    iconBg: '#EEEDFE',
    iconColor: '#4B2DA3',
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
  const [activeCategory, setActiveCategory] = useState('All');

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

    return (
      <Pressable
        onPress={() => navigation.navigate('TransactionDetail', { id: tx.id })}
        style={({ pressed }) => [
          styles.transactionItem,
          pressed && { backgroundColor: colors.primaryLight },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: tx.iconBg }]}>
          <Ionicons name={tx.icon} size={20} color={tx.iconColor} />
        </View>

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
            March 2026 · {MOCK_TRANSACTIONS.length} entries
          </Text>
        </View>
        <TouchableOpacity style={styles.monthPill} activeOpacity={0.7}>
          <Text style={styles.monthPillText}>March 2026 ▾</Text>
        </TouchableOpacity>
      </View>

      {/* ─── FILTER ROW ─── */}
      <View style={styles.filterWrapper}>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: spacing.screenPadding }}
          renderItem={({ item }) => {
            const isActive = activeCategory === item;

            return (
              <TouchableOpacity
                onPress={() => setActiveCategory(item)}
                activeOpacity={0.8}
              >
                {isActive ? (
                  <LinearGradient
                    colors={gradients.primaryHero as [string, string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.chipActive}
                  >
                    <Text style={styles.chipTextActive}>{item}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.chipInactive}>
                    <Text style={styles.chipTextInactive}>{item}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ─── TRANSACTION LIST ─── */}
      <View style={{ flex: 1 }}>
        <FlashList
          data={listData}
          renderItem={renderItem}
          estimatedItemSize={64}
          keyExtractor={(item, index) =>
            item.type === 'header'
              ? `header-${item.title}`
              : `tx-${(item as { type: 'transaction'; data: Transaction }).data.id}-${index}`
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
    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60, // Hardcoded top padding to bypass safe-area-context
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
    color: '#C0503A', // expenseRed from your theme
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
