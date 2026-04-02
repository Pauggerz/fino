import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../constants/theme';

// ─── MOCK DATA ──────────────────────────────────────────────────────────────

const ACCOUNTS = [
  {
    id: '1',
    name: 'Cash',
    balance: '1,250.00',
    color: '#555555',
    bg: '#F0F0F0',
    letter: 'C',
  },
  {
    id: '2',
    name: 'GCash',
    balance: '4,820.50',
    color: '#007DFF',
    bg: '#E5F1FF',
    letter: 'G',
  },
  {
    id: '3',
    name: 'BDO',
    balance: '25,000.00',
    color: '#0038A8',
    bg: '#E5EFF9',
    letter: 'B',
  },
  {
    id: '4',
    name: 'Maya',
    balance: '1,450.00',
    color: '#000000',
    bg: '#E6F7EC',
    letter: 'M',
  },
];

const TOOLS = [
  {
    id: 'fino',
    label: 'Ask Fino',
    icon: 'sparkles',
    route: 'ChatScreen',
    color: '#534AB7',
    bg: '#EEEDFE',
  },
  {
    id: 'budget',
    label: 'Budget settings',
    icon: 'pie-chart',
    route: 'stats',
    color: '#2d6a4f',
    bg: '#EFF8F2',
  },
  {
    id: 'bills',
    label: 'Bill reminders',
    icon: 'receipt',
    route: 'Placeholder',
    color: '#BA7517',
    bg: '#FFF8F0',
  },
  {
    id: 'settings',
    label: 'App settings',
    icon: 'settings-sharp',
    route: 'Placeholder',
    color: '#555555',
    bg: '#F0F0F0',
  },
];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const handleToolPress = (route: string) => {
    if (route !== 'Placeholder') {
      navigation.navigate(route);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <Text style={styles.headerSubtitle}>Manage your money</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── MY ACCOUNTS SECTION ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY ACCOUNTS</Text>

          <View style={styles.acctCard}>
            {ACCOUNTS.map((acct, index) => (
              <TouchableOpacity
                key={acct.id}
                style={[
                  styles.acctRow,
                  index === ACCOUNTS.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => navigation.navigate('AccountDetailScreen')}
                activeOpacity={0.7}
              >
                <View style={styles.acctRowLeft}>
                  <View style={[styles.avatar, { backgroundColor: acct.bg }]}>
                    <Text style={[styles.avatarText, { color: acct.color }]}>
                      {acct.letter}
                    </Text>
                  </View>
                  <Text style={styles.acctName}>{acct.name}</Text>
                </View>

                <View style={styles.acctRowRight}>
                  <Text style={styles.acctBalance}>₱{acct.balance}</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color="#B4B2A9"
                    style={{ marginLeft: 8 }}
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Add Account Button */}
          <TouchableOpacity style={styles.addAccountRow} activeOpacity={0.7}>
            <View style={styles.addAccountCircle}>
              <Ionicons name="add" size={18} color="#2d6a4f" />
            </View>
            <Text style={styles.addAccountText}>Add new account</Text>
          </TouchableOpacity>
        </View>

        {/* ─── BILL REMINDER CARD ─── */}
        <TouchableOpacity style={styles.billCard} activeOpacity={0.8}>
          <View style={styles.billIconBox}>
            <Ionicons name="notifications" size={22} color="#BA7517" />
          </View>
          <View style={styles.billContent}>
            <Text style={styles.billTag}>⏰ BILL REMINDER</Text>
            <Text style={styles.billTitle}>Veco Electricity</Text>
            <Text style={styles.billMeta}>Due in 3 days • ₱1,450.00</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#D9B98A" />
        </TouchableOpacity>

        {/* ─── TOOLS SECTION ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TOOLS</Text>

          <View style={styles.toolsCard}>
            {TOOLS.map((tool, index) => (
              <TouchableOpacity
                key={tool.id}
                style={[
                  styles.toolRow,
                  index === TOOLS.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => handleToolPress(tool.route)}
                activeOpacity={0.7}
              >
                <View style={styles.toolRowLeft}>
                  <View
                    style={[styles.toolIconBox, { backgroundColor: tool.bg }]}
                  >
                    <Ionicons
                      name={tool.icon as any}
                      size={18}
                      color={tool.color}
                    />
                  </View>
                  <Text style={styles.toolName}>{tool.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B4B2A9" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2', // Matches root theme
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 24,
    paddingTop: 12,
  },
  headerTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 80, // Extra padding for bottom tabs
  },

  // Section Structure
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },

  // Accounts Card
  acctCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  acctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFEA',
  },
  acctRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 16,
  },
  acctName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  acctRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  acctBalance: {
    fontFamily: 'DMMono_500Medium', // Used Medium as 700 bold fallback per your setup
    fontSize: 14,
    color: colors.textPrimary,
  },

  // Add Account Button
  addAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2d6a4f',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(45, 106, 79, 0.02)',
  },
  addAccountCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2d6a4f',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: '#FFFFFF',
  },
  addAccountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#2d6a4f',
  },

  // Bill Reminder Card
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8F0',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EF9F27',
    marginBottom: 32,
  },
  billIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FAEEDA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  billContent: {
    flex: 1,
  },
  billTag: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#BA7517',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  billTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  billMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Tools Card
  toolsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFEA',
  },
  toolRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  toolName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
});
