import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { LinearGradient } from 'expo-linear-gradient';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { CategoryIcon } from '@/components/CategoryIcon';
import { database } from '@/db';
import type RecurringBillModel from '@/db/models/RecurringBill';
import {
  createRecurringBill,
  deleteRecurringBill,
  updateRecurringBill,
  processRecurringTransaction,
  type RecurringCadence,
} from '@/services/localMutations';

// ─── Types ───────────────────────────────────────────────────────────────────

type RecurringBill = {
  id: string;
  title: string;
  amount: number;
  cadence: RecurringCadence;
  anchor_date: string;
  next_due_at: string;
  is_active: boolean;
  category?: string;
  account_id?: string;
  last_paid_at?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

const cadenceLabel = (c: RecurringCadence, anchor: string) => {
  if (c === 'daily') return 'Daily';
  if (c === 'weekly') {
    const day = new Date(`${anchor}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
    return `Weekly · ${day}`;
  }
  if (c === 'yearly') return `Yearly · ${fmtDate(anchor)}`;
  const d = new Date(`${anchor}T00:00:00`).getDate();
  const sfx = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
  return `Monthly · ${d}${sfx}`;
};

function committedThisMonth(items: RecurringBill[]): number {
  let total = 0;
  for (const i of items) {
    if (!i.is_active) continue;
    if (i.cadence === 'daily') total += i.amount * 30;
    else if (i.cadence === 'weekly') total += i.amount * 4;
    else if (i.cadence === 'monthly') total += i.amount;
    else total += i.amount / 12;
  }
  return total;
}

function isPaidThisCycle(item: RecurringBill): boolean {
  if (!item.last_paid_at) return false;
  const today = new Date().toISOString().slice(0, 10);
  return item.next_due_at > today;
}

type DueStatus = 'overdue' | 'today' | 'soon' | 'upcoming';

function getDueStatus(nextDueAt: string): DueStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (nextDueAt < today) return 'overdue';
  if (nextDueAt === today) return 'today';
  const diff = Math.ceil(
    (new Date(`${nextDueAt}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86400000,
  );
  return diff <= 3 ? 'soon' : 'upcoming';
}

// ─── Swipeable row ───────────────────────────────────────────────────────────

function SwipeableRow({
  children,
  onEdit,
  onDelete,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<any>(null);

  const handleEdit = useCallback(() => {
    ref.current?.close();
    onEdit();
  }, [onEdit]);

  const handleDelete = useCallback(() => {
    ref.current?.close();
    onDelete();
  }, [onDelete]);

  const renderRightActions = useCallback(
    () => (
      <View style={swipeStyles.actions}>
        <TouchableOpacity
          style={[swipeStyles.btn, { backgroundColor: '#10B981' }]}
          activeOpacity={0.85}
          onPress={handleEdit}
        >
          <Ionicons name="pencil" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[swipeStyles.btn, { backgroundColor: '#C0503A' }]}
          activeOpacity={0.85}
          onPress={handleDelete}
        >
          <Ionicons name="trash" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    ),
    [handleEdit, handleDelete],
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      overshootRight={false}
      rightThreshold={80}
      renderRightActions={renderRightActions}
      containerStyle={swipeStyles.container}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const swipeStyles = StyleSheet.create({
  container: { borderRadius: 18, overflow: 'hidden' },
  actions: { flexDirection: 'row', height: '100%' },
  btn: { width: 64, alignItems: 'center', justifyContent: 'center' },
});

// ─── Component ───────────────────────────────────────────────────────────────

const BILLS = '#7A4AB8';

export default function RecurringBillsScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const [items, setItems] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Observe ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setItems([]); setLoading(false); return; }
    const sub = database
      .get<RecurringBillModel>('recurring_bills')
      .query(Q.where('user_id', userId), Q.sortBy('next_due_at', Q.asc))
      .observeWithColumns([
        'title',
        'amount',
        'cadence',
        'anchor_date',
        'next_due_at',
        'is_active',
        'category',
        'account_id',
        'last_paid_at',
      ])
      .subscribe((records) => {
        setItems(
          records.map((r) => ({
            id: r.id,
            title: r.title,
            amount: r.amount,
            cadence: r.cadence,
            anchor_date: r.anchorDate,
            next_due_at: r.nextDueAt,
            is_active: r.isActive,
            category: r.category,
            account_id: r.accountId,
            last_paid_at: r.lastPaidAt,
          })),
        );
        setLoading(false);
      });
    return () => sub.unsubscribe();
  }, [userId]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = items.filter((i) => i.is_active);
    const paid = active.filter(isPaidThisCycle).length;
    const next = active.find((i) => !isPaidThisCycle(i))?.next_due_at;
    return {
      committed: committedThisMonth(items),
      total: active.length,
      paid,
      next: next ? fmtDate(next) : '—',
    };
  }, [items]);

  const accountMap = useMemo(() => {
    const m = new Map<string, (typeof accounts)[0]>();
    accounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, (typeof categories)[0]>();
    categories.forEach((c) => m.set(c.name, c));
    return m;
  }, [categories]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const emptyForm = () => ({
    title: '',
    amount: '',
    cadence: 'monthly' as RecurringCadence,
    anchor_date: new Date().toISOString().slice(0, 10),
    accountId: undefined as string | undefined,
    category: undefined as string | undefined,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tempDate, setTempDate] = useState(new Date().toISOString().slice(0, 10));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Confirm state ──────────────────────────────────────────────────────────
  const [confirmBill, setConfirmBill] = useState<RecurringBill | null>(null);
  const [confirming, setConfirming] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (item: RecurringBill) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      amount: item.amount.toString(),
      cadence: item.cadence,
      anchor_date: item.anchor_date,
      accountId: item.account_id,
      category: item.category,
    });
    setShowForm(true);
  };

  const submitForm = async () => {
    const title = form.title.trim();
    const amount = parseFloat(form.amount);
    if (!title) { Alert.alert('Missing name', 'Give this bill a name (e.g. Rent).'); return; }
    if (!amount || amount <= 0) { Alert.alert('Invalid amount', 'Enter a positive amount.'); return; }
    if (!form.accountId) { Alert.alert('Pick an account', 'Choose which account this bill is paid from.'); return; }
    if (!userId) { Alert.alert('Not signed in', 'Please sign in to save changes.'); return; }

    const id = editingId;
    setSubmitting(true);
    try {
      if (id) {
        await updateRecurringBill(id, {
          title,
          amount,
          cadence: form.cadence,
          anchorDate: form.anchor_date,
          accountId: form.accountId,
          category: form.category,
        });
      } else {
        await createRecurringBill({
          userId,
          title,
          amount,
          cadence: form.cadence,
          anchorDate: form.anchor_date,
          accountId: form.accountId,
          category: form.category,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!editingId) return;
    const id = editingId;
    Alert.alert('Remove bill', `Stop tracking "${form.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setShowForm(false);
          setEditingId(null);
          setForm(emptyForm());
          await deleteRecurringBill(id);
        },
      },
    ]);
  };

  const handleMarkPaid = useCallback((item: RecurringBill) => {
    setConfirmBill(item);
  }, []);

  const handleDeleteItem = useCallback((item: RecurringBill) => {
    Alert.alert('Remove bill', `Stop tracking "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => { deleteRecurringBill(item.id); },
      },
    ]);
  }, []);

  const handleConfirmPaid = useCallback(async () => {
    if (!confirmBill || !userId) return;
    setConfirming(true);
    try {
      await processRecurringTransaction(
        {
          id: confirmBill.id,
          title: confirmBill.title,
          amount: confirmBill.amount,
          accountId: confirmBill.account_id,
          category: confirmBill.category,
        },
        'bill',
        userId,
      );
      setConfirmBill(null);
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_ACCOUNT') {
        Alert.alert(
          'No account linked',
          'Swipe left on the bill and tap Edit to pick which account it\'s paid from, then try again.',
        );
      } else {
        Alert.alert('Error', 'Could not record transaction. Please try again.');
      }
    } finally {
      setConfirming(false);
    }
  }, [confirmBill, userId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Recurring Bills</Text>
          <Text style={styles.headerSub}>Rent, subscriptions, utilities</Text>
        </View>
        <TouchableOpacity onPress={openAdd} style={styles.iconBtn} activeOpacity={0.7} hitSlop={8}>
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={BILLS} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card */}
          <LinearGradient
            colors={['#5e3a99', '#3a1f6b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={[styles.blob, { top: -40, right: -40, width: 160, height: 160 }]} />
            <View style={[styles.blob, { bottom: -30, left: -10, width: 110, height: 110, opacity: 0.5 }]} />
            <View style={styles.heroTag}><Text style={styles.heroTagText}>MONTHLY OUTFLOW</Text></View>
            <Text style={styles.heroLabel}>Committed this month</Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurr}>₱</Text>
              <Text style={styles.heroAmount}>{Math.round(stats.committed).toLocaleString('en-PH')}</Text>
            </View>
            <View style={styles.heroMeta}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroMetaLbl}>Bills</Text>
                <Text style={styles.heroMetaVal}>{stats.total} active</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroMetaLbl}>Next due</Text>
                <Text style={styles.heroMetaVal}>{stats.next}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroMetaLbl}>Paid</Text>
                <Text style={[styles.heroMetaVal, { color: '#86efac' }]}>{stats.paid} / {stats.total}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Empty state */}
          {items.length === 0 && (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.surfaceSubdued : '#ede5ff' }]}>
                <Ionicons name="receipt" size={40} color={BILLS} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No recurring bills yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap + to track rent, subscriptions, or utilities.
              </Text>
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.listHead}>
              <View style={[styles.listDot, { backgroundColor: BILLS }]} />
              <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Upcoming bills</Text>
            </View>
          )}

          {/* Bill cards */}
          {items.map((item) => {
            const paid = isPaidThisCycle(item);
            const status = getDueStatus(item.next_due_at);
            const today = new Date().toISOString().slice(0, 10);
            const daysOverdue = Math.floor(
              (new Date(`${today}T00:00:00`).getTime() -
                new Date(`${item.next_due_at}T00:00:00`).getTime()) /
                86400000,
            );
            const acct = item.account_id ? accountMap.get(item.account_id) : undefined;
            const cat = item.category ? categoryMap.get(item.category) : undefined;

            const statusLabel = paid
              ? `Paid · next ${fmtDate(item.next_due_at)}`
              : status === 'overdue'
                ? `${daysOverdue}d overdue`
                : status === 'today'
                  ? 'Due today'
                  : `Due ${fmtDate(item.next_due_at)}`;

            const statusColor = paid
              ? '#10B981'
              : status === 'overdue'
                ? colors.expenseRed
                : status === 'today' || status === 'soon'
                  ? '#D97706'
                  : BILLS;

            const statusBg = paid
              ? (isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5')
              : status === 'overdue'
                ? (isDark ? 'rgba(192,80,58,0.15)' : '#FEF0F0')
                : status === 'today' || status === 'soon'
                  ? (isDark ? 'rgba(217,119,6,0.15)' : '#FFF8E7')
                  : (isDark ? `${BILLS}22` : '#EDE5FF');

            return (
              <SwipeableRow
                key={item.id}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDeleteItem(item)}
              >
                <TouchableOpacity
                  activeOpacity={paid ? 1 : 0.85}
                  onPress={() => { if (!paid) handleMarkPaid(item); }}
                  style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border }]}
                >
                  {cat ? (
                    <CategoryIcon
                      categoryKey={(cat.emoji ?? 'others').toLowerCase()}
                      color={cat.text_colour ?? BILLS}
                      size={20}
                      wrapperSize={44}
                    />
                  ) : (
                    <View style={[styles.cardIcon, { backgroundColor: isDark ? `${BILLS}22` : '#EDE5FF' }]}>
                      <Ionicons name="receipt" size={20} color={BILLS} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.cardTitle, { color: paid ? colors.textSecondary : colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <View style={styles.cardPills}>
                      <View style={[styles.pill, { backgroundColor: colors.surfaceSubdued }]}>
                        <Text style={[styles.pillText, { color: colors.textSecondary }]}>
                          {cadenceLabel(item.cadence, item.anchor_date)}
                        </Text>
                      </View>
                      <View style={[styles.pill, { backgroundColor: statusBg }]}>
                        <Text style={[styles.pillText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.metaChips}>
                      {acct && (
                        <View style={styles.metaChip}>
                          <View style={[styles.chipDot, { backgroundColor: acct.brand_colour ?? '#888' }]} />
                          <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {acct.name}
                          </Text>
                        </View>
                      )}
                      {item.category && (
                        <View style={styles.metaChip}>
                          {cat ? (
                            <CategoryIcon
                              categoryKey={(cat.emoji ?? 'others').toLowerCase()}
                              color={cat.text_colour ?? colors.textSecondary}
                              size={8}
                              wrapperSize={14}
                            />
                          ) : null}
                          <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.category}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardActionArea}>
                    <Text style={[styles.cardAmount, { color: paid ? colors.textSecondary : colors.expenseRed, opacity: paid ? 0.45 : 1 }]}>
                      −{fmt(item.amount)}
                    </Text>
                    {paid && (
                      <View style={[styles.ctaBtn, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5', borderColor: 'rgba(16,185,129,0.3)' }]}>
                        <Ionicons name="checkmark" size={11} color="#10B981" />
                        <Text style={[styles.ctaBtnText, { color: '#10B981' }]}>Paid</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </SwipeableRow>
            );
          })}
        </ScrollView>
      )}

      {/* ── Add / Edit modal ── */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowForm(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHandle} />
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={styles.sheetScroll}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {editingId ? 'Edit recurring bill' : 'Add recurring bill'}
              </Text>
              <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
                {editingId
                  ? 'Update the schedule, amount, account, or category.'
                  : "We'll nudge you 2 days before each due date."}
              </Text>

              {/* Bill name */}
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>BILL NAME</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary }]}
                placeholder="e.g. Rent"
                placeholderTextColor={colors.textSecondary}
                value={form.title}
                onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              />

              {/* Amount */}
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>AMOUNT (₱)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary, fontFamily: 'DMMono_500Medium', fontSize: 18 }]}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                value={form.amount}
                onChangeText={(t) => setForm((f) => ({ ...f, amount: t.replace(/[^0-9.]/g, '') }))}
              />

              {/* Account picker — chips that wrap. Scales to many accounts. */}
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
              {accounts.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>
                  No accounts yet. Add one from the sidebar.
                </Text>
              ) : (
                <View style={styles.chipGrid}>
                  {accounts.map((acct) => {
                    const sel = form.accountId === acct.id;
                    return (
                      <TouchableOpacity
                        key={acct.id}
                        onPress={() => setForm((f) => ({ ...f, accountId: acct.id }))}
                        activeOpacity={0.75}
                        style={[
                          styles.pickerChip,
                          sel
                            ? { backgroundColor: `${BILLS}18`, borderColor: BILLS }
                            : { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', borderColor: 'transparent' },
                        ]}
                      >
                        <View style={[styles.chipAvatar, { backgroundColor: acct.brand_colour ?? '#888' }]}>
                          <Text style={styles.chipAvatarText}>
                            {acct.letter_avatar ?? acct.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.pickerChipText, { color: sel ? BILLS : colors.textPrimary }]} numberOfLines={1}>
                          {acct.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Category picker — chips with real CategoryIcon rendering. */}
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>CATEGORY</Text>
              {categories.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>
                  No categories yet.
                </Text>
              ) : (
                <View style={styles.chipGrid}>
                  {categories.map((cat) => {
                    const sel = form.category === cat.name;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setForm((f) => ({ ...f, category: sel ? undefined : cat.name }))}
                        activeOpacity={0.75}
                        style={[
                          styles.pickerChip,
                          sel
                            ? { backgroundColor: `${BILLS}18`, borderColor: BILLS }
                            : { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', borderColor: 'transparent' },
                        ]}
                      >
                        <CategoryIcon
                          categoryKey={(cat.emoji ?? 'others').toLowerCase()}
                          color={cat.text_colour ?? colors.textSecondary}
                          size={12}
                          wrapperSize={22}
                        />
                        <Text style={[styles.pickerChipText, { color: sel ? BILLS : colors.textPrimary }]} numberOfLines={1}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Frequency */}
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>FREQUENCY</Text>
              <View style={styles.cadenceRow}>
                {(['daily', 'weekly', 'monthly', 'yearly'] as RecurringCadence[]).map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, cadence: c }))}
                    activeOpacity={0.8}
                    style={[
                      styles.cadencePill,
                      { backgroundColor: form.cadence === c ? BILLS : isDark ? colors.surfaceSubdued : '#F4F4F8' },
                    ]}
                  >
                    <Text style={[styles.cadencePillText, { color: form.cadence === c ? '#fff' : colors.textPrimary }]}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date */}
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>FIRST / NEXT DUE DATE</Text>
              <Pressable
                onPress={() => { setTempDate(form.anchor_date); setShowDatePicker(true); }}
                style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }]}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
                  {fmtDate(form.anchor_date)}
                </Text>
              </Pressable>

              <TouchableOpacity
                onPress={submitForm}
                activeOpacity={0.85}
                disabled={submitting}
                style={[styles.submitBtn, { backgroundColor: BILLS, opacity: submitting ? 0.6 : 1 }]}
              >
                <Text style={styles.submitBtnText}>
                  {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Add bill'}
                </Text>
              </TouchableOpacity>

              {editingId && (
                <TouchableOpacity onPress={confirmDelete} activeOpacity={0.7} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#C0503A" />
                  <Text style={styles.deleteBtnText}>Remove bill</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Mark Paid confirmation ── */}
      <Modal
        visible={!!confirmBill}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmBill(null)}
      >
        <Pressable style={styles.overlay} onPress={() => !confirming && setConfirmBill(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
          {confirmBill && (() => {
            const acct = confirmBill.account_id ? accountMap.get(confirmBill.account_id) : undefined;
            const cat = confirmBill.category ? categoryMap.get(confirmBill.category) : undefined;
            const todayLabel = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <View style={[styles.sheet, { backgroundColor: colors.white }]}>
                <View style={styles.sheetHandle} />
                <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
                  <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Mark as Paid</Text>
                  <Text style={[styles.sheetSub, { color: colors.textSecondary, marginBottom: 0 }]}>
                    This will create a transaction and advance the next due date.
                  </Text>
                </View>

                {/* Transaction preview */}
                <View style={[styles.previewCard, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', margin: 16, marginTop: 8 }]}>
                  {cat ? (
                    <CategoryIcon
                      categoryKey={(cat.emoji ?? 'others').toLowerCase()}
                      color={cat.text_colour ?? BILLS}
                      size={22}
                      wrapperSize={48}
                    />
                  ) : (
                    <View style={[styles.previewIcon, { backgroundColor: isDark ? `${BILLS}22` : '#EDE5FF' }]}>
                      <Ionicons name="receipt" size={22} color={BILLS} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.previewName, { color: colors.textPrimary }]}>{confirmBill.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {acct && (
                        <View style={styles.metaChip}>
                          <View style={[styles.chipDot, { backgroundColor: acct.brand_colour ?? '#888' }]} />
                          <Text style={[styles.chipText, { color: colors.textSecondary }]}>{acct.name}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'Inter_400Regular' }}>
                        {todayLabel}
                      </Text>
                      {confirmBill.category && (
                        <View style={[styles.pill, { backgroundColor: isDark ? `${BILLS}22` : '#EDE5FF' }]}>
                          <Text style={[styles.pillText, { color: BILLS }]}>{confirmBill.category}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.previewAmount, { color: colors.expenseRed }]}>
                    −{fmt(confirmBill.amount)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleConfirmPaid}
                  activeOpacity={0.85}
                  disabled={confirming}
                  style={[styles.confirmBtn, { backgroundColor: BILLS, opacity: confirming ? 0.6 : 1, marginHorizontal: 16 }]}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.confirmBtnText}>
                    {confirming ? 'Adding…' : 'Confirm & Add to Transactions'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setConfirmBill(null)}
                  activeOpacity={0.7}
                  disabled={confirming}
                  style={[styles.cancelBtn, { marginHorizontal: 16 }]}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Date picker ── */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.dateOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowDatePicker(false)} />
          <View style={[styles.dateCard, { backgroundColor: colors.white }]}>
            <Calendar
              current={tempDate}
              onDayPress={(day) => setTempDate(day.dateString)}
              markedDates={{ [tempDate]: { selected: true } }}
              theme={{
                backgroundColor: colors.white,
                calendarBackground: colors.white,
                textSectionTitleColor: colors.textSecondary,
                selectedDayBackgroundColor: BILLS,
                selectedDayTextColor: '#FFFFFF',
                todayTextColor: BILLS,
                dayTextColor: colors.textPrimary,
                textDisabledColor: isDark ? '#44444A' : '#d0cec9',
                arrowColor: colors.textPrimary,
                monthTextColor: colors.textPrimary,
                dotColor: BILLS,
              }}
            />
            <View style={styles.dateActions}>
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.dateCancelBtn}>
                <Text style={{ color: colors.textPrimary, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { setForm((f) => ({ ...f, anchor_date: tempDate })); setShowDatePicker(false); }}
                style={[styles.dateApplyBtn, { backgroundColor: BILLS }]}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? colors.background : '#F7F5F2' },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
    iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surfaceSubdued : colors.white },
    headerTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.textPrimary },
    headerSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 1 },

    scroll: { paddingHorizontal: 16, gap: 10 },

    // Hero
    hero: { borderRadius: 24, padding: 18, overflow: 'hidden', marginBottom: 4 },
    blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
    heroTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    heroTagText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8 },
    heroLabel: { marginTop: 10, fontFamily: 'Inter_600SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.6 },
    heroAmountRow: { flexDirection: 'row', alignItems: 'flex-start' },
    heroCurr: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: 'rgba(255,255,255,0.65)', marginTop: 6, marginRight: 4 },
    heroAmount: { fontFamily: 'DMMono_500Medium', fontSize: 38, color: '#fff', letterSpacing: -1.5 },
    heroMeta: { marginTop: 10, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12, padding: 12 },
    heroMetaLbl: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 },
    heroMetaVal: { fontFamily: 'Nunito_700Bold', fontSize: 15, color: '#fff', marginTop: 2 },

    listHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 2, paddingHorizontal: 4 },
    listDot: { width: 7, height: 7, borderRadius: 3.5 },
    listTitle: { fontFamily: 'Nunito_700Bold', fontSize: 13, letterSpacing: 0.3 },

    // Cards
    card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardActionArea: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
    cardIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cardTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 14 },
    cardPills: { flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' },
    pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
    pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.3 },
    metaChips: { flexDirection: 'row', gap: 5, marginTop: 5, flexWrap: 'wrap' },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
    chipDot: { width: 7, height: 7, borderRadius: 3.5 },
    chipText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
    cardAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
    ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    ctaBtnText: { fontFamily: 'Inter_700Bold', fontSize: 10 },

    // Empty
    empty: { alignItems: 'center', paddingVertical: 48 },
    emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18, marginBottom: 6 },
    emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },

    // Modal base
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalKAV: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, maxHeight: '94%', overflow: 'hidden' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 14 },
    sheetScroll: { paddingHorizontal: 20, paddingBottom: 36 },
    sheetTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, marginBottom: 3 },
    sheetSub: { fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 16, lineHeight: 18 },

    // Form fields
    formLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6, marginBottom: 7, marginTop: 14 },
    input: { height: 48, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14, marginBottom: 2 },

    // Account / Category picker — wrapping chip grid (scales to many items).
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 2 },
    pickerChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5, maxWidth: '100%' },
    pickerChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, maxWidth: 140 },
    chipAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    chipAvatarText: { fontFamily: 'Nunito_700Bold', fontSize: 10, color: '#fff' },

    // Cadence
    cadenceRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
    cadencePill: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    cadencePillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },

    // Submit / delete
    submitBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14, flexDirection: 'row', gap: 6 },
    submitBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, marginTop: 6 },
    deleteBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#C0503A' },

    // Confirm sheet
    previewCard: { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    previewIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    previewName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16 },
    previewAmount: { fontFamily: 'DMMono_500Medium', fontSize: 20, flexShrink: 0 },
    confirmBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 4 },
    confirmBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
    cancelBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', marginTop: 6, marginBottom: 16 },
    cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },

    // Date picker
    dateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
    dateCard: { borderRadius: 20, padding: 20 },
    dateActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    dateCancelBtn: { flex: 1, padding: 12, alignItems: 'center' },
    dateApplyBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  });
