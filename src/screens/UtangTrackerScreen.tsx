import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { database } from '@/db';
import type DebtModel from '@/db/models/Debt';
import { getLocalDateString } from '@/utils/date';
import {
  createDebt,
  updateDebt as localUpdateDebt,
  deleteDebt as localDeleteDebt,
} from '@/services/localMutations';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Debt {
  id: string;
  debtor_name: string;
  description: string | null;
  total_amount: number;
  amount_paid: number;
  due_date: string | null;
  created_at: string;
}

type FilterTab = 'all' | 'pending' | 'partial' | 'paid';

const getStatus = (debt: Debt): 'pending' | 'partial' | 'paid' => {
  if (debt.amount_paid <= 0) return 'pending';
  if (debt.amount_paid >= debt.total_amount) return 'paid';
  return 'partial';
};

const STATUS_CONFIG = {
  pending: { label: 'Unpaid', color: '#F59E0B', bg: '#FEF3C7' },
  partial: { label: 'Partial', color: '#3A7BD5', bg: '#DBEAFE' },
  paid: { label: 'Paid', color: '#10B981', bg: '#D1FAE5' },
};

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ─── Pulsing Dots ─────────────────────────────────────────────────────────────

function PulsingDots({ color = '#3A7BD5', size = 8 }: { color?: string; size?: number }) {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

// ─── Animated Progress Bar ────────────────────────────────────────────────────

function ProgressBar({ pct, color, isDark, colors }: { pct: number; color: string; isDark: boolean; colors: any }) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: pct,
      duration: 500,
      delay: 100,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={{ height: 4, marginHorizontal: 14, borderRadius: 2, marginBottom: 10, backgroundColor: isDark ? colors.border : '#F0F0F4' }}>
      <Animated.View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

// ─── Animated Debt Card ───────────────────────────────────────────────────────

function AnimatedDebtCard({ index, children }: { index: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      damping: 18,
      stiffness: 220,
      delay: index * 55,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── Spring Button ────────────────────────────────────────────────────────────

function SpringButton({
  onPress,
  style,
  children,
  disabled,
}: {
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.95, damping: 18, stiffness: 260, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 240, useNativeDriver: true }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled} activeOpacity={0.9}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

// ─── Empty Illustration ───────────────────────────────────────────────────────

function DebtEmptyIllustration({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 340, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: -6, duration: 1800, useNativeDriver: true }),
          Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  return (
    <Animated.View
      style={{
        width: 130,
        height: 110,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: [{ scale }, { translateY: float }],
      }}
    >
      {/* Stacked card illustration */}
      {[
        { rotate: '-8deg', tY: -10, opacity: 0.35 },
        { rotate: '5deg', tY: 4, opacity: 0.6 },
        { rotate: '0deg', tY: -2, opacity: 1 },
      ].map((card, i) => (
        <View
          key={i}
          style={[
            {
              position: 'absolute',
              width: 110,
              height: 68,
              borderRadius: 14,
              backgroundColor: `${color}${Math.round(card.opacity * 255).toString(16).padStart(2, '0')}`,
              transform: [{ rotate: card.rotate }, { translateY: card.tY }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 8,
              elevation: 4,
            },
            i === 2 && { alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          {i === 2 && <Ionicons name="cash-outline" size={26} color="#fff" />}
        </View>
      ))}
    </Animated.View>
  );
}

// ─── Calendar Modal ───────────────────────────────────────────────────────────

function CalendarModal({
  visible,
  initialDate,
  colors,
  isDark,
  onCancel,
  onApply,
}: {
  visible: boolean;
  initialDate: string;
  colors: any;
  isDark: boolean;
  onCancel: () => void;
  onApply: (date: string) => void;
}) {
  const [tempDate, setTempDate] = useState(initialDate || getLocalDateString(new Date()));

  // Sync when the modal opens with a new initial date
  useEffect(() => {
    if (visible) setTempDate(initialDate || getLocalDateString(new Date()));
  }, [visible, initialDate]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View
          style={{
            backgroundColor: colors.white ?? colors.background,
            borderRadius: 20,
            padding: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <Calendar
            current={tempDate}
            onDayPress={(day) => setTempDate(day.dateString)}
            markedDates={{ [tempDate]: { selected: true } }}
            theme={{
              backgroundColor: colors.white ?? colors.background,
              calendarBackground: colors.white ?? colors.background,
              textSectionTitleColor: colors.textSecondary,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: '#FFFFFF',
              todayTextColor: colors.primary,
              dayTextColor: colors.textPrimary,
              textDisabledColor: isDark ? '#44444A' : '#d0cec9',
              arrowColor: colors.textPrimary,
              monthTextColor: colors.textPrimary,
              dotColor: colors.primary,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable
              onPress={onCancel}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
              }}
            >
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.textPrimary }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(tempDate)}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                Apply
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UtangTrackerScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setDebts([]);
      setLoading(false);
      return;
    }
    const query = database
      .get<DebtModel>('debts')
      .query(Q.where('user_id', userId), Q.sortBy('updated_at', Q.desc));
    const sub = query.observe().subscribe((records) => {
      const raws = records.map((r) => {
        const raw = r._raw as Record<string, unknown>;
        return {
          id: r.id,
          debtor_name: r.debtorName,
          description: r.description ?? null,
          total_amount: r.totalAmount,
          amount_paid: r.amountPaid,
          due_date: r.dueDate ?? null,
          created_at: (raw.server_created_at as string) ?? '',
        } as Debt;
      });
      setDebts(raws);
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [userId]);

  const [filter, setFilter] = useState<FilterTab>('all');

  // ── Add debt modal state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    debtor_name: '',
    description: '',
    total_amount: '',
    due_date: '',
  });
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Payment modal state
  const [payTarget, setPayTarget] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  // ── Detail modal state
  const [detail, setDetail] = useState<Debt | null>(null);

  // ── Stats
  const stats = useMemo(() => {
    const totalOwed = debts.reduce((s, d) => s + d.total_amount, 0);
    const totalPaid = debts.reduce((s, d) => s + d.amount_paid, 0);
    const outstanding = totalOwed - totalPaid;
    const debtorCount = debts.filter((d) => getStatus(d) !== 'paid').length;
    return { totalOwed, totalPaid, outstanding, debtorCount };
  }, [debts]);

  // ── Filtered list
  const filtered = useMemo(
    () => (filter === 'all' ? debts : debts.filter((d) => getStatus(d) === filter)),
    [debts, filter]
  );

  // ── Add debt
  const submitAdd = async () => {
    const name = addForm.debtor_name.trim();
    const amount = parseFloat(addForm.total_amount);
    if (!name) {
      Alert.alert('Missing name', "Enter the debtor's name.");
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    setShowAdd(false);
    setAddForm({ debtor_name: '', description: '', total_amount: '', due_date: '' });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      await createDebt({
        userId: user.id,
        debtorName: name,
        description: addForm.description.trim() || undefined,
        totalAmount: amount,
        dueDate: addForm.due_date || undefined,
      });
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  // ── Record payment
  const submitPayment = async () => {
    if (!payTarget) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid payment amount.');
      return;
    }
    const remaining = payTarget.total_amount - payTarget.amount_paid;
    if (amount > remaining + 0.01) {
      Alert.alert('Over payment', `Max payment is ${fmt(remaining)}.`);
      return;
    }

    const newPaid = payTarget.amount_paid + amount;
    const targetId = payTarget.id;

    setPayTarget(null);
    setPayAmount('');
    if (detail) setDetail((prev) => (prev ? { ...prev, amount_paid: newPaid } : null));

    setPayLoading(true);
    try {
      await localUpdateDebt(targetId, { amountPaid: newPaid });
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPayLoading(false);
    }
  };

  // ── Delete
  const deleteDebt = (debt: Debt) => {
    Alert.alert('Delete debt', `Remove ${debt.debtor_name}'s debt record?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDetail(null);
          try {
            await localDeleteDebt(debt.id);
          } catch (err) {
            Alert.alert('Delete failed', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  // ─── Render
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Debt Tracker</Text>
          <Text style={styles.headerSub}>Track who owes you money</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <PulsingDots color={colors.primary} size={10} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stats strip */}
          <View style={[styles.statsStrip, { backgroundColor: colors.primary }]}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{fmt(stats.outstanding)}</Text>
              <Text style={styles.statLabel}>Outstanding</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{fmt(stats.totalPaid)}</Text>
              <Text style={styles.statLabel}>Collected</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.debtorCount}</Text>
              <Text style={styles.statLabel}>Active Debtors</Text>
            </View>
          </View>

          {/* ── Filter tabs */}
          <View
            style={[
              styles.filterRow,
              { backgroundColor: isDark ? colors.surfaceSubdued : colors.white, borderColor: colors.border },
            ]}
          >
            {(['all', 'pending', 'partial', 'paid'] as FilterTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilter(tab)}
                activeOpacity={0.7}
                style={[styles.filterTab, filter === tab && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: filter === tab ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Empty state */}
          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <DebtEmptyIllustration color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {filter === 'all' ? 'No debts yet' : `No ${filter} debts`}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {filter === 'all'
                  ? 'Tap + to record who owes you money.'
                  : 'Switch tabs to see other records.'}
              </Text>
              {filter === 'all' && (
                <SpringButton
                  onPress={() => setShowAdd(true)}
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>Add Debt</Text>
                </SpringButton>
              )}
            </View>
          )}

          {/* ── Debt cards */}
          {filtered.map((debt, index) => {
            const status = getStatus(debt);
            const cfg = STATUS_CONFIG[status];
            const remaining = debt.total_amount - debt.amount_paid;
            const pct = Math.min(1, debt.amount_paid / debt.total_amount);
            const overdue =
              debt.due_date &&
              status !== 'paid' &&
              new Date(debt.due_date) < new Date();

            return (
              <AnimatedDebtCard key={debt.id} index={index}>
                <TouchableOpacity
                  onPress={() => setDetail(debt)}
                  activeOpacity={0.82}
                  style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border }]}
                >
                  {/* Top row: avatar + name + status badge */}
                  <View style={styles.cardTop}>
                    <View style={[styles.avatar, { backgroundColor: `${colors.primary}20` }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>
                        {debt.debtor_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.debtorName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {debt.debtor_name}
                      </Text>
                      {debt.description && (
                        <Text style={[styles.debtDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                          {debt.description}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: isDark ? `${cfg.color}33` : cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  {status !== 'pending' && (
                    <ProgressBar pct={pct} color={cfg.color} isDark={isDark} colors={colors} />
                  )}

                  {/* Amounts row */}
                  <View style={styles.cardAmounts}>
                    <View style={styles.amountCol}>
                      <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Total</Text>
                      <Text style={[styles.amountValue, { color: colors.textPrimary }]}>
                        {fmt(debt.total_amount)}
                      </Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Paid</Text>
                      <Text style={[styles.amountValue, { color: '#10B981' }]}>
                        {fmt(debt.amount_paid)}
                      </Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Remaining</Text>
                      <Text style={[styles.amountValue, { color: remaining > 0 ? '#E07A5F' : '#10B981' }]}>
                        {fmt(remaining)}
                      </Text>
                    </View>
                  </View>

                  {/* Footer: due date + pay button */}
                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={overdue ? '#EF4444' : colors.textSecondary}
                      />
                      <Text style={[styles.dueDateText, { color: overdue ? '#EF4444' : colors.textSecondary }]}>
                        {debt.due_date
                          ? `Due ${fmtDate(debt.due_date)}${overdue ? ' · Overdue' : ''}`
                          : `Added ${fmtDate(debt.created_at)}`}
                      </Text>
                    </View>
                    {status !== 'paid' && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setPayTarget(debt);
                          setPayAmount('');
                        }}
                        style={[
                          styles.payBtn,
                          { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="cash-outline" size={13} color={colors.primary} />
                        <Text style={[styles.payBtnText, { color: colors.primary }]}>Record Payment</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              </AnimatedDebtCard>
            );
          })}
        </ScrollView>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ADD DEBT MODAL */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAdd(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add Debt</Text>
            <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>Record who owes you money</Text>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>DEBTOR NAME *</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary },
                ]}
                placeholder="e.g. Juan dela Cruz"
                placeholderTextColor={colors.textSecondary}
                value={addForm.debtor_name}
                onChangeText={(t) => setAddForm((f) => ({ ...f, debtor_name: t }))}
                autoCapitalize="words"
                autoFocus
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>WHAT FOR (optional)</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary },
                ]}
                placeholder="e.g. Dinner at ISLA Bar"
                placeholderTextColor={colors.textSecondary}
                value={addForm.description}
                onChangeText={(t) => setAddForm((f) => ({ ...f, description: t }))}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>AMOUNT (₱) *</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary },
                  ]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  value={addForm.total_amount}
                  onChangeText={(t) => setAddForm((f) => ({ ...f, total_amount: t.replace(/[^0-9.]/g, '') }))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>DUE DATE</Text>
                <TouchableOpacity
                  onPress={() => setShowCalendar(true)}
                  activeOpacity={0.7}
                  style={[
                    styles.input,
                    styles.datePickerBtn,
                    { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8' },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={addForm.due_date ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 14,
                      color: addForm.due_date ? colors.textPrimary : colors.textSecondary,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {addForm.due_date ? fmtDate(addForm.due_date) : 'Select date'}
                  </Text>
                  {addForm.due_date && (
                    <TouchableOpacity
                      onPress={() => setAddForm((f) => ({ ...f, due_date: '' }))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <SpringButton
              onPress={submitAdd}
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.submitBtnText}>Add Debt</Text>
            </SpringButton>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Calendar picker — rendered outside the Add modal to avoid z-index conflicts */}
      <CalendarModal
        visible={showCalendar}
        initialDate={addForm.due_date || getLocalDateString(new Date())}
        colors={colors}
        isDark={isDark}
        onCancel={() => setShowCalendar(false)}
        onApply={(date) => {
          setAddForm((f) => ({ ...f, due_date: date }));
          setShowCalendar(false);
        }}
      />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* RECORD PAYMENT MODAL */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Modal visible={!!payTarget} transparent animationType="slide" onRequestClose={() => setPayTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPayTarget(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Record Payment</Text>
            {payTarget && (
              <>
                {/* Mini context row */}
                <View style={styles.payContextRow}>
                  <View style={[styles.payAvatar, { backgroundColor: `${colors.primary}20` }]}>
                    <Text style={[styles.payAvatarText, { color: colors.primary }]}>
                      {payTarget.debtor_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.payName, { color: colors.textPrimary }]}>{payTarget.debtor_name}</Text>
                    <Text style={[styles.payRemaining, { color: colors.textSecondary }]}>
                      {fmt(payTarget.total_amount - payTarget.amount_paid)} remaining
                    </Text>
                  </View>
                  <View style={styles.payPctBadge}>
                    <Text style={[styles.payPctText, { color: colors.primary }]}>
                      {Math.round((payTarget.amount_paid / payTarget.total_amount) * 100)}% paid
                    </Text>
                  </View>
                </View>

                {/* Thin progress bar in context */}
                <ProgressBar
                  pct={Math.min(1, payTarget.amount_paid / payTarget.total_amount)}
                  color={colors.primary}
                  isDark={isDark}
                  colors={colors}
                />

                <View style={[styles.formGroup, { marginTop: 12 }]}>
                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>AMOUNT PAID (₱)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                        color: colors.textPrimary,
                        fontSize: 24,
                        fontFamily: 'DMMono_500Medium',
                        height: 56,
                      },
                    ]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    value={payAmount}
                    onChangeText={(t) => setPayAmount(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>

                {/* Quick amount pills */}
                <View style={styles.quickAmounts}>
                  {[
                    { label: 'Full', value: payTarget.total_amount - payTarget.amount_paid },
                    { label: 'Half', value: Math.ceil((payTarget.total_amount - payTarget.amount_paid) / 2) },
                  ]
                    .filter((v) => v.value > 0)
                    .map((v, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setPayAmount(v.value.toString())}
                        style={[
                          styles.quickPill,
                          { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', borderColor: colors.border },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.quickPillLabel, { color: colors.textSecondary }]}>{v.label}</Text>
                        <Text style={[styles.quickPillAmount, { color: colors.textPrimary }]}>{fmt(v.value)}</Text>
                      </TouchableOpacity>
                    ))}
                </View>

                <SpringButton
                  onPress={submitPayment}
                  disabled={payLoading}
                  style={[styles.submitBtn, { backgroundColor: '#10B981' }]}
                >
                  {payLoading ? (
                    <PulsingDots color="#fff" size={8} />
                  ) : (
                    <Text style={styles.submitBtnText}>Confirm Payment</Text>
                  )}
                </SpringButton>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* DETAIL MODAL */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDetail(null)} />
        <View style={[styles.detailSheet, { backgroundColor: colors.white }]}>
          <View style={styles.sheetHandle} />
          {detail &&
            (() => {
              const status = getStatus(detail);
              const cfg = STATUS_CONFIG[status];
              const remaining = detail.total_amount - detail.amount_paid;
              const pct = Math.min(1, detail.amount_paid / detail.total_amount);
              const overdue =
                detail.due_date && status !== 'paid' && new Date(detail.due_date) < new Date();

              return (
                <>
                  {/* Hero header */}
                  <View style={styles.detailHeader}>
                    <View style={[styles.detailAvatar, { backgroundColor: `${colors.primary}20` }]}>
                      <Text style={[styles.detailAvatarText, { color: colors.primary }]}>
                        {detail.debtor_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailName, { color: colors.textPrimary }]}>
                        {detail.debtor_name}
                      </Text>
                      {detail.description && (
                        <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>
                          {detail.description}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: isDark ? `${cfg.color}33` : cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {/* Animated progress bar */}
                  <View style={[styles.detailProgressTrack, { backgroundColor: isDark ? colors.border : '#F0F0F4' }]}>
                    <ProgressBar pct={pct} color={cfg.color} isDark={isDark} colors={colors} />
                  </View>
                  <Text style={[styles.detailProgressLabel, { color: colors.textSecondary }]}>
                    {Math.round(pct * 100)}% paid
                  </Text>

                  {/* Amount grid */}
                  <View style={[styles.detailGrid, { borderColor: colors.border }]}>
                    {[
                      { label: 'Total Amount', value: fmt(detail.total_amount), color: colors.textPrimary },
                      { label: 'Amount Paid', value: fmt(detail.amount_paid), color: '#10B981' },
                      { label: 'Remaining', value: fmt(remaining), color: remaining > 0 ? '#E07A5F' : '#10B981' },
                      {
                        label: detail.due_date ? (overdue ? 'Overdue Since' : 'Due By') : 'Date Added',
                        value: fmtDate(detail.due_date ?? detail.created_at),
                        color: overdue ? '#EF4444' : colors.textPrimary,
                      },
                    ].map((item, i) => (
                      <View
                        key={i}
                        style={[
                          styles.detailGridCell,
                          { borderRightColor: colors.border, borderBottomColor: colors.border },
                          i % 2 === 1 && { borderRightWidth: 0 },
                          i >= 2 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <Text style={[styles.detailGridLabel, { color: colors.textSecondary }]}>
                          {item.label}
                        </Text>
                        <Text style={[styles.detailGridValue, { color: item.color }]}>{item.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Actions */}
                  <View style={styles.detailActions}>
                    {status !== 'paid' && (
                      <SpringButton
                        onPress={() => {
                          setDetail(null);
                          setPayTarget(detail);
                          setPayAmount('');
                        }}
                        style={[styles.detailActionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                      >
                        <Ionicons name="cash-outline" size={16} color="#fff" />
                        <Text style={styles.detailActionBtnText}>Record Payment</Text>
                      </SpringButton>
                    )}
                    <TouchableOpacity
                      onPress={() => deleteDebt(detail)}
                      style={[
                        styles.detailActionBtn,
                        { backgroundColor: isDark ? '#3D1A1A' : '#FEF2F2', flex: 0, paddingHorizontal: 20 },
                      ]}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#F7F5F2',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
    },
    headerTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.textPrimary },
    headerSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

    // Stats strip
    statsStrip: {
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 20,
      paddingHorizontal: 8,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontFamily: 'DMMono_500Medium', fontSize: 16, color: '#fff' },
    statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.25)' },

    // Filter tabs
    filterRow: {
      flexDirection: 'row',
      borderRadius: 12,
      padding: 4,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 2,
    },
    filterTab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
    filterTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, marginTop: 20, marginBottom: 6 },
    emptySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 28,
      lineHeight: 20,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 9999,
    },
    emptyBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

    // Debt card
    card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 10,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18 },
    debtorName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 15 },
    debtDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
    statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontFamily: 'Inter_700Bold', fontSize: 11 },

    // Amounts
    cardAmounts: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
    amountCol: { flex: 1 },
    amountLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, marginBottom: 2 },
    amountValue: { fontFamily: 'DMMono_500Medium', fontSize: 13 },

    // Card footer
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    dueDateText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    payBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },

    // Modals
    modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalKAV: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: 36,
      paddingTop: 12,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#D1D5DB',
      alignSelf: 'center',
      marginBottom: 20,
    },
    sheetTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, marginBottom: 4 },
    sheetSub: { fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 20, color: colors.textSecondary },

    // Form
    formGroup: { marginBottom: 14 },
    formRow: { flexDirection: 'row', gap: 10 },
    formLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    input: {
      height: 44,
      borderRadius: 12,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    submitBtn: {
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    submitBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },

    // Pay modal context row
    payContextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
    },
    payAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    payAvatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18 },
    payName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16 },
    payRemaining: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
    payPctBadge: {
      marginLeft: 'auto',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: colors.primaryLight ?? '#EBF2EE',
    },
    payPctText: { fontFamily: 'Inter_700Bold', fontSize: 12 },

    // Quick amounts
    quickAmounts: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    quickPill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      gap: 2,
    },
    quickPillLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
    quickPillAmount: { fontFamily: 'DMMono_500Medium', fontSize: 13 },

    // Detail sheet
    detailSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: 36,
      paddingTop: 12,
    },
    detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    detailAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    detailAvatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 22 },
    detailName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18 },
    detailDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 },
    detailProgressTrack: { marginBottom: 0 },
    detailProgressLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      marginBottom: 14,
      textAlign: 'right',
      marginTop: 2,
    },
    detailGrid: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 16,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    detailGridCell: {
      width: '50%',
      padding: 14,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    detailGridLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 4 },
    detailGridValue: { fontFamily: 'DMMono_500Medium', fontSize: 15 },
    detailActions: { flexDirection: 'row', gap: 10 },
    detailActionBtn: {
      height: 52,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    detailActionBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
  });
