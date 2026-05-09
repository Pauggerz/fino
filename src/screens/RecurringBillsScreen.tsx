import React, { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { database } from '@/db';
import type RecurringBillModel from '@/db/models/RecurringBill';
import {
  createRecurringBill,
  deleteRecurringBill,
  markRecurringBillPaid,
  updateRecurringBill,
  type RecurringCadence,
} from '@/services/localMutations';

type RecurringBill = {
  id: string;
  title: string;
  amount: number;
  cadence: RecurringCadence;
  anchor_date: string;
  next_due_at: string;
  is_active: boolean;
  category?: string;
  last_paid_at?: string;
};

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });

const cadenceLabel = (c: RecurringCadence, anchor: string) => {
  if (c === 'weekly') {
    const day = new Date(`${anchor}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
    });
    return `Weekly · ${day}`;
  }
  if (c === 'yearly') return `Yearly · ${fmtDate(anchor)}`;
  const day = new Date(`${anchor}T00:00:00`).getDate();
  const suffix =
    day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
  return `Monthly · ${day}${suffix}`;
};

function committedThisMonth(items: RecurringBill[]): number {
  let total = 0;
  for (const i of items) {
    if (!i.is_active) continue;
    if (i.cadence === 'monthly') total += i.amount;
    else if (i.cadence === 'weekly') total += i.amount * 4;
    else total += i.amount / 12;
  }
  return total;
}

function isPaidThisCycle(item: RecurringBill): boolean {
  if (!item.last_paid_at) return false;
  // If we already advanced next_due_at past the last_paid_at, this cycle is done.
  return item.last_paid_at >= item.anchor_date;
}

export default function RecurringBillsScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const BILLS = '#7A4AB8';

  const [items, setItems] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const sub = database
      .get<RecurringBillModel>('recurring_bills')
      .query(Q.where('user_id', userId), Q.sortBy('next_due_at', Q.asc))
      .observe()
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
            last_paid_at: r.lastPaidAt,
          })),
        );
        setLoading(false);
      });
    return () => sub.unsubscribe();
  }, [userId]);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.is_active);
    const next = active[0]?.next_due_at;
    return {
      committed: committedThisMonth(items),
      bills: active.length,
      next: next ? fmtDate(next) : '—',
    };
  }, [items]);

  // ── Form modal state (handles both add + edit) ──────────────────────
  const emptyForm = () => ({
    title: '',
    amount: '',
    cadence: 'monthly' as RecurringCadence,
    anchor_date: new Date().toISOString().slice(0, 10),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tempDate, setTempDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

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
    });
    setShowForm(true);
  };

  const submitForm = async () => {
    const title = form.title.trim();
    const amount = parseFloat(form.amount);
    if (!title) {
      Alert.alert('Missing name', 'Give this bill a name (e.g. Rent).');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive amount.');
      return;
    }
    if (!userId) return;

    setShowForm(false);
    const id = editingId;

    try {
      if (id) {
        await updateRecurringBill(id, {
          title,
          amount,
          cadence: form.cadence,
          anchorDate: form.anchor_date,
        });
      } else {
        await createRecurringBill({
          userId,
          title,
          amount,
          cadence: form.cadence,
          anchorDate: form.anchor_date,
        });
      }
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setEditingId(null);
      setForm(emptyForm());
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Recurring Bills</Text>
          <Text style={styles.headerSub}>Rent, subscriptions, utilities</Text>
        </View>
        <TouchableOpacity
          onPress={openAdd}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={BILLS} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#5e3a99', '#3a1f6b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summary}
          >
            <View
              style={[styles.blob, { top: -40, right: -40, width: 160, height: 160 }]}
            />
            <View
              style={[styles.blob, { bottom: -30, left: -10, width: 110, height: 110, opacity: 0.5 }]}
            />
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>Monthly outflow</Text>
            </View>
            <Text style={styles.summaryLabel}>Committed this month</Text>
            <View style={styles.summaryAmountRow}>
              <Text style={styles.summaryCurr}>₱</Text>
              <Text style={styles.summaryAmount}>
                {Math.round(stats.committed).toLocaleString('en-PH')}
              </Text>
            </View>
            <View style={styles.summaryMeta}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryMetaLbl}>Bills</Text>
                <Text style={styles.summaryMetaVal}>
                  {stats.bills} active
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryMetaLbl}>Next due</Text>
                <Text style={styles.summaryMetaVal}>{stats.next}</Text>
              </View>
            </View>
          </LinearGradient>

          {items.length === 0 && (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: isDark ? colors.surfaceSubdued : '#ede5ff' },
                ]}
              >
                <Ionicons name="receipt" size={40} color={BILLS} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No recurring bills yet
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap + to track rent, subscriptions, or utility bills.
              </Text>
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.listHead}>
              <View style={[styles.listDot, { backgroundColor: BILLS }]} />
              <Text style={[styles.listTitle, { color: colors.textPrimary }]}>
                Upcoming bills
              </Text>
            </View>
          )}

          {items.map((item) => {
            const paid = isPaidThisCycle(item);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() => openEdit(item)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.white,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.cardIcon,
                    { backgroundColor: isDark ? `${BILLS}33` : '#ede5ff' },
                  ]}
                >
                  <Ionicons name="receipt" size={20} color={BILLS} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.cardTitle, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <View style={styles.cardMeta}>
                    <View
                      style={[
                        styles.pill,
                        { backgroundColor: colors.surfaceSubdued },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {cadenceLabel(item.cadence, item.anchor_date)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.pill,
                        {
                          backgroundColor: paid
                            ? isDark
                              ? '#0D2E23'
                              : '#ECFDF5'
                            : isDark
                              ? `${BILLS}33`
                              : '#ede5ff',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          { color: paid ? '#10B981' : BILLS },
                        ]}
                      >
                        {paid
                          ? `Paid · next ${fmtDate(item.next_due_at)}`
                          : `Due ${fmtDate(item.next_due_at)}`}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[styles.cardAmount, { color: '#C0503A' }]}>
                    −{fmt(item.amount)}
                  </Text>
                  {!paid && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        markRecurringBillPaid(item.id);
                      }}
                      activeOpacity={0.85}
                      style={[
                        styles.payBtn,
                        {
                          backgroundColor: isDark ? `${BILLS}33` : '#ede5ff',
                          borderColor: `${BILLS}40`,
                        },
                      ]}
                    >
                      <Ionicons name="checkmark" size={11} color={BILLS} />
                      <Text style={[styles.payBtnText, { color: BILLS }]}>
                        Mark paid
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowForm(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKAV}
        >
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHandle} />
            <ScrollView
              contentContainerStyle={styles.sheetScroll}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {editingId ? 'Edit recurring bill' : 'Add recurring bill'}
              </Text>
              <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
                {editingId
                  ? 'Update the schedule or amount.'
                  : "We'll nudge you 2 days before each due date."}
              </Text>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              BILL NAME
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark
                    ? colors.surfaceSubdued
                    : '#F4F4F8',
                  color: colors.textPrimary,
                },
              ]}
              placeholder="e.g. Rent"
              placeholderTextColor={colors.textSecondary}
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              AMOUNT (₱)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark
                    ? colors.surfaceSubdued
                    : '#F4F4F8',
                  color: colors.textPrimary,
                  fontFamily: 'DMMono_500Medium',
                  fontSize: 18,
                },
              ]}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={form.amount}
              onChangeText={(t) =>
                setForm((f) => ({ ...f, amount: t.replace(/[^0-9.]/g, '') }))
              }
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              FREQUENCY
            </Text>
            <View style={styles.cadenceRow}>
              {(['weekly', 'monthly', 'yearly'] as RecurringCadence[]).map(
                (c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, cadence: c }))}
                    activeOpacity={0.8}
                    style={[
                      styles.cadencePill,
                      {
                        backgroundColor:
                          form.cadence === c
                            ? BILLS
                            : isDark
                              ? colors.surfaceSubdued
                              : '#F4F4F8',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cadencePillText,
                        {
                          color:
                            form.cadence === c ? '#fff' : colors.textPrimary,
                        },
                      ]}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              FIRST / NEXT DUE DATE
            </Text>
            <Pressable
              onPress={() => {
                setTempDate(form.anchor_date);
                setShowDatePicker(true);
              }}
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                {fmtDate(form.anchor_date)}
              </Text>
            </Pressable>

            <TouchableOpacity
              onPress={submitForm}
              activeOpacity={0.85}
              style={[styles.submitBtn, { backgroundColor: BILLS }]}
            >
              <Text style={styles.submitBtnText}>
                {editingId ? 'Save changes' : 'Add bill'}
              </Text>
            </TouchableOpacity>

            {editingId && (
              <TouchableOpacity
                onPress={confirmDelete}
                activeOpacity={0.7}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={16} color="#C0503A" />
                <Text style={styles.deleteBtnText}>Remove bill</Text>
              </TouchableOpacity>
            )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Date picker (Calendar modal, matches AddTransaction) ── */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.dateModalOverlay}>
          <Pressable
            style={styles.dateModalBackdrop}
            onPress={() => setShowDatePicker(false)}
          />
          <View
            style={[styles.dateModalCard, { backgroundColor: colors.white }]}
          >
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
            <View style={styles.dateModalActions}>
              <Pressable
                onPress={() => setShowDatePicker(false)}
                style={styles.dateModalCancelBtn}
              >
                <Text style={{ color: colors.textPrimary }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setForm((f) => ({ ...f, anchor_date: tempDate }));
                  setShowDatePicker(false);
                }}
                style={[styles.dateModalApplyBtn, { backgroundColor: BILLS }]}
              >
                <Text style={{ color: '#FFF' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#F7F5F2',
    },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
    },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },

    scroll: { paddingHorizontal: 16, gap: 10 },

    summary: {
      borderRadius: 24,
      padding: 18,
      overflow: 'hidden',
      marginBottom: 6,
    },
    blob: {
      position: 'absolute',
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    summaryTag: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 20,
    },
    summaryTagText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: 'rgba(255,255,255,0.85)',
      letterSpacing: 0.8,
    },
    summaryLabel: {
      marginTop: 10,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: 'rgba(255,255,255,0.65)',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    summaryAmountRow: { flexDirection: 'row', alignItems: 'flex-start' },
    summaryCurr: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: 'rgba(255,255,255,0.65)',
      marginTop: 6,
      marginRight: 4,
    },
    summaryAmount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 38,
      color: '#fff',
      letterSpacing: -1.5,
    },
    summaryMeta: {
      marginTop: 10,
      flexDirection: 'row',
      backgroundColor: 'rgba(0,0,0,0.18)',
      borderRadius: 12,
      padding: 12,
    },
    summaryMetaLbl: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: 'rgba(255,255,255,0.55)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    summaryMetaVal: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 15,
      color: '#fff',
      marginTop: 2,
    },

    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 4,
    },
    listDot: { width: 7, height: 7, borderRadius: 3.5 },
    listTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 13,
      letterSpacing: 0.3,
    },

    card: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    cardIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 14 },
    cardMeta: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    pill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    pillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      letterSpacing: 0.4,
    },
    cardAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },

    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
    },
    payBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },

    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 18,
      marginBottom: 6,
    },
    emptySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      textAlign: 'center',
      paddingHorizontal: 24,
    },

    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalKAV: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      maxHeight: '92%',
    },
    sheetScroll: {
      paddingHorizontal: 20,
      paddingBottom: 32,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#D1D5DB',
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      marginBottom: 4,
    },
    sheetSub: { fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 16 },

    formLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 0.6,
      marginBottom: 6,
      marginTop: 6,
    },
    input: {
      height: 46,
      borderRadius: 12,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      marginBottom: 10,
    },
    cadenceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    cadencePill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
    },
    cadencePillText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },

    submitBtn: {
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    submitBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#fff',
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 44,
      borderRadius: 12,
      marginTop: 8,
    },
    deleteBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#C0503A',
    },

    // Calendar date picker (mirrors AddTransactionSheet)
    dateModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: 20,
    },
    dateModalBackdrop: { ...StyleSheet.absoluteFillObject },
    dateModalCard: {
      borderRadius: 20,
      padding: 20,
    },
    dateModalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    dateModalCancelBtn: { flex: 1, padding: 12, alignItems: 'center' },
    dateModalApplyBtn: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
  });
