/**
 * AccountsScreen — manage user accounts (wallets, banks, cash).
 *
 * Mirrors the visual language of CategoryScreen: header with back / add
 * controls, a hero summary card showing the total balance across all
 * accounts, a rounded list card with one row per account, and a trailing
 * "Add account" row. Add/Edit go through a single inline form modal that
 * adapts based on whether it received an `initial` account or not.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../contexts/ThemeContext';
import { useAccounts } from '../hooks/useAccounts';
import {
  createAccount,
  deleteAccount,
  updateAccount,
} from '../services/localMutations';
import { supabase } from '../services/supabase';
import {
  ACCOUNT_AVATAR_OVERRIDE,
  ACCOUNT_LOGOS,
} from '../constants/accountLogos';
import { getCanonicalBrandName } from '../components/WalletCard';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { spacing } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import type { Account } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// Account category options. Stored in the `type` column on the accounts
// table, which WalletCard already surfaces as the uppercase brand label
// ("E-WALLET", "BANK ACCOUNT", etc.) on the home carousel.
const ACCOUNT_CATEGORIES = [
  { key: 'E-Wallet', icon: 'phone-portrait-outline' as const },
  { key: 'Bank', icon: 'business-outline' as const },
  { key: 'Cash', icon: 'cash-outline' as const },
  { key: 'Credit Card', icon: 'card-outline' as const },
  { key: 'Savings', icon: 'shield-checkmark-outline' as const },
  { key: 'Other', icon: 'ellipsis-horizontal-outline' as const },
];

const DEFAULT_CATEGORY = ACCOUNT_CATEGORIES[0].key;

// Older rows have `type: 'manual'` (the data-entry mode, not a real
// category). Treat them as the default until the user picks one.
function normalizeCategory(raw: string | undefined | null): string {
  if (!raw || raw.toLowerCase() === 'manual') return DEFAULT_CATEGORY;
  const match = ACCOUNT_CATEGORIES.find(
    (c) => c.key.toLowerCase() === raw.toLowerCase(),
  );
  return match ? match.key : raw;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraftState {
  name: string;
  balance: string;
  color: string;
  category: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { accounts, totalBalance, loading } = useAccounts();

  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);

  const closeScreen = useCallback(() => navigation.goBack(), [navigation]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const handleAdd = useCallback(async (draft: DraftState) => {
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('Required', 'Account name cannot be empty.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const startBal = parseFloat(draft.balance) || 0;
    const canonical = getCanonicalBrandName(name);
    const savedName = canonical ?? name;
    const letter = savedName[0].toUpperCase();

    await createAccount({
      userId: user.id,
      name: savedName,
      type: draft.category || DEFAULT_CATEGORY,
      brandColour: draft.color,
      letterAvatar: letter,
      startingBalance: startBal,
      sortOrder: 99,
    });
    setAdding(false);
  }, []);

  const handleSaveEdit = useCallback(
    async (id: string, draft: DraftState) => {
      const name = draft.name.trim();
      if (!name) {
        Alert.alert('Required', 'Account name cannot be empty.');
        return;
      }
      const canonical = getCanonicalBrandName(name);
      const savedName = canonical ?? name;
      const letter = savedName[0].toUpperCase();
      await updateAccount(id, {
        name: savedName,
        type: draft.category || DEFAULT_CATEGORY,
        brandColour: draft.color,
        letterAvatar: letter,
      });
      setEditing(null);
    },
    []
  );

  const handleDelete = useCallback((acc: Account) => {
    if (!acc.is_deletable) {
      Alert.alert(
        'Locked',
        `"${acc.name}" can’t be deleted. It’s a protected account.`
      );
      return;
    }
    Alert.alert(
      'Delete account',
      `Remove "${acc.name}"? Past transactions tied to this account stay in your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount(acc.id);
            setEditing(null);
          },
        },
      ]
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={closeScreen}
          activeOpacity={0.7}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Accounts</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {accounts.length} active{' '}
            {accounts.length === 1 ? 'account' : 'accounts'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setAdding(true)}
          activeOpacity={0.7}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.screenPadding,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Summary card ── */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryAvatar}>
              <Ionicons
                name="wallet-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={styles.summaryBody}>
              <Text style={styles.summaryLabel}>TOTAL BALANCE</Text>
              <Text style={styles.summaryHeadline}>
                {totalBalance < 0 ? '−' : ''}₱
                {Math.abs(totalBalance).toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.summarySub}>
                {accounts.length === 0
                  ? 'No accounts yet — add one to start tracking.'
                  : `Across ${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>YOUR ACCOUNTS</Text>

          {accounts.length > 0 && (
            <View
              style={[
                styles.listCard,
                {
                  backgroundColor: isDark
                    ? colors.surfaceSubdued
                    : colors.white,
                  borderColor: colors.border,
                },
              ]}
            >
              {accounts.map((acc, i) => (
                <AccountListRow
                  key={acc.id}
                  account={acc}
                  isLast={i === accounts.length - 1}
                  styles={styles}
                  colors={colors}
                  onPress={() => setEditing(acc)}
                />
              ))}
            </View>
          )}

          {accounts.length === 0 && (
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              No accounts yet. Add your first wallet, bank, or cash account
              below.
            </Text>
          )}

          <TouchableOpacity
            onPress={() => setAdding(true)}
            activeOpacity={0.7}
            style={styles.addRow}
          >
            <View
              style={[
                styles.addIconWrap,
                { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8' },
              ]}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.addText, { color: colors.primary }]}>
              Add account
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Edit modal */}
      <AccountFormModal
        visible={editing !== null}
        mode="edit"
        initial={editing}
        styles={styles}
        colors={colors}
        isDark={isDark}
        canDelete={editing !== null && editing.is_deletable}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (editing) return handleSaveEdit(editing.id, draft);
        }}
        onDelete={() => editing && handleDelete(editing)}
      />

      {/* Add modal */}
      <AccountFormModal
        visible={adding}
        mode="add"
        initial={null}
        styles={styles}
        colors={colors}
        isDark={isDark}
        canDelete={false}
        onClose={() => setAdding(false)}
        onSave={handleAdd}
        onDelete={() => {}}
      />
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function AccountListRow({
  account,
  isLast,
  styles,
  colors,
  onPress,
}: {
  account: Account;
  isLast: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const logo = ACCOUNT_LOGOS[account.name];
  const letter = ACCOUNT_AVATAR_OVERRIDE[account.name] ?? account.letter_avatar;
  const neg = account.balance < 0;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.row, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
    >
      {logo ? (
        <View style={[styles.acctAvatar, { backgroundColor: colors.white }]}>
          <Image
            source={logo}
            style={{ width: 20, height: 20 }}
            contentFit="contain"
            transition={150}
          />
        </View>
      ) : (
        <View
          style={[
            styles.acctAvatar,
            {
              backgroundColor: account.brand_colour ?? colors.catTileEmptyBg,
            },
          ]}
        >
          <Text style={styles.acctAvatarText}>{letter}</Text>
        </View>
      )}
      <View style={styles.rowMeta}>
        <View style={styles.rowTopLine}>
          <Text
            style={[styles.rowName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {account.name}
          </Text>
          <Text
            style={[
              styles.rowAmount,
              { color: neg ? colors.expenseRed : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {neg ? '−' : ''}₱
            {Math.abs(account.balance).toLocaleString('en-PH', {
              minimumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textSecondary}
        style={{ opacity: 0.5 }}
      />
    </TouchableOpacity>
  );
}

// ─── Add / Edit form modal ────────────────────────────────────────────────────

function AccountFormModal({
  visible,
  mode,
  initial,
  styles,
  colors,
  isDark,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  mode: 'add' | 'edit';
  initial: Account | null;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  isDark: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (draft: DraftState) => void | Promise<void>;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DraftState>({
    name: '',
    balance: '',
    color: ACCOUNT_COLORS[0],
    category: DEFAULT_CATEGORY,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setDraft({
        name: initial.name,
        balance: '',
        color: initial.brand_colour ?? ACCOUNT_COLORS[0],
        category: normalizeCategory(initial.type),
      });
    } else {
      setDraft({
        name: '',
        balance: '',
        color: ACCOUNT_COLORS[0],
        category: DEFAULT_CATEGORY,
      });
    }
    setSaving(false);
  }, [visible, initial]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const previewName = draft.name.trim() || 'Account name';
  const previewLetter = draft.name.trim()[0]?.toUpperCase() ?? '?';
  const previewLogo = ACCOUNT_LOGOS[draft.name.trim()];
  const canonical = getCanonicalBrandName(draft.name.trim());

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.container,
          {
            backgroundColor: isDark ? colors.background : '#F7F5F2',
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.formHeader}>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {mode === 'add' ? 'New account' : 'Edit account'}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {mode === 'add'
                ? 'Set a name, starting balance, and colour'
                : 'Update name or colour'}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.screenPadding,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Live preview */}
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            {previewLogo ? (
              <View
                style={[
                  styles.previewAvatar,
                  { backgroundColor: colors.white },
                ]}
              >
                <Image
                  source={previewLogo}
                  style={{ width: 36, height: 36 }}
                  contentFit="contain"
                />
              </View>
            ) : (
              <View
                style={[styles.previewAvatar, { backgroundColor: draft.color }]}
              >
                <Text style={styles.previewLetter}>{previewLetter}</Text>
              </View>
            )}
            <Text style={[styles.previewName, { color: colors.textPrimary }]}>
              {previewName}
            </Text>
            {canonical && (
              <View style={styles.brandBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={13}
                  color="#2d6a4f"
                />
                <Text style={styles.brandBadgeText}>
                  Stylized card applied
                </Text>
              </View>
            )}
            {mode === 'add' ? (
              <Text style={[styles.previewSub, { color: colors.textSecondary }]}>
                ₱
                {parseFloat(draft.balance || '0').toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                })}
              </Text>
            ) : initial ? (
              <Text style={[styles.previewSub, { color: colors.textSecondary }]}>
                Current balance: {initial.balance < 0 ? '−' : ''}₱
                {Math.abs(initial.balance).toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                })}
              </Text>
            ) : null}
          </View>

          {/* Name */}
          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="e.g. Maya, Seabank, Cash"
            placeholderTextColor={colors.textSecondary}
            maxLength={30}
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
              },
            ]}
          />

          {/* Category */}
          <Text style={styles.fieldLabel}>CATEGORY</Text>
          <View
            style={[
              styles.pickerCard,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pickerScrollContent}
            >
              {ACCOUNT_CATEGORIES.map((c) => {
                const active = draft.category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    activeOpacity={0.75}
                    onPress={() =>
                      setDraft((d) => ({ ...d, category: c.key }))
                    }
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active
                          ? draft.color
                          : isDark
                            ? colors.background
                            : '#F4F4F8',
                      },
                    ]}
                  >
                    <Ionicons
                      name={c.icon}
                      size={14}
                      color={active ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color: active ? '#FFFFFF' : colors.textPrimary,
                        },
                      ]}
                    >
                      {c.key}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Starting balance — add mode only */}
          {mode === 'add' && (
            <>
              <Text style={styles.fieldLabel}>STARTING BALANCE</Text>
              <View
                style={[
                  styles.pesoRow,
                  {
                    backgroundColor: isDark
                      ? colors.surfaceSubdued
                      : colors.white,
                  },
                ]}
              >
                <Text style={styles.pesoSign}>₱</Text>
                <TextInput
                  value={draft.balance}
                  onChangeText={(v) =>
                    setDraft((d) => ({
                      ...d,
                      balance: v.replace(/[^0-9.]/g, ''),
                    }))
                  }
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  style={styles.pesoInput}
                />
              </View>
            </>
          )}

          {/* Colour picker */}
          <Text style={styles.fieldLabel}>COLOR</Text>
          <View
            style={[
              styles.pickerCard,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pickerScrollContent}
            >
              {ACCOUNT_COLORS.map((c) => {
                const active = draft.color === c;
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.75}
                    onPress={() => setDraft((d) => ({ ...d, color: c }))}
                    style={[
                      styles.colorSwatch,
                      {
                        backgroundColor: c,
                        borderColor: active
                          ? colors.textPrimary
                          : 'transparent',
                      },
                    ]}
                  >
                    {active && (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Save */}
          <TouchableOpacity
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={saving}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              saving && { opacity: 0.6 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === 'add' ? 'Add account' : 'Save changes'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Delete (edit mode, deletable accounts only) */}
          {mode === 'edit' && canDelete && (
            <TouchableOpacity
              onPress={onDelete}
              activeOpacity={0.7}
              style={styles.deleteBtn}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={colors.expenseRed}
              />
              <Text style={[styles.deleteText, { color: colors.expenseRed }]}>
                Delete account
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#F7F5F2',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
      backgroundColor: isDark ? colors.background : '#F7F5F2',
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

    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },

    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 10,
    },

    // ── Summary card ──
    summaryCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.onTrackBorder,
      backgroundColor: colors.onTrackBg1,
      padding: 16,
      marginTop: 16,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    summaryAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.onTrackBg2,
      borderWidth: 1,
      borderColor: colors.onTrackBorder,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    summaryBody: { flex: 1 },
    summaryLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.onTrackSub,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom: 4,
    },
    summaryHeadline: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 22,
      color: colors.onTrackTitle,
      marginBottom: 4,
    },
    summarySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.onTrackSub,
      lineHeight: 18,
    },

    // ── List ──
    listCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
    },
    rowMeta: { flex: 1, minWidth: 0, gap: 4 },
    rowTopLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8,
    },
    rowName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      flexShrink: 1,
    },
    rowAmount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 12,
    },
    acctAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    acctAvatarText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 13,
      color: '#fff',
    },

    emptyHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 28,
      paddingHorizontal: 24,
      lineHeight: 19,
    },

    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      marginTop: 8,
    },
    addIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },

    // ── Form modal ──
    previewCard: {
      alignItems: 'center',
      gap: 6,
      paddingVertical: 22,
      paddingHorizontal: 20,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: 12,
      marginBottom: 4,
    },
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
      fontSize: 17,
      marginTop: 6,
    },
    previewSub: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 12,
    },
    brandBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#EFF8F2',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 2,
    },
    brandBadgeText: {
      fontSize: 12,
      color: '#2d6a4f',
      fontFamily: 'Inter_500Medium',
    },
    fieldLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 8,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.textPrimary,
    },
    pickerCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 12,
    },
    pickerScrollContent: {
      paddingHorizontal: 12,
      gap: 10,
      alignItems: 'center',
    },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },
    categoryChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    pesoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: 'hidden',
    },
    pesoSign: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 15,
      color: colors.textSecondary,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    pesoInput: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.textPrimary,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 28,
    },
    primaryBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
      color: '#FFFFFF',
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 16,
      paddingVertical: 12,
    },
    deleteText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
  });
