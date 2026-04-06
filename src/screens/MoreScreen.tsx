import React, { useState, useEffect, useCallback } from 'react';
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
import { colors, spacing } from '../constants/theme';
import { useAccounts } from '@/hooks/useAccounts';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import { supabase } from '@/services/supabase';
import { INCOME_CATEGORIES } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';

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

function AddAccountModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
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
        style={{ flex: 1 }}
      >
        <View style={modalStyles.sheet}>
          {/* Handle */}
          <View style={modalStyles.handle} />

          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>Add Account</Text>
            <TouchableOpacity
              onPress={() => {
                reset();
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Preview */}
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
              style={[modalStyles.primaryBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
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

const addAccStyles = StyleSheet.create({
  preview: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLetter: { fontFamily: 'Nunito_700Bold', fontSize: 28, color: '#fff' },
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
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getDueLabel(diffDays: number): string {
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
          {/* Icon */}
          <View style={quickStyles.iconWrap}>
            <Ionicons name="notifications" size={28} color="#BA7517" />
          </View>

          <Text style={quickStyles.tagText}>⏰ BILL REMINDER</Text>
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
              isOverdue && { backgroundColor: '#FDE8E0' },
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
            <Text style={quickStyles.recurringNote}>↻ Recurring monthly</Text>
          )}

          <View style={quickStyles.actions}>
            <TouchableOpacity
              style={quickStyles.paidBtn}
              onPress={handleMarkPaid}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
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

const quickStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: 320,
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FAEEDA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tagText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#BA7517',
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
    backgroundColor: '#FFF8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  dueText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#BA7517' },
  recurringNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  actions: { width: '100%', gap: 8, marginTop: 8 },
  paidBtn: {
    backgroundColor: '#2d6a4f',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  paidBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
  dismissBtn: { paddingVertical: 10, alignItems: 'center' },
  dismissText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
  },
});

// ─── BUDGET SETTINGS MODAL ────────────────────────────────────────────────────

function BudgetSettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
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
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
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
            <Text style={budgetStyles.hint}>
              Set monthly spending limits for each category. Leave blank for no
              limit.
            </Text>

            {categories.map((cat) => {
              const color = cat.text_colour ?? '#888780';
              const bg = cat.tile_bg_colour ?? '#F7F5F2';
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
              style={[modalStyles.primaryBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
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

const budgetStyles = StyleSheet.create({
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
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
    borderColor: '#e0dfd7',
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 110,
  },
  pesoSign: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: 8,
    backgroundColor: '#F7F5F2',
    paddingVertical: 10,
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

// ─── Stepper (matches TransactionDetailScreen style) ─────────────────────────

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
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text
        style={{
          fontSize: 10,
          color: '#8A8A9A',
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
        style={{ paddingVertical: 6, paddingHorizontal: 12 }}
      >
        <Text style={{ fontSize: 16, color: colors.primary, lineHeight: 18 }}>
          ▲
        </Text>
      </TouchableOpacity>
      <Text
        style={{
          fontFamily: 'DMMono_500Medium',
          fontSize: 17,
          color: '#1E1E2E',
          marginVertical: 2,
          minWidth: 44,
          textAlign: 'center',
        }}
      >
        {display}
      </Text>
      <TouchableOpacity
        onPress={onDecrement}
        style={{ paddingVertical: 6, paddingHorizontal: 12 }}
      >
        <Text style={{ fontSize: 16, color: colors.primary, lineHeight: 18 }}>
          ▼
        </Text>
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

  const fetchBills = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bill_reminders')
      .select('*')
      .eq('is_paid', false)
      .order('due_date');
    setBills((data as BillReminder[]) ?? []);
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

    await supabase.from('bill_reminders').insert({
      user_id: user.id,
      title: newTitle.trim(),
      amount: newAmount ? parseFloat(newAmount) : null,
      due_date: dueDateISO,
      is_recurring: newRecurring,
      is_paid: false,
    });

    setNewTitle('');
    setNewAmount('');
    setDueMonth(new Date().getMonth());
    setDueDay(new Date().getDate());
    setDueYear(new Date().getFullYear());
    setNewRecurring(false);
    setSaving(false);
    setShowAdd(false);
    fetchBills();
  };

  const handleMarkPaid = async (id: string) => {
    await supabase
      .from('bill_reminders')
      .update({ is_paid: true })
      .eq('id', id);
    fetchBills();
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Reminder', 'Remove this bill reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('bill_reminders').delete().eq('id', id);
          fetchBills();
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
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Add new bill form */}
          {showAdd ? (
            <View style={billStyles.addForm}>
              <Text style={modalStyles.fieldLabel}>BILL NAME</Text>
              <TextInput
                style={modalStyles.input}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Meralco, Rent, Netflix"
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
                    <ActivityIndicator color="#fff" />
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

          {/* Bill list */}
          {loading && (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 24 }}
            />
          )}
          {!loading && bills.length === 0 && !showAdd && (
            <View style={billStyles.emptyState}>
              <Text style={billStyles.emptyIcon}>🔔</Text>
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
                    isOverdue && { borderColor: '#F2A49B' },
                  ]}
                >
                  <View
                    style={[
                      billStyles.billIconBox,
                      { backgroundColor: isOverdue ? '#FDE8E0' : '#FAEEDA' },
                    ]}
                  >
                    <Ionicons
                      name="notifications"
                      size={20}
                      color={isOverdue ? colors.expenseRed : '#BA7517'}
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
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color="#B4B2A9"
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

const stepperStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#F7F5F2',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e0dfd7',
  },
});

const billStyles = StyleSheet.create({
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
    backgroundColor: '#EFF8F2',
    marginBottom: 20,
  },
  addNewText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.primary,
  },
  addForm: {
    backgroundColor: '#F7F5F2',
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
    borderColor: '#e0dfd7',
  },
  cancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
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
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F0EFEA',
  },
  billIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  billDue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#BA7517',
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
    backgroundColor: '#EFF8F2',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paidPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.primary,
  },
});

// ─── Shared modal styles ──────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0dfd7',
    borderRadius: 2,
    alignSelf: 'center',
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
    borderColor: '#e0dfd7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: '#FAFAFA',
  },
  pesoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0dfd7',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pesoSign: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 15,
    color: colors.textSecondary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F7F5F2',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff' },
});

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { accounts, loading, refetch: refetchAccounts } = useAccounts();

  // Modals
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [showBillReminders, setShowBillReminders] = useState(false);

  // Bill quick view
  const [quickViewBill, setQuickViewBill] = useState<BillReminder | null>(null);
  const [upcomingBills, setUpcomingBills] = useState<BillReminder[]>([]);

  const fetchUpcomingBills = useCallback(async () => {
    const { data } = await supabase
      .from('bill_reminders')
      .select('*')
      .eq('is_paid', false)
      .order('due_date')
      .limit(1);
    setUpcomingBills((data as BillReminder[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUpcomingBills();
    }, [fetchUpcomingBills])
  );

  const nextBill = upcomingBills[0] ?? null;

  const handleToolPress = (id: string) => {
    if (id === 'fino') navigation.navigate('ChatScreen');
    else if (id === 'budget') setShowBudgetSettings(true);
    else if (id === 'bills') setShowBillReminders(true);
  };

  const TOOLS = [
    {
      id: 'fino',
      label: 'Ask Fino',
      icon: 'sparkles',
      color: '#534AB7',
      bg: '#EEEDFE',
    },
    {
      id: 'budget',
      label: 'Budget settings',
      icon: 'pie-chart',
      color: '#2d6a4f',
      bg: '#EFF8F2',
    },
    {
      id: 'bills',
      label: 'Bill reminders',
      icon: 'receipt',
      color: '#BA7517',
      bg: '#FFF8F0',
    },
    {
      id: 'settings',
      label: 'App settings',
      icon: 'settings-sharp',
      color: '#555555',
      bg: '#F0F0F0',
    },
  ];

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
        {/* ─── MY ACCOUNTS ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY ACCOUNTS</Text>
          <View style={styles.acctCard}>
            {loading ? (
              <View style={styles.loadingAccountsWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              accounts.map((acct, index) => (
                <TouchableOpacity
                  key={acct.id}
                  style={[
                    styles.acctRow,
                    index === accounts.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() =>
                    navigation.navigate('AccountDetail', { id: acct.id })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.acctRowLeft}>
                    {(() => {
                      const logo = ACCOUNT_LOGOS[acct.name];
                      const avatarLetter =
                        ACCOUNT_AVATAR_OVERRIDE[acct.name] ??
                        acct.letter_avatar;
                      if (logo) {
                        return (
                          <View
                            style={[
                              styles.avatar,
                              { backgroundColor: '#F7F5F2' },
                            ]}
                          >
                            <Image
                              source={logo}
                              style={{ width: 20, height: 20 }}
                              resizeMode="contain"
                            />
                          </View>
                        );
                      }
                      return (
                        <View
                          style={[
                            styles.avatar,
                            { backgroundColor: acct.brand_colour ?? '#F0F0F0' },
                          ]}
                        >
                          <Text
                            style={[styles.avatarText, { color: '#FFFFFF' }]}
                          >
                            {avatarLetter}
                          </Text>
                        </View>
                      );
                    })()}
                    <Text style={styles.acctName}>{acct.name}</Text>
                  </View>
                  <View style={styles.acctRowRight}>
                    <Text style={styles.acctBalance}>
                      ₱
                      {acct.balance.toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#B4B2A9"
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Add Account Button */}
          <TouchableOpacity
            style={styles.addAccountRow}
            activeOpacity={0.7}
            onPress={() => setShowAddAccount(true)}
          >
            <View style={styles.addAccountCircle}>
              <Ionicons name="add" size={18} color="#2d6a4f" />
            </View>
            <Text style={styles.addAccountText}>Add new account</Text>
          </TouchableOpacity>
        </View>

        {/* ─── BILL REMINDER CARD ─── */}
        {nextBill ? (
          <TouchableOpacity
            style={styles.billCard}
            activeOpacity={0.8}
            onPress={() => setQuickViewBill(nextBill)}
          >
            <View style={styles.billIconBox}>
              <Ionicons name="notifications" size={22} color="#BA7517" />
            </View>
            <View style={styles.billContent}>
              <Text style={styles.billTag}>⏰ BILL REMINDER</Text>
              <Text style={styles.billTitle}>{nextBill.title}</Text>
              <Text style={styles.billMeta}>
                {(() => {
                  const diff = Math.ceil(
                    (new Date(nextBill.due_date).getTime() - Date.now()) /
                      86400000
                  );
                  const dueStr = getDueLabel(diff);
                  return nextBill.amount != null
                    ? `${dueStr} · ₱${nextBill.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                    : dueStr;
                })()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D9B98A" />
          </TouchableOpacity>
        ) : null}

        {/* ─── TOOLS ─── */}
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
                onPress={() => handleToolPress(tool.id)}
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

      {/* ─── MODALS ─── */}
      <AddAccountModal
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onSaved={refetchAccounts}
      />

      <BillQuickViewModal
        visible={!!quickViewBill}
        bill={quickViewBill}
        onClose={() => setQuickViewBill(null)}
        onPaid={() => {
          setQuickViewBill(null);
          fetchUpcomingBills();
        }}
      />

      <BudgetSettingsModal
        visible={showBudgetSettings}
        onClose={() => setShowBudgetSettings(false)}
      />

      <BillRemindersModal
        visible={showBillReminders}
        onClose={() => {
          setShowBillReminders(false);
          fetchUpcomingBills();
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F5F2' },
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
    paddingBottom: 80,
  },

  section: { marginBottom: 28 },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },

  acctCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  loadingAccountsWrap: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  acctRowLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16 },
  acctName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  acctRowRight: { flexDirection: 'row', alignItems: 'center' },
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
  billContent: { flex: 1 },
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
  toolRowLeft: { flexDirection: 'row', alignItems: 'center' },
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
