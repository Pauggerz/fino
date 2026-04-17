// src/screens/MoreScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccounts } from '@/hooks/useAccounts';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import { supabase } from '@/services/supabase';
import { INCOME_CATEGORIES } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Skeleton } from '@/components/Skeleton';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Global Theme Context

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const ACCOUNT_COLORS = [
  '#2d6a4f',
  '#3A80C0',
  '#C97A20',
  '#7A4AB8',
  '#C0503A',
  '#1a7a6e',
  '#1E1E2E',
  '#888780',
];

const INCOME_KEYS = new Set(INCOME_CATEGORIES.map((c) => c.key));

// ─── Types ────────────────────────────────────────────────────────────────────

interface BudgetCategory {
  id: string;
  name: string;
  emoji: string | null;
  budget_limit: number | null;
  text_colour: string | null;
  tile_bg_colour: string | null;
}

interface BillReminder {
  id: string;
  user_id: string;
  title: string;
  amount: number | null;
  due_date: string;
  is_recurring: boolean;
  is_paid: boolean;
}

// ─── ADD ACCOUNT MODAL ───────────────────────────────────────────────────────

export function AddAccountModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors, isDark } = useTheme();
  const modalStyles = useMemo(
    () => createModalStyles(colors, isDark),
    [colors, isDark]
  );
  const addAccStyles = useMemo(
    () => createAddAccStyles(colors, isDark),
    [colors, isDark]
  );

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [selectedColor, setSelectedColor] = useState(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setBalance('');
    setSelectedColor(ACCOUNT_COLORS[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an account name.');
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const startBal = parseFloat(balance) || 0;
    const letter = name.trim()[0].toUpperCase();

    await supabase.from('accounts').insert({
      user_id: user.id,
      name: name.trim(),
      type: 'manual',
      brand_colour: selectedColor,
      letter_avatar: letter,
      balance: startBal,
      starting_balance: startBal,
      is_active: true,
      is_deletable: true,
      sort_order: 99,
    });

    setSaving(false);
    reset();
    onSaved();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.white }}
      >
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>Add Account</Text>
            <TouchableOpacity
              onPress={() => {
                reset();
                onClose();
              }}
              activeOpacity={0.7}
              style={{ padding: 11 }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={addAccStyles.preview}>
              <View
                style={[
                  addAccStyles.previewAvatar,
                  { backgroundColor: selectedColor },
                ]}
              >
                <Text style={addAccStyles.previewLetter}>
                  {name.trim()[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <Text style={addAccStyles.previewName}>
                {name.trim() || 'Account Name'}
              </Text>
              <Text style={addAccStyles.previewBalance}>
                ₱
                {parseFloat(balance || '0').toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>ACCOUNT NAME</Text>
              <TextInput
                style={modalStyles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Maya, Seabank, Cash"
                placeholderTextColor={colors.textSecondary}
                maxLength={30}
              />
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>STARTING BALANCE</Text>
              <View style={modalStyles.pesoInputRow}>
                <Text style={modalStyles.pesoSign}>₱</Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      flex: 1,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                    },
                  ]}
                  value={balance}
                  onChangeText={(t) => setBalance(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={modalStyles.fieldGroup}>
              <Text style={modalStyles.fieldLabel}>ACCOUNT COLOR</Text>
              <View style={addAccStyles.colorRow}>
                {ACCOUNT_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      addAccStyles.colorDot,
                      { backgroundColor: c },
                      selectedColor === c && addAccStyles.colorDotSelected,
                    ]}
                    onPress={() => setSelectedColor(c)}
                    activeOpacity={0.8}
                  >
                    {selectedColor === c && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[modalStyles.primaryBtn, { marginTop: 24 }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={modalStyles.primaryBtnText}>Add Account</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function getDueLabel(diffDays: number): string {
  if (diffDays === 0) return 'Due today';
  if (diffDays > 0) return `Due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`;
}

// ─── BILL QUICK VIEW MODAL ────────────────────────────────────────────────────

function BillQuickViewModal({
  visible,
  bill,
  onClose,
  onPaid,
}: {
  visible: boolean;
  bill: BillReminder | null;
  onClose: () => void;
  onPaid: (id: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const modalStyles = useMemo(
    () => createModalStyles(colors, isDark),
    [colors, isDark]
  );
  const quickStyles = useMemo(
    () => createQuickStyles(colors, isDark),
    [colors, isDark]
  );

  if (!bill) return null;

  const dueDate = new Date(bill.due_date);
  const today = new Date();
  const diffMs = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const dueLabel = getDueLabel(diffDays);
  const isOverdue = diffDays < 0;

  const handleMarkPaid = async () => {
    await supabase
      .from('bill_reminders')
      .update({ is_paid: true })
      .eq('id', bill.id);
    onPaid(bill.id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable style={quickStyles.card} onPress={() => {}}>
          <View style={quickStyles.iconWrap}>
            <Ionicons
              name="notifications"
              size={28}
              color={colors.statWarnBar}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="time-outline" size={11} color={colors.statWarnBar} />
            <Text style={quickStyles.tagText}>BILL REMINDER</Text>
          </View>
          <Text style={quickStyles.title}>{bill.title}</Text>
          {bill.amount != null && (
            <Text style={quickStyles.amount}>
              ₱
              {bill.amount.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
              })}
            </Text>
          )}
          <View
            style={[
              quickStyles.dueBadge,
              isOverdue && quickStyles.dueBadgeOverdue,
            ]}
          >
            <Text
              style={[
                quickStyles.dueText,
                isOverdue && { color: colors.expenseRed },
              ]}
            >
              {dueLabel}
            </Text>
          </View>
          {bill.is_recurring && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="repeat" size={12} color={colors.textSecondary} />
              <Text style={quickStyles.recurringNote}>Recurring monthly</Text>
            </View>
          )}

          <View style={quickStyles.actions}>
            <TouchableOpacity
              style={quickStyles.paidBtn}
              onPress={handleMarkPaid}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={quickStyles.paidBtnText}>Mark as Paid</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={quickStyles.dismissBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={quickStyles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── BUDGET SETTINGS MODAL ────────────────────────────────────────────────────

function BudgetSettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const modalStyles = useMemo(
    () => createModalStyles(colors, isDark),
    [colors, isDark]
  );
  const budgetStyles = useMemo(
    () => createBudgetStyles(colors, isDark),
    [colors, isDark]
  );

  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('categories')
        .select('id, name, emoji, budget_limit, text_colour, tile_bg_colour')
        .eq('is_active', true)
        .order('sort_order');

      const expenseOnly = (data ?? []).filter(
        (cat) => !INCOME_KEYS.has((cat.emoji ?? '').toLowerCase())
      );
      setCategories(expenseOnly);
      const initial: Record<string, string> = {};
      expenseOnly.forEach((c) => {
        initial[c.id] = c.budget_limit != null ? String(c.budget_limit) : '';
      });
      setEdits(initial);
      setLoading(false);
    };
    fetch();
  }, [visible]);

  const handleSave = async () => {
    setSaving(true);
    await Promise.all(
      categories.map((cat) =>
        supabase
          .from('categories')
          .update({ budget_limit: parseFloat(edits[cat.id] || '0') || null })
          .eq('id', cat.id)
      )
    );
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={modalStyles.sheet}>
        <View style={modalStyles.handle} />
        <View style={modalStyles.sheetHeader}>
          <Text style={modalStyles.sheetTitle}>Budget Settings</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 11 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ backgroundColor: colors.catTileEmptyBg, borderRadius: 12, padding: 12, marginBottom: 20 }}>
              <Text style={budgetStyles.hint}>
                Set monthly spending limits for each category. Leave blank for no
                limit.
              </Text>
            </View>
            {categories.map((cat) => {
              const color = cat.text_colour ?? colors.textSecondary;
              const bg = cat.tile_bg_colour ?? colors.catTileEmptyBg;
              return (
                <View key={cat.id} style={budgetStyles.catRow}>
                  <View
                    style={[
                      budgetStyles.catIconCircle,
                      { backgroundColor: bg },
                    ]}
                  >
                    <CategoryIcon
                      categoryKey={cat.name.toLowerCase()}
                      color={color}
                      size={18}
                      wrapperSize={28}
                    />
                  </View>
                  <Text style={[budgetStyles.catName, { color }]}>
                    {cat.name}
                  </Text>
                  <View style={budgetStyles.budgetInputRow}>
                    <Text style={budgetStyles.pesoSign}>₱</Text>
                    <TextInput
                      style={budgetStyles.budgetInput}
                      value={edits[cat.id] ?? ''}
                      onChangeText={(v) =>
                        setEdits((prev) => ({
                          ...prev,
                          [cat.id]: v.replace(/[^0-9]/g, ''),
                        }))
                      }
                      placeholder="No limit"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              );
            })}
            <TouchableOpacity
              style={[modalStyles.primaryBtn, { marginTop: 24 }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={modalStyles.primaryBtnText}>Save Budgets</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({
  label,
  display,
  onIncrement,
  onDecrement,
}: {
  label: string;
  display: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text
        style={{
          fontSize: 10,
          color: colors.textSecondary,
          fontFamily: 'Inter_400Regular',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <TouchableOpacity
        onPress={onIncrement}
        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
        accessibilityLabel={`Increase ${label}`}
      >
        <Ionicons name="chevron-up" size={18} color={colors.primary} />
      </TouchableOpacity>
      <Text
        style={{
          fontFamily: 'DMMono_500Medium',
          fontSize: 17,
          color: colors.textPrimary,
          marginVertical: 2,
          minWidth: 44,
          textAlign: 'center',
        }}
      >
        {display}
      </Text>
      <TouchableOpacity
        onPress={onDecrement}
        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
        accessibilityLabel={`Decrease ${label}`}
      >
        <Ionicons name="chevron-down" size={18} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── BILL REMINDERS MANAGER MODAL ─────────────────────────────────────────────

function BillRemindersModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const modalStyles = useMemo(
    () => createModalStyles(colors, isDark),
    [colors, isDark]
  );
  const billStyles = useMemo(
    () => createBillStyles(colors, isDark),
    [colors, isDark]
  );
  const stepperStyles = useMemo(
    () => createStepperStyles(colors, isDark),
    [colors, isDark]
  );

  const [bills, setBills] = useState<BillReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [dueMonth, setDueMonth] = useState(new Date().getMonth());
  const [dueDay, setDueDay] = useState(new Date().getDate());
  const [dueYear, setDueYear] = useState(new Date().getFullYear());
  const [newRecurring, setNewRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const BILLS_CACHE_KEY = 'FINO_BILLS_CACHE';

  const fetchBills = useCallback(async () => {
    // 1. Serve from cache immediately — no spinner for returning users
    try {
      const cached = await AsyncStorage.getItem(BILLS_CACHE_KEY);
      if (cached) {
        setBills(JSON.parse(cached) as BillReminder[]);
        setLoading(false);
      }
    } catch (err) {
      if (__DEV__) console.warn('[MoreScreen] bills cache read failed:', err);
    }

    // 2. Background revalidation from Supabase
    const { data } = await supabase
      .from('bill_reminders')
      .select('*')
      .eq('is_paid', false)
      .order('due_date');

    const fresh = (data as BillReminder[]) ?? [];
    setBills(fresh);
    AsyncStorage.setItem(BILLS_CACHE_KEY, JSON.stringify(fresh)).catch((err) => {
      if (__DEV__) console.warn('[MoreScreen] bills cache write failed:', err);
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) fetchBills();
  }, [visible, fetchBills]);

  const handleAddBill = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Required', 'Please enter a bill name.');
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const daysInMonth = new Date(dueYear, dueMonth + 1, 0).getDate();
    const safeDay = Math.min(dueDay, daysInMonth);
    const dueDateISO = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

    // Optimistic: add a placeholder to the list immediately, then close
    const optimisticBill: BillReminder = {
      id: `optimistic-${Date.now()}`,
      user_id: user.id,
      title: newTitle.trim(),
      amount: newAmount ? parseFloat(newAmount) : null,
      due_date: dueDateISO,
      is_recurring: newRecurring,
      is_paid: false,
    };
    const snapshot = bills;
    updateBillsCache([...bills, optimisticBill]);

    setNewTitle('');
    setNewAmount('');
    setDueMonth(new Date().getMonth());
    setDueDay(new Date().getDate());
    setDueYear(new Date().getFullYear());
    setNewRecurring(false);
    setSaving(false);
    setShowAdd(false);

    // Background insert, then refetch to get the real row with correct ID/sort
    const { error } = await supabase.from('bill_reminders').insert({
      user_id: user.id,
      title: optimisticBill.title,
      amount: optimisticBill.amount,
      due_date: dueDateISO,
      is_recurring: newRecurring,
      is_paid: false,
    });

    if (error) {
      updateBillsCache(snapshot);
      Alert.alert('Sync failed', error.message);
    } else {
      // Silent background refetch to get the canonical sorted list
      fetchBills();
    }
  };

  const updateBillsCache = (updated: BillReminder[]) => {
    setBills(updated);
    AsyncStorage.setItem(BILLS_CACHE_KEY, JSON.stringify(updated)).catch((err) => {
      if (__DEV__) console.warn('[MoreScreen] bills cache write failed:', err);
    });
  };

  const handleMarkPaid = async (id: string) => {
    // Optimistically remove from the unpaid list
    const snapshot = bills;
    updateBillsCache(bills.filter((b) => b.id !== id));

    const { error } = await supabase
      .from('bill_reminders')
      .update({ is_paid: true })
      .eq('id', id);
    if (error) updateBillsCache(snapshot);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Reminder', 'Remove this bill reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const snapshot = bills;
          updateBillsCache(bills.filter((b) => b.id !== id));

          const { error } = await supabase.from('bill_reminders').delete().eq('id', id);
          if (error) updateBillsCache(snapshot);
        },
      },
    ]);
  };

  const today = new Date();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={modalStyles.sheet}>
        <View style={modalStyles.handle} />
        <View style={modalStyles.sheetHeader}>
          <Text style={modalStyles.sheetTitle}>Bill Reminders</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 11 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {showAdd ? (
            <View style={billStyles.addForm}>
              <Text style={modalStyles.fieldLabel}>BILL NAME</Text>
              <TextInput
                style={modalStyles.input}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Rent, Netflix"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={[modalStyles.fieldLabel, { marginTop: 14 }]}>
                AMOUNT (optional)
              </Text>
              <View style={modalStyles.pesoInputRow}>
                <Text style={modalStyles.pesoSign}>₱</Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      flex: 1,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                    },
                  ]}
                  value={newAmount}
                  onChangeText={(t) => setNewAmount(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              <Text style={[modalStyles.fieldLabel, { marginTop: 14 }]}>
                DUE DATE
              </Text>
              <View style={stepperStyles.card}>
                <Stepper
                  label="Month"
                  display={MONTHS_SHORT[dueMonth]}
                  onIncrement={() => setDueMonth((m) => (m + 1) % 12)}
                  onDecrement={() => setDueMonth((m) => (m + 11) % 12)}
                />
                <Stepper
                  label="Day"
                  display={String(dueDay)}
                  onIncrement={() => {
                    const max = new Date(dueYear, dueMonth + 1, 0).getDate();
                    setDueDay((d) => (d < max ? d + 1 : 1));
                  }}
                  onDecrement={() => {
                    const max = new Date(dueYear, dueMonth + 1, 0).getDate();
                    setDueDay((d) => (d > 1 ? d - 1 : max));
                  }}
                />
                <Stepper
                  label="Year"
                  display={String(dueYear)}
                  onIncrement={() => setDueYear((y) => y + 1)}
                  onDecrement={() => setDueYear((y) => y - 1)}
                />
              </View>

              <View style={billStyles.recurringRow}>
                <Text style={billStyles.recurringLabel}>Recurring monthly</Text>
                <Switch
                  value={newRecurring}
                  onValueChange={setNewRecurring}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={billStyles.addFormActions}>
                <TouchableOpacity
                  style={billStyles.cancelBtn}
                  onPress={() => setShowAdd(false)}
                  activeOpacity={0.7}
                >
                  <Text style={billStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    modalStyles.primaryBtn,
                    { flex: 1, marginTop: 0 },
                    saving && { opacity: 0.6 },
                  ]}
                  onPress={handleAddBill}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={modalStyles.primaryBtnText}>Save Bill</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={billStyles.addNewBtn}
              onPress={() => setShowAdd(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={billStyles.addNewText}>Add new bill reminder</Text>
            </TouchableOpacity>
          )}

          {loading && (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 24 }}
            />
          )}
          {!loading && bills.length === 0 && !showAdd && (
            <View style={billStyles.emptyState}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.catTileEmptyBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="notifications-outline" size={30} color={colors.textSecondary} />
              </View>
              <Text style={billStyles.emptyTitle}>No upcoming bills</Text>
              <Text style={billStyles.emptySubtitle}>
                Add a reminder so you never miss a payment.
              </Text>
            </View>
          )}
          {!loading &&
            bills.map((bill) => {
              const dueDate = new Date(bill.due_date);
              const diffDays = Math.ceil(
                (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              );
              const isOverdue = diffDays < 0;
              const dueLabel = getDueLabel(diffDays);

              return (
                <View
                  key={bill.id}
                  style={[
                    billStyles.billRow,
                    isOverdue && billStyles.billRowOverdue,
                  ]}
                >
                  <View
                    style={[
                      billStyles.billIconBox,
                      isOverdue && billStyles.billIconBoxOverdue,
                    ]}
                  >
                    <Ionicons
                      name="notifications"
                      size={20}
                      color={isOverdue ? colors.expenseRed : colors.statWarnBar}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={billStyles.billTitle}>{bill.title}</Text>
                    <Text
                      style={[
                        billStyles.billDue,
                        isOverdue && { color: colors.expenseRed },
                      ]}
                    >
                      {dueLabel}
                    </Text>
                    {bill.amount != null && (
                      <Text style={billStyles.billAmt}>
                        ₱
                        {bill.amount.toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                        })}
                      </Text>
                    )}
                  </View>
                  <View style={billStyles.billActions}>
                    <TouchableOpacity
                      onPress={() => handleMarkPaid(bill.id)}
                      style={billStyles.paidPill}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="checkmark"
                        size={13}
                        color={colors.primary}
                      />
                      <Text style={billStyles.paidPillText}>Paid</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(bill.id)}
                      activeOpacity={0.7}
                      style={{ padding: 8 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();

  const styles = useMemo(
    () => createMainStyles(colors, isDark),
    [colors, isDark]
  );

  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [showBillReminders, setShowBillReminders] = useState(false);
  const [quickViewBill, setQuickViewBill] = useState<BillReminder | null>(null);

  const handleToolPress = (id: string) => {
    if (id === 'fino') navigation.navigate('ChatScreen');
    else if (id === 'budget') setShowBudgetSettings(true);
    else if (id === 'bills') setShowBillReminders(true);
    else if (id === 'settings') setShowAppSettings(true);
    else if (id === 'splitter') navigation.navigate('BillSplitter');
    else if (id === 'utang') navigation.navigate('UtangTracker');
    else if (id === 'savings') navigation.navigate('SavingsGoal');
  };

  const TOOLS = [
    {
      id: 'fino',
      label: 'Ask Fino',
      desc: 'Chat with your AI money coach',
      icon: 'sparkles',
      color: colors.insightPurple,
      bg: colors.lavenderLight,
    },
    {
      id: 'budget',
      label: 'Budget',
      desc: 'Set monthly spending limits',
      icon: 'pie-chart',
      color: colors.primary,
      bg: colors.primaryLight,
    },
    {
      id: 'bills',
      label: 'Bills',
      desc: 'Manage upcoming reminders',
      icon: 'receipt',
      color: colors.statWarnBar,
      bg: isDark ? '#3A2E1D' : '#FFF8F0',
    },
    {
      id: 'splitter',
      label: 'Bill Splitter',
      desc: 'Split a receipt between friends',
      icon: 'people',
      color: '#3A7BD5',
      bg: isDark ? '#111E30' : '#EAF1FB',
    },
    {
      id: 'utang',
      label: 'Utang Tracker',
      desc: 'Track who owes you money',
      icon: 'cash',
      color: '#10B981',
      bg: isDark ? '#0D2E23' : '#ECFDF5',
    },
    {
      id: 'savings',
      label: 'Savings Goals',
      desc: 'Set and track financial targets',
      icon: 'flag',
      color: '#F59E0B',
      bg: isDark ? '#2E2208' : '#FFFBEB',
    },
    {
      id: 'settings',
      label: 'Settings',
      desc: 'Theme and app preferences',
      icon: 'settings-sharp',
      color: colors.textSecondary,
      bg: colors.catTileEmptyBg,
    },
  ];

  const otherTools = TOOLS.filter(t => t.id !== 'fino');

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top + 8, 20) }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tools</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Ask Fino hero card ── */}
        <TouchableOpacity
          style={styles.finoHero}
          onPress={() => handleToolPress('fino')}
          activeOpacity={0.88}
        >
          {/* gradient bg */}
          <View style={StyleSheet.absoluteFillObject}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? '#1A1426' : colors.lavenderLight }]} />
            {/* decorative blobs */}
            <View style={styles.heroBlob1} />
            <View style={styles.heroBlob2} />
          </View>

          {/* Left content */}
          <View style={{ flex: 1 }}>
            <View style={styles.finoBadge}>
              <Ionicons name="sparkles" size={11} color={colors.insightPurple} />
              <Text style={[styles.finoBadgeText, { color: colors.insightPurple }]}>AI POWERED</Text>
            </View>
            <Text style={[styles.finoTitle, { color: isDark ? '#E8E0FF' : colors.lavenderDark }]}>
              Ask Fino
            </Text>
            <Text style={[styles.finoSub, { color: isDark ? 'rgba(220,210,255,0.65)' : colors.insightPurple }]}>
              Your personal AI money coach. Ask anything about your finances.
            </Text>
            <View style={[styles.finoBtn, { backgroundColor: isDark ? 'rgba(176,154,224,0.18)' : 'rgba(75,45,163,0.1)' }]}>
              <Text style={[styles.finoBtnText, { color: isDark ? '#C9B8F5' : colors.lavenderDark }]}>
                Start chatting
              </Text>
              <Ionicons name="arrow-forward" size={13} color={isDark ? '#C9B8F5' : colors.lavenderDark} />
            </View>
          </View>

          {/* Right icon */}
          <View style={[styles.finoIconWrap, { backgroundColor: isDark ? 'rgba(176,154,224,0.15)' : 'rgba(75,45,163,0.08)' }]}>
            <Ionicons name="sparkles" size={36} color={isDark ? '#C9B8F5' : colors.lavenderDark} />
          </View>
        </TouchableOpacity>

        {/* ── Other tools ── */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.toolsGrid}>
          {otherTools.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={[styles.toolTile, { backgroundColor: colors.white }]}
              onPress={() => handleToolPress(tool.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.toolIconBox, { backgroundColor: tool.bg }]}>
                <Ionicons name={tool.icon as any} size={22} color={tool.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolName}>{tool.label}</Text>
                <Text style={styles.toolDesc}>{tool.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={{ opacity: 0.5 }} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BillQuickViewModal
        visible={!!quickViewBill}
        bill={quickViewBill}
        onClose={() => setQuickViewBill(null)}
        onPaid={() => setQuickViewBill(null)}
      />
      <BudgetSettingsModal
        visible={showBudgetSettings}
        onClose={() => setShowBudgetSettings(false)}
      />
      <BillRemindersModal
        visible={showBillReminders}
        onClose={() => setShowBillReminders(false)}
      />
    </View>
  );
}

// ─── DYNAMIC STYLES ───────────────────────────────────────────────────────────

const createMainStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 8,
      paddingBottom: 12,
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
    loginBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    loginBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: '#FFFFFF',
    },
    loggedInPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.primaryLight,
      borderWidth: 1,
      borderColor: colors.primaryTransparent30,
      maxWidth: 160,
    },
    loggedInPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.primary,
    },
    scrollContent: {
      paddingTop: 8,
      paddingBottom: 120,
    },
    section: { marginBottom: 28 },
    acctCard: {
      backgroundColor: colors.white,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
    },
    loadingAccountsWrap: {
      paddingVertical: 18,
      alignItems: 'stretch',
      justifyContent: 'center',
    },
    acctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    acctRowLeft: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: colors.catTileEmptyBg,
    },
    avatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16 },
    acctName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: colors.textPrimary,
    },
    acctRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    balanceDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      flexShrink: 0,
    },
    acctBalance: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      color: colors.textPrimary,
    },
    addAccountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      backgroundColor: colors.primaryTransparent30,
    },
    addAccountCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: colors.white,
    },
    addAccountText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.primary,
    },
    billCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.billCardBg,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.billCardBorder,
      marginBottom: 32,
    },
    billIconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#3A2E1D' : '#FAEEDA',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    billContent: { flex: 1 },
    billTag: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.statWarnBar,
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
    // ── Ask Fino hero ──
    finoHero: {
      marginHorizontal: spacing.screenPadding,
      marginBottom: 24,
      borderRadius: 24,
      padding: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(176,154,224,0.2)' : 'rgba(75,45,163,0.1)',
      shadowColor: isDark ? '#4B2DA3' : '#7B5EA7',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.3 : 0.12,
      shadowRadius: 20,
      elevation: 8,
      minHeight: 160,
    },
    heroBlob1: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: isDark ? 'rgba(176,154,224,0.12)' : 'rgba(201,184,245,0.4)',
      top: -40,
      right: -30,
    },
    heroBlob2: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: isDark ? 'rgba(176,154,224,0.07)' : 'rgba(201,184,245,0.25)',
      bottom: -20,
      left: 40,
    },
    finoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(176,154,224,0.15)' : 'rgba(75,45,163,0.08)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
      alignSelf: 'flex-start',
      marginBottom: 10,
    },
    finoBadgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.8,
    },
    finoTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 26,
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    finoSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      lineHeight: 18,
      marginBottom: 14,
    },
    finoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    finoBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    finoIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 1,
      marginBottom: 12,
      marginHorizontal: spacing.screenPadding,
    },
    // ── Other tools ──
    toolsGrid: {
      marginHorizontal: spacing.screenPadding,
      gap: 10,
    },
    toolTile: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(30,30,46,0.07)',
      padding: 16,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 8,
      elevation: isDark ? 0 : 1,
    },
    toolIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    toolName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14.5,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    toolDesc: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
      marginTop: 1,
    },

    // App Settings Segments
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: colors.catTileEmptyBg,
      borderRadius: 12,
      padding: 4,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
    },
    segmentBtnActive: {
      backgroundColor: colors.white,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    segmentTextActive: { color: colors.textPrimary },
  });

const createModalStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheet: {
      flex: 1,
      backgroundColor: colors.white,
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 12,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    sheetTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 20,
      color: colors.textPrimary,
    },
    fieldGroup: { marginBottom: 16 },
    fieldLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.catTileEmptyBg,
    },
    pesoInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: 'hidden',
    },
    pesoSign: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.textSecondary,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: colors.catTileEmptyBg,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
      color: '#FFFFFF',
    },
  });

const createAddAccStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    preview: { alignItems: 'center', paddingVertical: 24, gap: 6 },
    previewAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewLetter: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 28,
      color: '#FFFFFF',
    },
    previewName: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 18,
      color: colors.textPrimary,
    },
    previewBalance: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.textSecondary,
    },
    colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    colorDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorDotSelected: {
      borderWidth: 3,
      borderColor: isDark ? '#333333' : '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
  });

const createQuickStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.white,
      borderRadius: 24,
      padding: 24,
      width: '88%',
      maxWidth: 360,
      alignItems: 'center',
      gap: 8,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.catTileEmptyBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    tagText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.statWarnBar,
      letterSpacing: 0.5,
    },
    title: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 20,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    amount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 26,
      color: colors.textPrimary,
    },
    dueBadge: {
      backgroundColor: isDark ? '#3A2E1D' : '#FFF8F0',
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 5,
    },
    dueBadgeOverdue: { backgroundColor: colors.catOverBadgeBg },
    dueText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.statWarnBar,
    },
    recurringNote: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
    },
    actions: { width: '100%', gap: 8, marginTop: 8 },
    paidBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    paidBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#FFFFFF',
    },
    dismissBtn: { paddingVertical: 10, alignItems: 'center' },
    dismissText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
    },
  });

const createBudgetStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    hint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
      gap: 12,
    },
    catIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flex: 1 },
    budgetInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: 'hidden',
      minWidth: 110,
    },
    pesoSign: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      color: colors.textSecondary,
      paddingHorizontal: 12,
      backgroundColor: colors.background,
      paddingVertical: 12,
    },
    budgetInput: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 10,
      paddingHorizontal: 8,
      minWidth: 70,
    },
  });

const createStepperStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 14,
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });

const createBillStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    addNewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
      marginBottom: 20,
    },
    addNewText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.primary,
    },
    addForm: {
      backgroundColor: colors.catTileEmptyBg,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },
    recurringRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    recurringLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.textPrimary,
    },
    addFormActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
      alignItems: 'center',
    },
    cancelBtn: {
      paddingVertical: 13,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.textSecondary,
    },
    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 17,
      color: colors.textPrimary,
    },
    emptySubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    billRowOverdue: { borderColor: colors.expenseRed },
    billIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#3A2E1D' : '#FAEEDA',
    },
    billIconBoxOverdue: { backgroundColor: colors.catOverBadgeBg },
    billTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.textPrimary,
    },
    billDue: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.statWarnBar,
      marginTop: 1,
    },
    billAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 2,
    },
    billActions: { gap: 8, alignItems: 'center' },
    paidPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.primaryLight,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 7,
    },
    paidPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.primary,
    },
  });
function setShowAppSettings(arg0: boolean) {
  throw new Error('Function not implemented.');
}

