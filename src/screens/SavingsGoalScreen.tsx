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
import { supabase } from '../services/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { database } from '@/db';
import type SavingsGoalModel from '@/db/models/SavingsGoal';
import {
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal as localDeleteGoal,
} from '@/services/localMutations';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: string;
  name: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  icon: string;
  color: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_ICONS: { icon: string; label: string }[] = [
  { icon: 'airplane', label: 'Travel' },
  { icon: 'car', label: 'Car' },
  { icon: 'home', label: 'House' },
  { icon: 'phone-portrait', label: 'Gadget' },
  { icon: 'school', label: 'Education' },
  { icon: 'heart', label: 'Wedding' },
  { icon: 'briefcase', label: 'Business' },
  { icon: 'medkit', label: 'Emergency' },
  { icon: 'gift', label: 'Gift' },
  { icon: 'star', label: 'Other' },
];

const PRESET_COLORS = [
  '#3A7BD5',
  '#10B981',
  '#F59E0B',
  '#E07A5F',
  '#7B5EA7',
  '#EC4899',
  '#14B8A6',
  '#64748B',
];

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return fmt(n);
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const daysUntil = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ─── Ring Progress Component ──────────────────────────────────────────────────

function RingProgress({
  pct,
  color,
  size = 72,
}: {
  pct: number;
  color: string;
  size?: number;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(pct, 1);

  // Pure View-based ring using border trick
  const borderWidth = stroke;
  const innerSize = size - stroke * 2;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: `${color}28`,
        }}
      />
      {/* We use a percentage text in center instead of SVG arc */}
      <Text
        style={{
          fontFamily: 'Nunito_800ExtraBold',
          fontSize: size * 0.22,
          color,
        }}
      >
        {Math.round(pct * 100)}%
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SavingsGoalScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setGoals([]);
      setLoading(false);
      return;
    }
    const query = database
      .get<SavingsGoalModel>('savings_goals')
      .query(Q.where('user_id', userId), Q.sortBy('updated_at', Q.desc));
    const sub = query.observe().subscribe((records) => {
      setGoals(
        records.map((r) => {
          const raw = r._raw as Record<string, unknown>;
          return {
            id: r.id,
            name: r.name,
            description: r.description ?? null,
            target_amount: r.targetAmount,
            current_amount: r.currentAmount,
            target_date: r.targetDate ?? null,
            icon: r.icon,
            color: r.color,
            created_at: (raw.server_created_at as string) ?? '',
          } as Goal;
        }),
      );
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [userId]);

  // ── Add/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    target_amount: '',
    target_date: '',
    icon: 'star',
    color: PRESET_COLORS[0],
  });

  // ── Deposit modal
  const [depositTarget, setDepositTarget] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMode, setDepositMode] = useState<'add' | 'withdraw'>('add');
  const [depositLoading, setDepositLoading] = useState(false);

  // ── Detail modal
  const [detail, setDetail] = useState<Goal | null>(null);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalSaved = goals.reduce((s, g) => s + g.current_amount, 0);
    const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
    const completed = goals.filter(
      (g) => g.current_amount >= g.target_amount
    ).length;
    return { totalSaved, totalTarget, completed, count: goals.length };
  }, [goals]);

  // ── Open add form ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditGoal(null);
    setForm({
      name: '',
      description: '',
      target_amount: '',
      target_date: '',
      icon: 'star',
      color: PRESET_COLORS[0],
    });
    setShowForm(true);
  };

  const openEdit = (goal: Goal) => {
    setEditGoal(goal);
    setForm({
      name: goal.name,
      description: goal.description ?? '',
      target_amount: goal.target_amount.toString(),
      target_date: goal.target_date ?? '',
      icon: goal.icon,
      color: goal.color,
    });
    setDetail(null);
    setShowForm(true);
  };

  // ── Submit form (optimistic) ───────────────────────────────────────────────
  const submitForm = async () => {
    const name = form.name.trim();
    const amount = parseFloat(form.target_amount);
    if (!name) {
      Alert.alert('Missing name', 'Enter a goal name.');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid target amount.');
      return;
    }

    setShowForm(false);

    try {
      if (editGoal) {
        await updateSavingsGoal(editGoal.id, {
          name,
          description: form.description.trim() || undefined,
          targetAmount: amount,
          targetDate: form.target_date.trim() || undefined,
          icon: form.icon,
          color: form.color,
        });
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in');
        await createSavingsGoal({
          userId: user.id,
          name,
          description: form.description.trim() || undefined,
          targetAmount: amount,
          targetDate: form.target_date.trim() || undefined,
          icon: form.icon,
          color: form.color,
        });
      }
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  // ── Deposit / Withdraw ────────────────────────────────────────────────────
  const submitDeposit = async () => {
    if (!depositTarget) return;
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    let newAmount =
      depositTarget.current_amount + (depositMode === 'add' ? amount : -amount);
    newAmount = Math.max(0, newAmount);

    setDepositLoading(true);
    try {
      await updateSavingsGoal(depositTarget.id, { currentAmount: newAmount });
      setDepositTarget(null);
      setDepositAmount('');
      if (detail)
        setDetail((prev) =>
          prev ? { ...prev, current_amount: newAmount } : null
        );
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setDepositLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteGoal = (goal: Goal) => {
    Alert.alert('Delete goal', `Delete "${goal.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDetail(null);
          try {
            await localDeleteGoal(goal.id);
          } catch (err) {
            Alert.alert('Delete failed', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Savings Goals</Text>
          <Text style={styles.headerSub}>Track your financial targets</Text>
        </View>
        <TouchableOpacity
          onPress={openAdd}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats strip */}
          {goals.length > 0 && (
            <View
              style={[
                styles.statsStrip,
                {
                  backgroundColor: isDark
                    ? colors.surfaceSubdued
                    : colors.white,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {fmtShort(stats.totalSaved)}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Total Saved
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {fmtShort(stats.totalTarget)}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Total Target
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  {stats.completed}/{stats.count}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Completed
                </Text>
              </View>
            </View>
          )}

          {/* Empty state */}
          {goals.length === 0 && (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  {
                    backgroundColor: isDark
                      ? colors.surfaceSubdued
                      : colors.primaryLight,
                  },
                ]}
              >
                <Ionicons
                  name="flag-outline"
                  size={40}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No goals yet
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap + to set your first savings target.
              </Text>
              <TouchableOpacity
                onPress={openAdd}
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Create Goal</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Goal cards */}
          {goals.map((goal) => {
            const pct =
              goal.target_amount > 0
                ? Math.min(goal.current_amount / goal.target_amount, 1)
                : 0;
            const remaining = Math.max(
              0,
              goal.target_amount - goal.current_amount
            );
            const done = goal.current_amount >= goal.target_amount;
            const days = goal.target_date ? daysUntil(goal.target_date) : null;
            const overdue = days !== null && days < 0 && !done;

            return (
              <TouchableOpacity
                key={goal.id}
                onPress={() => setDetail(goal)}
                activeOpacity={0.82}
                style={[
                  styles.card,
                  { backgroundColor: colors.white, borderColor: colors.border },
                ]}
              >
                {/* Colored top band */}
                <View
                  style={[styles.cardBand, { backgroundColor: goal.color }]}
                >
                  <View
                    style={[
                      styles.cardIconCircle,
                      { backgroundColor: 'rgba(255,255,255,0.25)' },
                    ]}
                  >
                    <Ionicons name={goal.icon as any} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {goal.name}
                    </Text>
                    {goal.description && (
                      <Text style={styles.cardDesc} numberOfLines={1}>
                        {goal.description}
                      </Text>
                    )}
                  </View>
                  {done && (
                    <View style={styles.completedBadge}>
                      <Ionicons name="checkmark" size={13} color="#10B981" />
                      <Text style={styles.completedText}>Done</Text>
                    </View>
                  )}
                </View>

                {/* Progress bar */}
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: isDark ? colors.border : '#F0F0F4' },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${pct * 100}%` as any,
                        backgroundColor: done ? '#10B981' : goal.color,
                      },
                    ]}
                  />
                </View>

                {/* Amounts row */}
                <View style={styles.cardBody}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.savedAmount,
                        { color: done ? '#10B981' : goal.color },
                      ]}
                    >
                      {fmt(goal.current_amount)}
                    </Text>
                    <Text
                      style={[
                        styles.savedLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      saved of {fmt(goal.target_amount)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.pctText,
                        { color: done ? '#10B981' : goal.color },
                      ]}
                    >
                      {Math.round(pct * 100)}%
                    </Text>
                    {!done && remaining > 0 && (
                      <Text
                        style={[
                          styles.remainingText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {fmt(remaining)} to go
                      </Text>
                    )}
                  </View>
                </View>

                {/* Footer */}
                <View
                  style={[styles.cardFooter, { borderTopColor: colors.border }]}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={12}
                      color={overdue ? '#EF4444' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.dateText,
                        { color: overdue ? '#EF4444' : colors.textSecondary },
                      ]}
                    >
                      {goal.target_date
                        ? done
                          ? `Reached ${fmtDate(goal.target_date)}`
                          : overdue
                            ? `Overdue · ${fmtDate(goal.target_date)}`
                            : `${days}d left · ${fmtDate(goal.target_date)}`
                        : `Started ${fmtDate(goal.created_at)}`}
                    </Text>
                  </View>
                  {!done && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setDepositTarget(goal);
                        setDepositAmount('');
                        setDepositMode('add');
                      }}
                      style={[
                        styles.depositBtn,
                        {
                          backgroundColor: `${goal.color}18`,
                          borderColor: `${goal.color}44`,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={13}
                        color={goal.color}
                      />
                      <Text
                        style={[styles.depositBtnText, { color: goal.color }]}
                      >
                        Add Money
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ADD / EDIT FORM MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowForm(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.handle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {editGoal ? 'Edit Goal' : 'New Savings Goal'}
            </Text>

            {/* Icon + color picker */}
            <View
              style={[
                styles.iconColorRow,
                {
                  backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Preview */}
              <View
                style={[styles.iconPreview, { backgroundColor: form.color }]}
              >
                <Ionicons name={form.icon as any} size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, gap: 10 }}>
                {/* Icon grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {PRESET_ICONS.map(({ icon }) => (
                      <TouchableOpacity
                        key={icon}
                        onPress={() => setForm((f) => ({ ...f, icon }))}
                        style={[
                          styles.iconPill,
                          {
                            backgroundColor:
                              form.icon === icon
                                ? form.color
                                : isDark
                                  ? colors.background
                                  : '#E8E8EE',
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={icon as any}
                          size={18}
                          color={
                            form.icon === icon ? '#fff' : colors.textSecondary
                          }
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {/* Color dots */}
                <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 2 }}>
                  {PRESET_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setForm((f) => ({ ...f, color: c }))}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c },
                        form.color === c && styles.colorDotSelected,
                      ]}
                      activeOpacity={0.8}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                GOAL NAME *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="e.g. Boracay Trip"
                placeholderTextColor={colors.textSecondary}
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                NOTES (optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Any details about this goal"
                placeholderTextColor={colors.textSecondary}
                value={form.description}
                onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  TARGET (₱) *
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
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  value={form.target_amount}
                  onChangeText={(t) =>
                    setForm((f) => ({
                      ...f,
                      target_amount: t.replace(/[^0-9.]/g, ''),
                    }))
                  }
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  TARGET DATE
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
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  value={form.target_date}
                  onChangeText={(t) =>
                    setForm((f) => ({ ...f, target_date: t }))
                  }
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={submitForm}
              activeOpacity={0.85}
              style={[styles.submitBtn, { backgroundColor: form.color }]}
            >
              <Text style={styles.submitBtnText}>
                {editGoal ? 'Save Changes' : 'Create Goal'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DEPOSIT / WITHDRAW MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={!!depositTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setDepositTarget(null)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setDepositTarget(null)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.handle} />
            {depositTarget && (
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <View
                    style={[
                      styles.iconPreviewSm,
                      { backgroundColor: depositTarget.color },
                    ]}
                  >
                    <Ionicons
                      name={depositTarget.icon as any}
                      size={16}
                      color="#fff"
                    />
                  </View>
                  <Text
                    style={[
                      styles.sheetTitle,
                      { color: colors.textPrimary, marginBottom: 0 },
                    ]}
                  >
                    {depositTarget.name}
                  </Text>
                </View>
                <Text
                  style={[styles.sheetSub, { color: colors.textSecondary }]}
                >
                  {fmt(depositTarget.current_amount)} saved ·{' '}
                  {fmt(
                    Math.max(
                      0,
                      depositTarget.target_amount - depositTarget.current_amount
                    )
                  )}{' '}
                  remaining
                </Text>

                {/* Mode toggle */}
                <View
                  style={[
                    styles.modeToggle,
                    {
                      backgroundColor: isDark
                        ? colors.surfaceSubdued
                        : '#F4F4F8',
                    },
                  ]}
                >
                  {(['add', 'withdraw'] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setDepositMode(mode)}
                      style={[
                        styles.modeBtn,
                        depositMode === mode && {
                          backgroundColor:
                            mode === 'add' ? depositTarget.color : '#E07A5F',
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={
                          mode === 'add'
                            ? 'add-circle-outline'
                            : 'remove-circle-outline'
                        }
                        size={15}
                        color={
                          depositMode === mode ? '#fff' : colors.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.modeBtnText,
                          {
                            color:
                              depositMode === mode
                                ? '#fff'
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        {mode === 'add' ? 'Add Money' : 'Withdraw'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.field}>
                  <Text
                    style={[styles.fieldLabel, { color: colors.textSecondary }]}
                  >
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
                        fontSize: 22,
                        fontFamily: 'DMMono_400Regular',
                      },
                    ]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    value={depositAmount}
                    onChangeText={(t) =>
                      setDepositAmount(t.replace(/[^0-9.]/g, ''))
                    }
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>

                {/* Quick amounts */}
                {depositMode === 'add' && (
                  <View style={styles.quickRow}>
                    {[500, 1000, 2000, 5000].map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setDepositAmount(v.toString())}
                        style={[
                          styles.quickChip,
                          {
                            backgroundColor: isDark
                              ? colors.surfaceSubdued
                              : '#F4F4F8',
                            borderColor: colors.border,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          +₱{v.toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  onPress={submitDeposit}
                  activeOpacity={0.85}
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor:
                        depositMode === 'add' ? depositTarget.color : '#E07A5F',
                    },
                  ]}
                  disabled={depositLoading}
                >
                  {depositLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {depositMode === 'add' ? 'Add to Goal' : 'Withdraw'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DETAIL MODAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={!!detail}
        transparent
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setDetail(null)} />
        <View style={[styles.detailSheet, { backgroundColor: colors.white }]}>
          <View style={styles.handle} />
          {detail &&
            (() => {
              const pct =
                detail.target_amount > 0
                  ? Math.min(detail.current_amount / detail.target_amount, 1)
                  : 0;
              const remaining = Math.max(
                0,
                detail.target_amount - detail.current_amount
              );
              const done = detail.current_amount >= detail.target_amount;
              const days = detail.target_date
                ? daysUntil(detail.target_date)
                : null;
              return (
                <>
                  {/* Hero band */}
                  <View
                    style={[
                      styles.detailBand,
                      { backgroundColor: detail.color },
                    ]}
                  >
                    <View
                      style={[
                        styles.detailIconCircle,
                        { backgroundColor: 'rgba(255,255,255,0.25)' },
                      ]}
                    >
                      <Ionicons
                        name={detail.icon as any}
                        size={30}
                        color="#fff"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{detail.name}</Text>
                      {detail.description && (
                        <Text style={styles.detailDesc}>
                          {detail.description}
                        </Text>
                      )}
                    </View>
                    {done && (
                      <View style={styles.completedBadge}>
                        <Ionicons name="checkmark" size={13} color="#10B981" />
                        <Text style={styles.completedText}>Done!</Text>
                      </View>
                    )}
                  </View>

                  {/* Progress bar */}
                  <View
                    style={[
                      styles.detailProgress,
                      { backgroundColor: isDark ? colors.border : '#F0F0F4' },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${pct * 100}%` as any,
                          backgroundColor: done ? '#10B981' : detail.color,
                        },
                      ]}
                    />
                  </View>

                  {/* Stats grid */}
                  <View style={[styles.grid, { borderColor: colors.border }]}>
                    {[
                      {
                        label: 'Saved',
                        value: fmt(detail.current_amount),
                        color: done ? '#10B981' : detail.color,
                      },
                      {
                        label: 'Target',
                        value: fmt(detail.target_amount),
                        color: colors.textPrimary,
                      },
                      {
                        label: 'Remaining',
                        value: fmt(remaining),
                        color: remaining > 0 ? '#E07A5F' : '#10B981',
                      },
                      {
                        label: detail.target_date ? 'Target Date' : 'Started',
                        value: detail.target_date
                          ? fmtDate(detail.target_date)
                          : fmtDate(detail.created_at),
                        color: colors.textPrimary,
                      },
                    ].map((item, i) => (
                      <View
                        key={i}
                        style={[
                          styles.gridCell,
                          {
                            borderRightColor: colors.border,
                            borderBottomColor: colors.border,
                          },
                          i % 2 === 1 && { borderRightWidth: 0 },
                          i >= 2 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.gridLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text style={[styles.gridValue, { color: item.color }]}>
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Progress label */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingHorizontal: 2,
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      style={[
                        styles.gridLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Progress
                    </Text>
                    <Text
                      style={[
                        styles.gridLabel,
                        { color: done ? '#10B981' : detail.color },
                      ]}
                    >
                      {Math.round(pct * 100)}%
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {!done && (
                      <TouchableOpacity
                        onPress={() => {
                          setDetail(null);
                          setDepositTarget(detail);
                          setDepositAmount('');
                          setDepositMode('add');
                        }}
                        style={[
                          styles.actionBtn,
                          { backgroundColor: detail.color, flex: 1 },
                        ]}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name="add-circle-outline"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.actionBtnText}>Add Money</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => openEdit(detail)}
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isDark
                            ? colors.surfaceSubdued
                            : '#F4F4F8',
                          flex: done ? 1 : 0,
                          paddingHorizontal: 18,
                        },
                      ]}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={16}
                        color={colors.textPrimary}
                      />
                      {done && (
                        <Text
                          style={[
                            styles.actionBtnText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          Edit
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deleteGoal(detail)}
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isDark ? '#3D1A1A' : '#FEF2F2',
                          flex: 0,
                          paddingHorizontal: 18,
                        },
                      ]}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#EF4444"
                      />
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
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },

    scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

    // Stats
    statsStrip: {
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontFamily: 'DMMono_400Regular', fontSize: 15 },
    statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
    statDivider: { width: 1, height: 28 },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 56 },
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
      fontSize: 20,
      marginBottom: 6,
    },
    emptySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 24,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 14,
    },
    emptyBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

    // Goal card
    card: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    cardBand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    cardIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    cardName: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 15,
      color: '#fff',
    },
    cardDesc: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: 'rgba(255,255,255,0.75)',
      marginTop: 1,
    },
    completedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(255,255,255,0.9)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
    },
    completedText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: '#10B981',
    },

    progressTrack: { height: 4, borderRadius: 0 },
    progressFill: { height: 4, borderRadius: 0 },

    cardBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 4,
    },
    savedAmount: { fontFamily: 'DMMono_400Regular', fontSize: 18 },
    savedLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: '#888',
      marginTop: 2,
    },
    pctText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20 },
    remainingText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: '#888',
      marginTop: 1,
    },

    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: 8,
    },
    dateText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
    depositBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
    },
    depositBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },

    // Modal base
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    kav: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: 36,
      paddingTop: 12,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#D1D5DB',
      alignSelf: 'center',
      marginBottom: 20,
    },
    sheetTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      marginBottom: 4,
    },
    sheetSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      marginBottom: 18,
    },

    // Icon + color picker
    iconColorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    iconPreview: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconPreviewSm: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconPill: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
    },
    colorDotSelected: {
      borderWidth: 3,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 2,
    },

    // Form
    field: { marginBottom: 12 },
    fieldRow: { flexDirection: 'row', gap: 10 },
    fieldLabel: {
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
    submitBtn: {
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    submitBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },

    // Deposit
    modeToggle: {
      flexDirection: 'row',
      borderRadius: 12,
      padding: 4,
      gap: 4,
      marginBottom: 14,
    },
    modeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 9,
    },
    modeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    quickRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    quickChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
    },
    quickChipText: { fontFamily: 'Inter_500Medium', fontSize: 12 },

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
      overflow: 'hidden',
    },
    detailBand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    detailIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailName: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 18,
      color: '#fff',
    },
    detailDesc: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 2,
    },
    detailProgress: { height: 8, borderRadius: 4, marginBottom: 16 },

    grid: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    gridCell: {
      width: '50%',
      padding: 14,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    gridLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      marginBottom: 4,
    },
    gridValue: { fontFamily: 'DMMono_400Regular', fontSize: 15 },

    actionBtn: {
      height: 50,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    actionBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
  });
