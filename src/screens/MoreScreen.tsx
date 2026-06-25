// src/screens/MoreScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccounts } from '@/hooks/useAccounts';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import { database } from '@/db';
import type BillReminderModel from '@/db/models/BillReminder';
import {
  createAccount,
  createBillReminder,
  updateBillReminder,
  deleteBillReminder,
} from '@/services/localMutations';
import { getCanonicalBrandName } from '@/components/WalletCard';
import { Skeleton } from '@/components/Skeleton';
import { ToolsCarousel } from '@/components/ToolsCarousel';
import ProfileSidebar from '@/components/ProfileSidebar';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Global Theme Context
import { useSync } from '@/contexts/SyncContext';
import { useAuth } from '@/contexts/AuthContext';

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

// Mirror of the AccountsScreen category list — kept in sync manually since
// this legacy modal is still mounted in ProfileSidebar.
const ACCOUNT_CATEGORIES: { key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'E-Wallet', icon: 'phone-portrait-outline' },
  { key: 'Bank', icon: 'business-outline' },
  { key: 'Cash', icon: 'cash-outline' },
  { key: 'Credit Card', icon: 'card-outline' },
  { key: 'Savings', icon: 'shield-checkmark-outline' },
  { key: 'Other', icon: 'ellipsis-horizontal-outline' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

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
  const [selectedCategory, setSelectedCategory] = useState(
    ACCOUNT_CATEGORIES[0].key,
  );
  const [saving, setSaving] = useState(false);
  const { currentUserId } = useAuth();

  const reset = () => {
    setName('');
    setBalance('');
    setSelectedColor(ACCOUNT_COLORS[0]);
    setSelectedCategory(ACCOUNT_CATEGORIES[0].key);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an account name.');
      return;
    }
    setSaving(true);
    if (!currentUserId) {
      setSaving(false);
      return;
    }

    const startBal = parseFloat(balance) || 0;
    const canonical = getCanonicalBrandName(name.trim());
    const savedName = canonical ?? name.trim();
    const letter = savedName[0].toUpperCase();

    await createAccount({
      userId: currentUserId,
      name: savedName,
      type: selectedCategory,
      brandColour: selectedColor,
      letterAvatar: letter,
      startingBalance: startBal,
      sortOrder: 99,
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
              {getCanonicalBrandName(name.trim()) && (
                <View style={addAccStyles.brandBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#2d6a4f" />
                  <Text style={addAccStyles.brandBadgeText}>Stylized card applied</Text>
                </View>
              )}
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
              <Text style={modalStyles.fieldLabel}>CATEGORY</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {ACCOUNT_CATEGORIES.map((c) => {
                  const active = selectedCategory === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      activeOpacity={0.75}
                      onPress={() => setSelectedCategory(c.key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: active
                          ? selectedColor
                          : colors.catTileEmptyBg,
                      }}
                    >
                      <Ionicons
                        name={c.icon}
                        size={14}
                        color={active ? '#FFFFFF' : colors.textSecondary}
                      />
                      <Text
                        style={{
                          fontFamily: 'Inter_600SemiBold',
                          fontSize: 12,
                          color: active ? '#FFFFFF' : colors.textPrimary,
                        }}
                      >
                        {c.key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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
              style={[
                modalStyles.primaryBtn,
                { marginTop: 24 },
                saving && { opacity: 0.6 },
              ]}
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
    await updateBillReminder(bill.id, { isPaid: true });
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
            <Ionicons
              name="time-outline"
              size={11}
              color={colors.statWarnBar}
            />
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
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
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
  const { currentUserId } = useAuth();
  const userId = currentUserId;

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
    if (!userId) {
      setBills([]);
      setLoading(false);
      return;
    }
    const records = await database
      .get<BillReminderModel>('bill_reminders')
      .query(
        Q.where('user_id', userId),
        Q.where('is_paid', false),
        Q.sortBy('due_date', Q.asc)
      )
      .fetch();
    const fresh: BillReminder[] = records.map((b) => ({
      id: b.id,
      user_id: b.userId,
      title: b.title,
      amount: b.amount ?? null,
      merchant_name: b.merchantName ?? null,
      due_date: b.dueDate,
      is_recurring: b.isRecurring,
      is_paid: b.isPaid,
      created_at: b.serverCreatedAt ?? new Date(b.updatedAt).toISOString(),
    }));
    setBills(fresh);
    AsyncStorage.setItem(BILLS_CACHE_KEY, JSON.stringify(fresh)).catch(
      (err) => {
        if (__DEV__)
          console.warn('[MoreScreen] bills cache write failed:', err);
      }
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (visible) fetchBills();
  }, [visible, fetchBills]);

  const handleAddBill = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Required', 'Please enter a bill name.');
      return;
    }
    setSaving(true);
    if (!userId) {
      setSaving(false);
      return;
    }

    const daysInMonth = new Date(dueYear, dueMonth + 1, 0).getDate();
    const safeDay = Math.min(dueDay, daysInMonth);
    const dueDateISO = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

    // Optimistic: add a placeholder to the list immediately, then close
    const optimisticBill: BillReminder = {
      id: `optimistic-${Date.now()}`,
      user_id: userId,
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

    try {
      await createBillReminder({
        userId,
        title: optimisticBill.title,
        amount: optimisticBill.amount ?? undefined,
        dueDate: dueDateISO,
        isRecurring: newRecurring,
      });
      fetchBills();
    } catch (err) {
      updateBillsCache(snapshot);
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Please try again.'
      );
    }
  };

  const updateBillsCache = (updated: BillReminder[]) => {
    setBills(updated);
    AsyncStorage.setItem(BILLS_CACHE_KEY, JSON.stringify(updated)).catch(
      (err) => {
        if (__DEV__)
          console.warn('[MoreScreen] bills cache write failed:', err);
      }
    );
  };

  const handleMarkPaid = async (id: string) => {
    const snapshot = bills;
    updateBillsCache(bills.filter((b) => b.id !== id));
    try {
      await updateBillReminder(id, { isPaid: true });
    } catch {
      updateBillsCache(snapshot);
    }
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
          try {
            await deleteBillReminder(id);
          } catch {
            updateBillsCache(snapshot);
          }
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
          <TouchableOpacity
            onPress={onClose}
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
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.catTileEmptyBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="notifications-outline"
                  size={30}
                  color={colors.textSecondary}
                />
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

function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();
  const userName = profile?.name || 'User';
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const styles = useMemo(
    () => createMainStyles(colors, isDark),
    [colors, isDark]
  );

  const [showBillReminders, setShowBillReminders] = useState(false);
  const [quickViewBill, setQuickViewBill] = useState<BillReminder | null>(null);
  const [recurringExpanded, setRecurringExpanded] = useState(false);
  const [toolsView, setToolsView] = useState<'list' | 'grid'>('list');
  const { forceSync } = useSync();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await forceSync();
    } finally {
      setIsRefreshing(false);
    }
  }, [forceSync]);

  const handleToolPress = (id: string) => {
    if (id === 'fino') navigation.navigate('ChatScreen');
    else if (id === 'accounts') navigation.navigate('Accounts');
    else if (id === 'budget') navigation.navigate('Categories');
    else if (id === 'recurring') setRecurringExpanded((v) => !v);
    else if (id === 'recurring-income') navigation.navigate('RecurringIncome');
    else if (id === 'recurring-bills') navigation.navigate('RecurringBills');
    else if (id === 'settings') setShowAppSettings(true);
    else if (id === 'splitter') navigation.navigate('BillSplitter');
    else if (id === 'utang') navigation.navigate('UtangTracker');
    else if (id === 'savings') navigation.navigate('SavingsGoal');
    else if (id === 'education') navigation.navigate('FinancialEducation');
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
      id: 'accounts',
      label: 'Accounts',
      desc: 'Manage wallets, banks, and cash',
      icon: 'wallet',
      color: colors.primary,
      bg: colors.primaryLight,
    },
    {
      id: 'budget',
      label: 'Category and Budget Set-up',
      desc: 'Manage categories and monthly limits',
      icon: 'pie-chart',
      color: '#C97A20',
      bg: isDark ? '#3A2E1D' : '#FFF4E5',
    },
    {
      id: 'recurring',
      label: 'Recurring Transactions',
      desc: 'Income that comes in, bills that go out',
      icon: 'repeat',
      color: '#BA7517',
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
      label: 'Debt Tracker',
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
      id: 'education',
      label: 'Financial Education',
      desc: 'Bite-sized money literacy modules',
      icon: 'book',
      color: '#3A80C0',
      bg: isDark ? '#0D1825' : '#EAF2FB',
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

  const otherTools = TOOLS.filter((t) => t.id !== 'fino');

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(insets.top + 8, 20) }]}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tools</Text>
        <TouchableOpacity
          onPress={() => setSidebarVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open profile menu"
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.headerAvatar}
          >
            <Text style={styles.headerAvatarLetter}>
              {userName.charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── Features carousel (replaces the Ask Fino hero) ── */}
        <ToolsCarousel />

        {/* ── Other tools ── */}
        <View style={styles.quickActionsHeader}>
          <Text style={[styles.sectionLabel, styles.sectionLabelInline]}>
            QUICK ACTIONS
          </Text>
          <TouchableOpacity
            style={styles.viewToggleBtn}
            onPress={() =>
              setToolsView((v) => (v === 'list' ? 'grid' : 'list'))
            }
            activeOpacity={0.7}
            accessibilityLabel={
              toolsView === 'list'
                ? 'Switch to grid view'
                : 'Switch to list view'
            }
          >
            <Ionicons
              name={toolsView === 'list' ? 'grid-outline' : 'list-outline'}
              size={18}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
        <View style={toolsView === 'grid' ? styles.toolsGridWrap : styles.toolsGrid}>
          {otherTools.map((tool) => {
            const isRecurring = tool.id === 'recurring';
            if (toolsView === 'grid') {
              return (
                <TouchableOpacity
                  key={tool.id}
                  style={[styles.toolTileGrid, { backgroundColor: colors.white }]}
                  onPress={() => handleToolPress(tool.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: tool.bg }]}>
                    <Ionicons
                      name={tool.icon as any}
                      size={22}
                      color={tool.color}
                    />
                  </View>
                  <View>
                    <Text style={styles.toolNameGrid}>{tool.label}</Text>
                    <Text style={styles.toolDescGrid} numberOfLines={2}>
                      {tool.desc}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }
            return (
              <React.Fragment key={tool.id}>
                <TouchableOpacity
                  style={[styles.toolTile, { backgroundColor: colors.white }]}
                  onPress={() => handleToolPress(tool.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: tool.bg }]}>
                    <Ionicons
                      name={tool.icon as any}
                      size={22}
                      color={tool.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toolName}>{tool.label}</Text>
                    <Text style={styles.toolDesc}>{tool.desc}</Text>
                  </View>
                  <Ionicons
                    name={
                      isRecurring && recurringExpanded
                        ? 'chevron-down'
                        : 'chevron-forward'
                    }
                    size={14}
                    color={colors.textSecondary}
                    style={{ opacity: 0.5 }}
                  />
                </TouchableOpacity>

                {isRecurring && recurringExpanded && (
                  <View
                    style={[
                      styles.recurringDropdown,
                      {
                        backgroundColor: colors.white,
                        borderColor: isDark
                          ? colors.border
                          : 'rgba(30,30,46,0.07)',
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.recurringRow}
                      onPress={() => handleToolPress('recurring-income')}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          styles.recurringIconBox,
                          {
                            backgroundColor: isDark ? '#0D2E23' : '#e8f5ee',
                          },
                        ]}
                      >
                        <Ionicons
                          name="trending-up"
                          size={18}
                          color="#3f6b52"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recurringRowName}>
                          Recurring Income
                        </Text>
                        <Text style={styles.recurringRowSub}>
                          Salary, allowance, freelance retainers
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.textSecondary}
                        style={{ opacity: 0.5 }}
                      />
                    </TouchableOpacity>

                    <View
                      style={[
                        styles.recurringDivider,
                        { backgroundColor: colors.border },
                      ]}
                    />

                    <TouchableOpacity
                      style={styles.recurringRow}
                      onPress={() => handleToolPress('recurring-bills')}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          styles.recurringIconBox,
                          {
                            backgroundColor: isDark ? '#231640' : '#ede5ff',
                          },
                        ]}
                      >
                        <Ionicons
                          name="receipt"
                          size={18}
                          color="#7A4AB8"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recurringRowName}>
                          Recurring Bills
                        </Text>
                        <Text style={styles.recurringRowSub}>
                          Rent, subscriptions, utilities
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.textSecondary}
                        style={{ opacity: 0.5 }}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </React.Fragment>
            );
          })}
          {toolsView === 'grid' && recurringExpanded && (
            <View
              style={[
                styles.recurringDropdown,
                {
                  width: '100%',
                  backgroundColor: colors.white,
                  borderColor: isDark ? colors.border : 'rgba(30,30,46,0.07)',
                },
              ]}
            >
              <TouchableOpacity
                style={styles.recurringRow}
                onPress={() => handleToolPress('recurring-income')}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.recurringIconBox,
                    { backgroundColor: isDark ? '#0D2E23' : '#e8f5ee' },
                  ]}
                >
                  <Ionicons name="trending-up" size={18} color="#3f6b52" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurringRowName}>Recurring Income</Text>
                  <Text style={styles.recurringRowSub}>
                    Salary, allowance, freelance retainers
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.textSecondary}
                  style={{ opacity: 0.5 }}
                />
              </TouchableOpacity>
              <View
                style={[
                  styles.recurringDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <TouchableOpacity
                style={styles.recurringRow}
                onPress={() => handleToolPress('recurring-bills')}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.recurringIconBox,
                    { backgroundColor: isDark ? '#231640' : '#ede5ff' },
                  ]}
                >
                  <Ionicons name="receipt" size={18} color="#7A4AB8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurringRowName}>Recurring Bills</Text>
                  <Text style={styles.recurringRowSub}>
                    Rent, subscriptions, utilities
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.textSecondary}
                  style={{ opacity: 0.5 }}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <BillQuickViewModal
        visible={!!quickViewBill}
        bill={quickViewBill}
        onClose={() => setQuickViewBill(null)}
        onPaid={() => setQuickViewBill(null)}
      />
      <BillRemindersModal
        visible={showBillReminders}
        onClose={() => setShowBillReminders(false)}
      />
      <ProfileSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
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
    headerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerAvatarLetter: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#FFFFFF',
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
      backgroundColor: isDark
        ? 'rgba(176,154,224,0.12)'
        : 'rgba(201,184,245,0.4)',
      top: -40,
      right: -30,
    },
    heroBlob2: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: isDark
        ? 'rgba(176,154,224,0.07)'
        : 'rgba(201,184,245,0.25)',
      bottom: -20,
      left: 40,
    },
    finoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark
        ? 'rgba(176,154,224,0.15)'
        : 'rgba(75,45,163,0.08)',
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
    // ── View toggle ──
    quickActionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.screenPadding,
      marginBottom: 12,
    },
    sectionLabelInline: {
      marginHorizontal: 0,
      marginBottom: 0,
    },
    viewToggleBtn: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.catTileEmptyBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(30,30,46,0.07)',
    },
    // ── Other tools ──
    toolsGrid: {
      marginHorizontal: spacing.screenPadding,
      gap: 10,
    },
    toolsGridWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
    toolTileGrid: {
      width: '48%',
      flexGrow: 1,
      flexDirection: 'column',
      alignItems: 'flex-start',
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(30,30,46,0.07)',
      padding: 14,
      gap: 10,
      minHeight: 120,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 8,
      elevation: isDark ? 0 : 1,
    },
    toolNameGrid: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: colors.textPrimary,
    },
    toolDescGrid: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: colors.textSecondary,
      lineHeight: 15,
      marginTop: 2,
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
    recurringDropdown: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginTop: -4,
    },
    recurringRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
    },
    recurringIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recurringRowName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    recurringRowSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    recurringDivider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: 14,
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
    brandBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#EFF8F2',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    brandBadgeText: {
      fontSize: 12,
      color: '#2d6a4f',
      fontFamily: 'Inter_500Medium',
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

export default React.memo(MoreScreen);
