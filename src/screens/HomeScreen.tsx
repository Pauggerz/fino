import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../constants/theme';

// Mock Data for the prototype
const TRANSACTIONS = [
  { id: '1', title: 'Jollibee', category: 'Food', amount: '-₱185.00', date: 'Today, 12:30 PM', icon: 'fast-food' },
  { id: '2', title: 'Spotify Premium', category: 'Entertainment', amount: '-₱149.00', date: 'Yesterday', icon: 'musical-notes' },
  { id: '3', title: 'Freelance Payout', category: 'Income', amount: '+₱5,000.00', date: 'Mar 20', icon: 'cash' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView 
      style={[styles.container, { paddingTop: Math.max(insets.top, 20) }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* --- Greeting Header --- */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey Hans! 👋</Text>
          <Text style={styles.subtitle}>Your money, finally making sense.</Text>
        </View>
        <TouchableOpacity style={styles.profileButton} activeOpacity={0.8}>
          <Ionicons name="person" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* --- Hero Balance Card --- */}
      <View style={styles.heroCard}>
        {/* Subtle light streak effect */}
        <View style={styles.heroStreak} />
        
        <Text style={styles.heroLabel}>Total Balance</Text>
        {/* Designed to eventually use DM Mono when fonts are loaded */}
        <Text style={styles.heroAmount}>₱12,450.00</Text>
        
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatChip}>
            <Ionicons name="arrow-down" size={16} color={colors.white} />
            <Text style={styles.heroStatText}>Spent: ₱3,200</Text>
          </View>
          <View style={[styles.heroStatChip, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Ionicons name="arrow-up" size={16} color={colors.white} />
            <Text style={styles.heroStatText}>Budget: ₱15,650</Text>
          </View>
        </View>
      </View>

      {/* --- Quick Action Chips --- */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity style={styles.actionChip} activeOpacity={0.8}>
          <Ionicons name="scan" size={20} color={colors.primary} />
          <Text style={styles.actionChipText}>Scan Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} activeOpacity={0.8}>
          <Ionicons name="pie-chart" size={20} color={colors.primary} />
          <Text style={styles.actionChipText}>Insights</Text>
        </TouchableOpacity>
      </View>

      {/* --- Recent Activity Feed --- */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <TouchableOpacity activeOpacity={0.6}>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.transactionsContainer}>
        {TRANSACTIONS.map((tx, index) => (
          <TouchableOpacity 
            key={tx.id} 
            activeOpacity={0.7}
            style={[
              styles.transactionItem,
              index === TRANSACTIONS.length - 1 && styles.lastTransactionItem
            ]}
          >
            <View style={styles.txLeft}>
              <View style={styles.txIconContainer}>
                <Ionicons name={tx.icon as any} size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.txTitle}>{tx.title}</Text>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
            </View>
            <Text style={[
              styles.txAmount,
              tx.amount.startsWith('+') ? styles.txPositive : styles.txNegative
            ]}>
              {tx.amount}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Safe padding to account for our custom TabBar */}
      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2', // colors.secondary
  },
  contentContainer: {
    paddingHorizontal: 20, // spacing.screenPadding
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28, // spacing.sectionGap
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1E2E', // colors.textPrimary
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
    fontWeight: '500',
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroCard: {
    backgroundColor: '#5B8C6E', // colors.primary
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#5B8C6E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 24,
  },
  heroStreak: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 90,
    transform: [{ scaleX: 1.5 }, { rotate: '-20deg' }],
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.5,
    marginBottom: 24,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  heroStatText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  actionChipText: {
    color: '#1E1E2E',
    fontWeight: '700',
    fontSize: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E1E2E',
  },
  seeAllText: {
    color: '#5B8C6E',
    fontWeight: '700',
    fontSize: 14,
  },
  transactionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 1,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F5F2', // Secondary background acts as border
  },
  lastTransactionItem: {
    borderBottomWidth: 0,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  txIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBF2EE', // primaryLight
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1E2E',
    marginBottom: 4,
  },
  txDate: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  txNegative: {
    color: '#1E1E2E',
  },
  txPositive: {
    color: '#5B8C6E',
  },
});