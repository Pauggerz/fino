import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius, spacing } from '../constants/theme';

// Sourced directly from your theme.ts category pill styling
const CATEGORIES = [
  { id: 'food', label: 'Food', icon: 'fast-food', bg: colors.pillFoodBg, text: colors.pillFoodText, border: colors.pillFoodBorder },
  { id: 'transport', label: 'Transport', icon: 'car', bg: colors.pillTransportBg, text: colors.pillTransportText, border: colors.pillTransportBorder },
  { id: 'shopping', label: 'Shopping', icon: 'bag-handle', bg: colors.pillShoppingBg, text: colors.pillShoppingText, border: colors.pillShoppingBorder },
  { id: 'bills', label: 'Bills', icon: 'document-text', bg: colors.pillBillsBg, text: colors.pillBillsText, border: colors.pillBillsBorder },
  { id: 'health', label: 'Health', icon: 'medkit', bg: colors.pillHealthBg, text: colors.pillHealthText, border: colors.pillHealthBorder },
];

export default function AddTransactionSheet() {
  const navigation = useNavigation();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  // Auto-focus the input to immediately pop the number pad (removes 1 tap from the flow)
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = () => {
    // TODO: Connect to backend/migrations/003_transactions.sql table via Supabase
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* --- Header --- */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Transaction</Text>
        <View style={styles.iconButton} /* Spacer for flex alignment */ />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        
        {/* --- Type Toggle (Expense vs Income) --- */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity 
            style={[styles.toggleButton, type === 'expense' && styles.toggleExpenseActive]}
            onPress={() => setType('expense')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, type === 'expense' && styles.toggleTextActive]}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleButton, type === 'income' && styles.toggleIncomeActive]}
            onPress={() => setType('income')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, type === 'income' && styles.toggleTextActive]}>Income</Text>
          </TouchableOpacity>
        </View>

        {/* --- Amount Display --- */}
        <View style={styles.amountContainer}>
          <Text style={[
            styles.currencySymbol, 
            type === 'expense' ? { color: colors.expenseRed } : { color: colors.incomeGreen }
          ]}>
            {type === 'expense' ? '-₱' : '+₱'}
          </Text>
          <TextInput
            ref={inputRef}
            style={[
              styles.amountInput, 
              type === 'expense' ? { color: colors.expenseRed } : { color: colors.incomeGreen }
            ]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            maxLength={9}
          />
        </View>

        {/* --- Date Pill --- */}
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.datePill} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
            <Text style={styles.dateText}>Today, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* --- Category Grid --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryPill,
                    { backgroundColor: cat.bg },
                    isSelected && { borderColor: cat.border, borderWidth: 2, backgroundColor: colors.white }
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={cat.icon as any} size={18} color={cat.text} />
                  <Text style={[styles.categoryText, { color: cat.text }]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* --- Footer Action --- */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[
            styles.saveButton, 
            (!amount || !selectedCategory) && styles.saveButtonDisabled
          ]}
          onPress={handleSave}
          disabled={!amount || !selectedCategory}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>Save Transaction</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // #F7F5F2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
    paddingBottom: 40,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#EBEBEB', // Subdued background for the toggle track
    borderRadius: radius.pill20,
    padding: 4,
    marginBottom: 32,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill20 - 4,
    alignItems: 'center',
  },
  toggleExpenseActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleIncomeActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.textPrimary,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -2,
    minWidth: 100,
    textAlign: 'center',
  },
  dateRow: {
    alignItems: 'center',
    marginBottom: 40,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill20,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    padding: spacing.screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24, // iOS safe area
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    backgroundColor: colors.primary, // #5B8C6E
    paddingVertical: 18,
    borderRadius: radius.button, // 16
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D1D6',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});