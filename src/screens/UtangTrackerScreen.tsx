import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useCachedQuery } from '@/hooks/useCachedQuery';

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
  pending:  { label: 'Unpaid',   color: '#F59E0B', bg: '#FEF3C7' },
  partial:  { label: 'Partial',  color: '#3A7BD5', bg: '#DBEAFE' },
  paid:     { label: 'Paid',     color: '#10B981', bg: '#D1FAE5' },
};

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UtangTrackerScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { data: debts, loading, mutate, refetch } = useCachedQuery<Debt>(
    'FINO_DEBTS_CACHE',
    () => supabase.from('debts').select('*').order('created_at', { ascending: false }),
  );

  const [filter, setFilter]     = useState<FilterTab>('all');

  // ── Add debt modal state
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({
    debtor_name: '', description: '', total_amount: '', due_date: '',
  });

  // ── Payment modal state
  const [payTarget, setPayTarget]   = useState<Debt | null>(null);
  const [payAmount, setPayAmount]   = useState('');
  const [payLoading, setPayLoading] = useState(false);

  // ── Detail modal state
  const [detail, setDetail] = useState<Debt | null>(null);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalOwed    = debts.reduce((s, d) => s + d.total_amount, 0);
    const totalPaid    = debts.reduce((s, d) => s + d.amount_paid, 0);
    const outstanding  = totalOwed - totalPaid;
    const debtorCount  = debts.filter(d => getStatus(d) !== 'paid').length;
    return { totalOwed, totalPaid, outstanding, debtorCount };
  }, [debts]);

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    filter === 'all' ? debts : debts.filter(d => getStatus(d) === filter),
  [debts, filter]);

  // ── Add debt (optimistic) ────────────────────────────────────────────────────
  const submitAdd = async () => {
    const name   = addForm.debtor_name.trim();
    const amount = parseFloat(addForm.total_amount);
    if (!name)               { Alert.alert('Missing name', 'Enter the debtor\'s name.'); return; }
    if (!amount || amount <= 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }

    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: Debt = {
      id:           optimisticId,
      debtor_name:  name,
      description:  addForm.description.trim() || null,
      total_amount: amount,
      amount_paid:  0,
      due_date:     addForm.due_date.trim() || null,
      created_at:   new Date().toISOString(),
    };

    // 1. Instantly show the new debt in the list
    const snapshot = debts;
    await mutate([optimistic, ...debts]);
    setShowAdd(false);
    setAddForm({ debtor_name: '', description: '', total_amount: '', due_date: '' });

    // 2. Persist to Supabase in background
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase.from('debts').insert({
      user_id:      user!.id,
      debtor_name:  name,
      description:  optimistic.description,
      total_amount: amount,
      amount_paid:  0,
      due_date:     optimistic.due_date,
    }).select().single();

    if (error) {
      // Rollback optimistic entry
      await mutate(snapshot);
      Alert.alert('Sync failed', error.message);
      return;
    }

    // 3. Swap optimistic placeholder with the real DB row
    await mutate([inserted as Debt, ...snapshot]);
  };

  // ── Record payment (optimistic) ───────────────────────────────────────────────
  const submitPayment = async () => {
    if (!payTarget) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { Alert.alert('Invalid amount', 'Enter a valid payment amount.'); return; }

    const remaining = payTarget.total_amount - payTarget.amount_paid;
    if (amount > remaining + 0.01) {
      Alert.alert('Over payment', `Max payment is ${fmt(remaining)}.`);
      return;
    }

    const newPaid = payTarget.amount_paid + amount;
    const snapshot = debts;

    // 1. Optimistically update list & close modal
    const updatedDebts = debts.map(d =>
      d.id === payTarget.id ? { ...d, amount_paid: newPaid } : d
    );
    await mutate(updatedDebts);
    setPayTarget(null);
    setPayAmount('');
    if (detail) setDetail(prev => prev ? { ...prev, amount_paid: newPaid } : null);

    // 2. Persist to Supabase in background
    setPayLoading(true);
    const { error } = await supabase.from('debts').update({
      amount_paid: newPaid,
      updated_at:  new Date().toISOString(),
    }).eq('id', payTarget.id);
    setPayLoading(false);

    if (error) {
      // Rollback
      await mutate(snapshot);
      Alert.alert('Sync failed', error.message);
    }
  };

  // ── Delete (optimistic) ───────────────────────────────────────────────────────
  const deleteDebt = (debt: Debt) => {
    Alert.alert(
      'Delete debt',
      `Remove ${debt.debtor_name}'s debt record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const snapshot = debts;
            // 1. Remove from UI immediately
            setDetail(null);
            await mutate(debts.filter(d => d.id !== debt.id));

            // 2. Delete from Supabase in background
            const { error } = await supabase.from('debts').delete().eq('id', debt.id);
            if (error) {
              await mutate(snapshot);
              Alert.alert('Sync failed', error.message);
            }
          },
        },
      ],
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Utang Tracker</Text>
          <Text style={styles.headerSub}>Track who owes you money</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stats strip ── */}
          <View style={[styles.statsStrip, { backgroundColor: colors.primary }]}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{fmt(stats.outstanding)}</Text>
              <Text style={styles.statLabel}>Outstanding</Text>
            </View>
            <View style={[styles.statDivider]} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{fmt(stats.totalPaid)}</Text>
              <Text style={styles.statLabel}>Collected</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.debtorCount}</Text>
              <Text style={styles.statLabel}>Debtors</Text>
            </View>
          </View>

          {/* ── Filter tabs ── */}
          <View style={[styles.filterRow, { backgroundColor: isDark ? colors.surfaceSubdued : colors.white, borderColor: colors.border }]}>
            {(['all', 'pending', 'partial', 'paid'] as FilterTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilter(tab)}
                activeOpacity={0.7}
                style={[
                  styles.filterTab,
                  filter === tab && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={[
                  styles.filterTabText,
                  { color: filter === tab ? '#fff' : colors.textSecondary },
                ]}>
                  {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Empty state ── */}
          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.surfaceSubdued : colors.primaryLight }]}>
                <Ionicons name="cash-outline" size={40} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {filter === 'all' ? 'No debts yet' : `No ${filter} debts`}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {filter === 'all' ? 'Tap + to add someone who owes you.' : 'Switch tabs to see other debts.'}
              </Text>
            </View>
          )}

          {/* ── Debt cards ── */}
          {filtered.map(debt => {
            const status    = getStatus(debt);
            const cfg       = STATUS_CONFIG[status];
            const remaining = debt.total_amount - debt.amount_paid;
            const pct       = Math.min(1, debt.amount_paid / debt.total_amount);

            return (
              <TouchableOpacity
                key={debt.id}
                onPress={() => setDetail(debt)}
                activeOpacity={0.82}
                style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border }]}
              >
                {/* Top row: avatar + name + status badge */}
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
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
                  <View style={[styles.statusBadge, { backgroundColor: isDark ? cfg.color + '33' : cfg.bg }]}>
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                {status !== 'pending' && (
                  <View style={[styles.progressTrack, { backgroundColor: isDark ? colors.border : '#F0F0F4' }]}>
                    <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: cfg.color }]} />
                  </View>
                )}

                {/* Amounts row */}
                <View style={styles.cardAmounts}>
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Total</Text>
                    <Text style={[styles.amountValue, { color: colors.textPrimary }]}>{fmt(debt.total_amount)}</Text>
                  </View>
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Paid</Text>
                    <Text style={[styles.amountValue, { color: '#10B981' }]}>{fmt(debt.amount_paid)}</Text>
                  </View>
                  <View style={styles.amountCol}>
                    <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Remaining</Text>
                    <Text style={[styles.amountValue, { color: remaining > 0 ? '#E07A5F' : '#10B981' }]}>
                      {fmt(remaining)}
                    </Text>
                  </View>
                </View>

                {/* Footer: due date + pay button */}
                <View style={styles.cardFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                    <Text style={[styles.dueDateText, { color: colors.textSecondary }]}>
                      {debt.due_date ? `Due ${fmtDate(debt.due_date)}` : `Added ${fmtDate(debt.created_at)}`}
                    </Text>
                  </View>
                  {status !== 'paid' && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setPayTarget(debt); setPayAmount(''); }}
                      style={[styles.payBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="cash-outline" size={13} color={colors.primary} />
                      <Text style={[styles.payBtnText, { color: colors.primary }]}>Record Payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
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
                style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary }]}
                placeholder="e.g. Juan dela Cruz"
                placeholderTextColor={colors.textSecondary}
                value={addForm.debtor_name}
                onChangeText={t => setAddForm(f => ({ ...f, debtor_name: t }))}
                autoCapitalize="words"
                autoFocus
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>WHAT FOR (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary }]}
                placeholder="e.g. Dinner at ISLA Bar"
                placeholderTextColor={colors.textSecondary}
                value={addForm.description}
                onChangeText={t => setAddForm(f => ({ ...f, description: t }))}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>AMOUNT (₱) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  value={addForm.total_amount}
                  onChangeText={t => setAddForm(f => ({ ...f, total_amount: t.replace(/[^0-9.]/g, '') }))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>AGREED TO PAY BY</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  value={addForm.due_date}
                  onChangeText={t => setAddForm(f => ({ ...f, due_date: t }))}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={submitAdd}
              activeOpacity={0.85}
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.submitBtnText}>Add Debt</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
                  {payTarget.debtor_name} · {fmt(payTarget.total_amount - payTarget.amount_paid)} remaining
                </Text>

                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>AMOUNT PAID (₱)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary, fontSize: 22, fontFamily: 'DMMono_400Regular' }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    value={payAmount}
                    onChangeText={t => setPayAmount(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>

                {/* Quick amount pills */}
                <View style={styles.quickAmounts}>
                  {[
                    payTarget.total_amount - payTarget.amount_paid,
                    Math.ceil((payTarget.total_amount - payTarget.amount_paid) / 2),
                  ].filter(v => v > 0).map((v, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setPayAmount(v.toString())}
                      style={[styles.quickPill, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', borderColor: colors.border }]}
                    >
                      <Text style={[styles.quickPillText, { color: colors.textPrimary }]}>
                        {i === 0 ? 'Full  ' : 'Half  '}{fmt(v)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={submitPayment}
                  activeOpacity={0.85}
                  style={[styles.submitBtn, { backgroundColor: '#10B981' }]}
                  disabled={payLoading}
                >
                  {payLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>Confirm Payment</Text>
                  }
                </TouchableOpacity>
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
          {detail && (() => {
            const status    = getStatus(detail);
            const cfg       = STATUS_CONFIG[status];
            const remaining = detail.total_amount - detail.amount_paid;
            const pct       = Math.min(1, detail.amount_paid / detail.total_amount);
            return (
              <>
                <View style={styles.detailHeader}>
                  <View style={[styles.detailAvatar, { backgroundColor: colors.primary + '22' }]}>
                    <Text style={[styles.detailAvatarText, { color: colors.primary }]}>
                      {detail.debtor_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailName, { color: colors.textPrimary }]}>{detail.debtor_name}</Text>
                    {detail.description && (
                      <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{detail.description}</Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: isDark ? cfg.color + '33' : cfg.bg }]}>
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={[styles.detailProgressTrack, { backgroundColor: isDark ? colors.border : '#F0F0F4' }]}>
                  <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: cfg.color }]} />
                </View>
                <Text style={[styles.detailProgressLabel, { color: colors.textSecondary }]}>
                  {Math.round(pct * 100)}% paid
                </Text>

                {/* Amount grid */}
                <View style={[styles.detailGrid, { borderColor: colors.border }]}>
                  <View style={[styles.detailGridCell, { borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailGridLabel, { color: colors.textSecondary }]}>Total Amount</Text>
                    <Text style={[styles.detailGridValue, { color: colors.textPrimary }]}>{fmt(detail.total_amount)}</Text>
                  </View>
                  <View style={[styles.detailGridCell, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailGridLabel, { color: colors.textSecondary }]}>Amount Paid</Text>
                    <Text style={[styles.detailGridValue, { color: '#10B981' }]}>{fmt(detail.amount_paid)}</Text>
                  </View>
                  <View style={[styles.detailGridCell, { borderRightColor: colors.border, borderBottomWidth: 0 }]}>
                    <Text style={[styles.detailGridLabel, { color: colors.textSecondary }]}>Remaining</Text>
                    <Text style={[styles.detailGridValue, { color: remaining > 0 ? '#E07A5F' : '#10B981' }]}>{fmt(remaining)}</Text>
                  </View>
                  <View style={[styles.detailGridCell, { borderBottomWidth: 0 }]}>
                    <Text style={[styles.detailGridLabel, { color: colors.textSecondary }]}>
                      {detail.due_date ? 'Agreed to Pay By' : 'Date Added'}
                    </Text>
                    <Text style={[styles.detailGridValue, { color: colors.textPrimary }]}>
                      {fmtDate(detail.due_date ?? detail.created_at)}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.detailActions}>
                  {status !== 'paid' && (
                    <TouchableOpacity
                      onPress={() => { setDetail(null); setPayTarget(detail); setPayAmount(''); }}
                      style={[styles.detailActionBtn, { backgroundColor: colors.primary }]}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="cash-outline" size={16} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Record Payment</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => deleteDebt(detail)}
                    style={[styles.detailActionBtn, { backgroundColor: isDark ? '#3D1A1A' : '#FEF2F2', flex: 0, paddingHorizontal: 18 }]}
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

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? colors.background : '#F7F5F2',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    backgroundColor: isDark ? colors.background : '#F7F5F2',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
  },
  headerTitle: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 20,
    color: colors.textPrimary,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular', fontSize: 12,
    color: colors.textSecondary, marginTop: 1,
  },
  addBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },

  // Scroll
  scroll: {
    paddingHorizontal: 16, paddingTop: 8, gap: 12,
  },

  // Stats strip
  statsStrip: {
    borderRadius: 16, flexDirection: 'row',
    alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8,
    marginBottom: 4,
  },
  statItem: {
    flex: 1, alignItems: 'center',
  },
  statValue: {
    fontFamily: 'DMMono_400Regular', fontSize: 16, color: '#fff',
  },
  statLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 11,
    color: 'rgba(255,255,255,0.7)', marginTop: 2,
  },
  statDivider: {
    width: 1, height: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row', borderRadius: 12,
    padding: 4, borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  filterTab: {
    flex: 1, paddingVertical: 7, borderRadius: 9,
    alignItems: 'center',
  },
  filterTabText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 12,
  },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingVertical: 48,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular', fontSize: 13,
    textAlign: 'center',
  },

  // Debt card
  card: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 17,
  },
  debtorName: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 15,
  },
  debtDesc: {
    fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontFamily: 'Inter_700Bold', fontSize: 11,
  },

  // Progress
  progressTrack: {
    height: 4, marginHorizontal: 14, borderRadius: 2, marginBottom: 10,
  },
  progressFill: {
    height: 4, borderRadius: 2,
  },

  // Amounts
  cardAmounts: {
    flexDirection: 'row',
    paddingHorizontal: 14, paddingBottom: 12, gap: 8,
  },
  amountCol: { flex: 1 },
  amountLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 10, marginBottom: 2,
  },
  amountValue: {
    fontFamily: 'DMMono_400Regular', fontSize: 13,
  },

  // Card footer
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 12,
  },
  dueDateText: {
    fontFamily: 'Inter_400Regular', fontSize: 11,
  },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  payBtnText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 11,
  },

  // Modals
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalKAV: {
    flex: 1, justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 20, marginBottom: 4,
  },
  sheetSub: {
    fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 20,
  },

  // Form
  formGroup: { marginBottom: 14 },
  formRow: { flexDirection: 'row', gap: 10 },
  formLabel: {
    fontFamily: 'Inter_700Bold', fontSize: 10,
    letterSpacing: 0.6, marginBottom: 6,
  },
  input: {
    height: 44, borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular', fontSize: 14,
  },
  submitBtn: {
    height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff',
  },

  // Quick amounts
  quickAmounts: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  quickPill: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    alignItems: 'center', borderWidth: 1,
  },
  quickPillText: {
    fontFamily: 'Inter_500Medium', fontSize: 13,
  },

  // Detail sheet
  detailSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  detailAvatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  detailAvatarText: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 22,
  },
  detailName: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
  },
  detailDesc: {
    fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2,
  },
  detailProgressTrack: {
    height: 6, borderRadius: 3, marginBottom: 6,
  },
  detailProgressLabel: {
    fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 16, textAlign: 'right',
  },
  detailGrid: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', marginBottom: 16,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  detailGridCell: {
    width: '50%', padding: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailGridLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 4,
  },
  detailGridValue: {
    fontFamily: 'DMMono_400Regular', fontSize: 15,
  },
  detailActions: {
    flexDirection: 'row', gap: 10,
  },
  detailActionBtn: {
    flex: 1, height: 50, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  detailActionBtnText: {
    fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff',
  },
});
