/**
 * CategoryScreen — manage expense categories and their monthly budgets.
 *
 * • Default categories (Food / Transport / Shopping / Bills / Health / Others)
 *   are renameable, re-coloured, re-iconed, and budget-editable, but NOT
 *   deletable — preserves transaction history continuity.
 * • Custom categories support every operation including delete.
 * • Uniqueness is enforced case-insensitively against both expense and income
 *   names, so a custom category can never collide with the income side.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, type Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { CategoryIcon } from '@/components/CategoryIcon';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { database } from '@/db';
import type CategoryModel from '@/db/models/Category';
import type TransactionModel from '@/db/models/Transaction';
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/services/localMutations';
import {
  DEFAULT_EXPENSE_KEYS,
  INCOME_KEYS,
} from '@/constants/categoryMappings';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  CATEGORY_SWATCHES,
  CATEGORY_TILE_BGS,
  ICON_LIBRARY,
} from '@/constants/iconLibrary';
import { spacing } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  name: string;
  emoji: string;
  tile_bg_colour: string;
  text_colour: string;
  budget_limit: number | null;
  is_default: boolean;
  sort_order: number;
}

interface DraftState {
  name: string;
  iconKey: string;
  colorIdx: number;
  budgetLimit: string; // raw input — parsed at save
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();
  return { start, end };
}

function findColorIdx(hex: string | null | undefined): number {
  if (!hex) return 0;
  const idx = CATEGORY_SWATCHES.indexOf(hex);
  return idx >= 0 ? idx : 0;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CategoryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, isPro } = useAuth();
  const userId = user?.id;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [spendByName, setSpendByName] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Modal state
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [adding, setAdding] = useState(false);

  // ── Live data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { start, end } = monthBounds();
    const catsQ = database
      .get<CategoryModel>('categories')
      .query(
        Q.where('user_id', userId),
        Q.where('is_active', true),
        Q.sortBy('sort_order', Q.asc)
      );
    const txQ = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('type', 'expense'),
        Q.where('date', Q.gte(start)),
        Q.where('date', Q.lte(end))
      );

    const sub: Subscription = combineLatest([
      catsQ.observeWithColumns([
        'name',
        'emoji',
        'tile_bg_colour',
        'text_colour',
        'budget_limit',
        'is_active',
        'is_default',
        'sort_order',
      ]),
      txQ.observeWithColumns([
        'amount',
        'category',
        'type',
        'is_transfer',
        'date',
      ]),
    ])
      .pipe(debounceTime(50))
      .subscribe(([catRecords, txRecords]) => {
        // Compute month-to-date spend per category name (lowercased).
        const spend: Record<string, number> = {};
        for (const tx of txRecords) {
          if (tx.isTransfer || (tx.category ?? '').toLowerCase() === 'transfer')
            continue;
          if (!tx.category) continue;
          const k = tx.category.toLowerCase();
          spend[k] = (spend[k] ?? 0) + tx.amount;
        }
        setSpendByName(spend);

        // Filter out income categories (matched against the `emoji` key).
        const expenseRows: CategoryRow[] = catRecords
          .filter((c) => !INCOME_KEYS.has((c.emoji ?? '').toLowerCase()))
          .map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji ?? 'others',
            tile_bg_colour: c.tileBgColour ?? '#F2EFEC',
            text_colour: c.textColour ?? '#5C5550',
            budget_limit: c.budgetLimit ?? null,
            is_default: c.isDefault,
            sort_order: c.sortOrder,
          }));
        setRows(expenseRows);
        setLoading(false);
      });

    return () => sub.unsubscribe();
  }, [userId]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const closeScreen = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const otherNames = useMemo(
    () => rows.map((r) => r.name.toLowerCase()),
    [rows]
  );

  const handleSaveEdit = useCallback(
    async (id: string, draft: DraftState) => {
      const name = draft.name.trim();
      if (!name) {
        Alert.alert('Required', 'Category name cannot be empty.');
        return;
      }
      // Uniqueness — exclude the row being edited.
      const collision = rows.some(
        (r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase()
      );
      if (collision) {
        Alert.alert('Already exists', `"${name}" is already a category.`);
        return;
      }
      const limit = parseFloat(draft.budgetLimit);
      await updateCategory(id, {
        name,
        emoji: draft.iconKey,
        tileBgColour: CATEGORY_TILE_BGS[draft.colorIdx],
        textColour: CATEGORY_SWATCHES[draft.colorIdx],
        budgetLimit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      });
      setEditing(null);
    },
    [rows]
  );

  const handleAdd = useCallback(
    async (draft: DraftState) => {
      if (!userId) return;
      const name = draft.name.trim();
      if (!name) {
        Alert.alert('Required', 'Category name cannot be empty.');
        return;
      }
      const lower = name.toLowerCase();
      if (otherNames.includes(lower) || INCOME_KEYS.has(lower)) {
        Alert.alert('Already exists', `"${name}" is already a category.`);
        return;
      }
      const limit = parseFloat(draft.budgetLimit);
      const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), -1);
      await createCategory({
        userId,
        name,
        emoji: draft.iconKey,
        tileBgColour: CATEGORY_TILE_BGS[draft.colorIdx],
        textColour: CATEGORY_SWATCHES[draft.colorIdx],
        budgetLimit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        sortOrder: maxSort + 1,
      });
      setAdding(false);
    },
    [userId, rows, otherNames]
  );

  const handleDelete = useCallback(async (row: CategoryRow) => {
    const isDefault = DEFAULT_EXPENSE_KEYS.has(row.emoji.toLowerCase());
    Alert.alert(
      'Delete category',
      isDefault
        ? `Remove "${row.name}"? This is a default category — auto-categorization will stop assigning transactions to it. Past transactions keep their tag.`
        : `Remove "${row.name}"? Past transactions tagged with this category keep their tag.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(row.id);
            setEditing(null);
          },
        },
      ]
    );
  }, []);

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalBudget = rows.reduce((s, r) => s + (r.budget_limit ?? 0), 0);
  const totalSpent = rows.reduce(
    (s, r) => s + (spendByName[r.name.toLowerCase()] ?? 0),
    0
  );
  const budgetedCount = rows.filter((r) => r.budget_limit != null).length;

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
          <Text style={styles.headerTitle}>Categories & Budget</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {rows.length} {rows.length === 1 ? 'category' : 'categories'}
            {budgetedCount > 0 ? ` · ${budgetedCount} with budget` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (!isPro) {
              navigation.navigate('ProUpgrade', { source: 'add_category' });
              return;
            }
            setAdding(true);
          }}
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
          {/* ── Summary card (matches HomeScreen onTrack info box) ── */}
          {totalBudget > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryAvatar}>
                <Ionicons
                  name="wallet-outline"
                  size={20}
                  color={colors.primary}
                />
              </View>

              <View style={styles.summaryBody}>
                <Text style={styles.summaryLabel}>SPENT THIS MONTH</Text>
                <Text style={styles.summaryHeadline}>
                  ₱{Math.round(totalSpent).toLocaleString('en-PH')}
                  <Text style={styles.summaryHeadlineSub}>
                    {' '}
                    / ₱{Math.round(totalBudget).toLocaleString('en-PH')}
                  </Text>
                </Text>
                <Text style={styles.summarySub}>
                  {totalSpent >= totalBudget
                    ? `Over budget by ₱${Math.round(totalSpent - totalBudget).toLocaleString('en-PH')}`
                    : `₱${Math.round(totalBudget - totalSpent).toLocaleString('en-PH')} left across ${budgetedCount} ${budgetedCount === 1 ? 'category' : 'categories'}`}
                </Text>

                <View style={styles.summaryBarTrack}>
                  <View
                    style={[
                      styles.summaryBarFill,
                      {
                        width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%`,
                        backgroundColor:
                          totalSpent >= totalBudget
                            ? colors.expenseRed
                            : colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          )}

          <Text style={styles.sectionLabel}>YOUR CATEGORIES</Text>

          <View
            style={[
              styles.listCard,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            {rows.map((row, i) => {
              const spent = spendByName[row.name.toLowerCase()] ?? 0;
              return (
                <CategoryListRow
                  key={row.id}
                  row={row}
                  spent={spent}
                  isLast={i === rows.length - 1}
                  styles={styles}
                  colors={colors}
                  onPress={() => setEditing(row)}
                />
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => {
              if (!isPro) {
                navigation.navigate('ProUpgrade', { source: 'add_category' });
                return;
              }
              setAdding(true);
            }}
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
              Add category
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Edit modal */}
      <CategoryFormModal
        visible={editing !== null}
        mode="edit"
        initial={editing}
        styles={styles}
        colors={colors}
        isDark={isDark}
        isPro={isPro}
        canDelete={editing !== null}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (editing) return handleSaveEdit(editing.id, draft);
        }}
        onDelete={() => editing && handleDelete(editing)}
      />

      {/* Add modal */}
      <CategoryFormModal
        visible={adding}
        mode="add"
        initial={null}
        styles={styles}
        colors={colors}
        isDark={isDark}
        isPro={isPro}
        canDelete={false}
        onClose={() => setAdding(false)}
        onSave={handleAdd}
        onDelete={() => {}}
      />
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CategoryListRow({
  row,
  spent,
  isLast,
  styles,
  colors,
  onPress,
}: {
  row: CategoryRow;
  spent: number;
  isLast: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const limit = row.budget_limit;
  const pct = limit && limit > 0 ? Math.min(1, spent / limit) : 0;
  const overBudget = limit != null && spent >= limit;
  const nearing = limit != null && !overBudget && pct >= 0.7;
  const barColor = overBudget
    ? colors.expenseRed
    : nearing
      ? colors.statWarnBar
      : row.text_colour;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.row, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
    >
      <CategoryIcon
        categoryKey={row.emoji.toLowerCase()}
        color={row.text_colour}
        size={18}
        wrapperSize={36}
      />
      <View style={styles.rowMeta}>
        <View style={styles.rowTopLine}>
          <Text
            style={[styles.rowName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {row.name}
          </Text>
          <Text
            style={[
              styles.rowAmount,
              {
                color: overBudget ? colors.expenseRed : colors.textPrimary,
              },
            ]}
            numberOfLines={1}
          >
            ₱{spent.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            {limit != null && (
              <Text
                style={[styles.rowAmountSub, { color: colors.textSecondary }]}
              >
                {' '}
                / ₱{limit.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
              </Text>
            )}
          </Text>
        </View>
        {limit != null ? (
          <View
            style={[
              styles.rowBarTrack,
              {
                backgroundColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.rowBarFill,
                {
                  width: `${pct * 100}%`,
                  backgroundColor: barColor,
                },
              ]}
            />
          </View>
        ) : (
          <Text
            style={[styles.rowSub, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            No monthly limit
          </Text>
        )}
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

function CategoryFormModal({
  visible,
  mode,
  initial,
  styles,
  colors,
  isDark,
  isPro,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  mode: 'add' | 'edit';
  initial: CategoryRow | null;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  isDark: boolean;
  isPro: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (draft: DraftState) => void | Promise<void>;
  onDelete: () => void;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [draft, setDraft] = useState<DraftState>({
    name: '',
    iconKey: ICON_LIBRARY[0].key,
    colorIdx: 0,
    budgetLimit: '',
  });
  const [saving, setSaving] = useState(false);

  // Reset draft whenever the modal opens.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    const key = initial ? `edit:${initial.id}` : 'add';
    if (openedFor.current === key) return;
    openedFor.current = key;
    if (initial) {
      setDraft({
        name: initial.name,
        iconKey: initial.emoji,
        colorIdx: findColorIdx(initial.text_colour),
        budgetLimit:
          initial.budget_limit != null ? String(initial.budget_limit) : '',
      });
    } else {
      setDraft({
        name: '',
        iconKey: ICON_LIBRARY[0].key,
        colorIdx: 0,
        budgetLimit: '',
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

  const swatch = CATEGORY_SWATCHES[draft.colorIdx];

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
          { backgroundColor: isDark ? colors.background : '#F7F5F2' },
        ]}
      >
        <View style={styles.formTopBar}>
          <View style={styles.formHandle} />
        </View>
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
              {mode === 'add' ? 'New category' : 'Edit category'}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {mode === 'add'
                ? 'Set a name, icon, and monthly budget'
                : 'Update name, icon, color, or budget'}
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
            <CategoryIcon
              categoryKey={draft.iconKey}
              color={swatch}
              size={28}
              wrapperSize={64}
            />
            <Text style={[styles.previewName, { color: colors.textPrimary }]}>
              {draft.name.trim() || 'Category name'}
            </Text>
            {draft.budgetLimit ? (
              <Text
                style={[styles.previewSub, { color: colors.textSecondary }]}
              >
                ₱
                {parseFloat(draft.budgetLimit || '0').toLocaleString('en-PH', {
                  maximumFractionDigits: 0,
                })}{' '}
                / month
              </Text>
            ) : (
              <Text
                style={[styles.previewSub, { color: colors.textSecondary }]}
              >
                No monthly limit
              </Text>
            )}
          </View>

          {/* Name */}
          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="e.g. Coffee, Pets"
            placeholderTextColor={colors.textSecondary}
            maxLength={50}
            editable={!(mode === 'edit' && initial?.is_default)}
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
              },
              mode === 'edit' && initial?.is_default && { opacity: 0.5 },
            ]}
          />
          {mode === 'edit' && initial?.is_default && (
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              Default category names are fixed so auto-categorization stays
              accurate.
            </Text>
          )}

          {/* Icon picker — horizontal scroll keeps the row compact and
              scales gracefully as more icons are added to ICON_LIBRARY. */}
          <Text style={styles.fieldLabel}>
            ICON
            {!isPro && <Text style={styles.proLockLabel}>{' · Pro'}</Text>}
          </Text>
          <View style={{ position: 'relative' }}>
            <View
              style={[
                styles.pickerCard,
                !isPro && { opacity: 0.45 },
                {
                  backgroundColor: isDark
                    ? colors.surfaceSubdued
                    : colors.white,
                  borderColor: colors.border,
                },
              ]}
              pointerEvents={isPro ? 'auto' : 'none'}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerScrollContent}
              >
                {ICON_LIBRARY.map((entry) => {
                  const active = draft.iconKey === entry.key;
                  return (
                    <TouchableOpacity
                      key={entry.key}
                      activeOpacity={0.75}
                      onPress={() =>
                        setDraft((d) => ({ ...d, iconKey: entry.key }))
                      }
                      style={[
                        styles.iconCell,
                        {
                          backgroundColor: active
                            ? swatch
                            : isDark
                              ? colors.background
                              : '#F4F4F8',
                        },
                      ]}
                    >
                      <CategoryIcon
                        categoryKey={entry.key}
                        color={active ? '#FFFFFF' : colors.textSecondary}
                        size={20}
                        wrapperSize={36}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            {!isPro && (
              <TouchableOpacity
                style={styles.pickerLockOverlay}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('ProUpgrade', { source: 'icon_picker' })
                }
              >
                <Ionicons
                  name="lock-closed"
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Colour picker — horizontal scroll mirrors the icon row. */}
          <Text style={styles.fieldLabel}>
            COLOR
            {!isPro && <Text style={styles.proLockLabel}>{' · Pro'}</Text>}
          </Text>
          <View style={{ position: 'relative' }}>
            <View
              style={[
                styles.pickerCard,
                !isPro && { opacity: 0.45 },
                {
                  backgroundColor: isDark
                    ? colors.surfaceSubdued
                    : colors.white,
                  borderColor: colors.border,
                },
              ]}
              pointerEvents={isPro ? 'auto' : 'none'}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerScrollContent}
              >
                {CATEGORY_SWATCHES.map((c, i) => {
                  const active = draft.colorIdx === i;
                  return (
                    <TouchableOpacity
                      key={c}
                      activeOpacity={0.75}
                      onPress={() => setDraft((d) => ({ ...d, colorIdx: i }))}
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
            {!isPro && (
              <TouchableOpacity
                style={styles.pickerLockOverlay}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('ProUpgrade', { source: 'color_picker' })
                }
              >
                <Ionicons
                  name="lock-closed"
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Budget */}
          <Text style={styles.fieldLabel}>MONTHLY BUDGET</Text>
          <View
            style={[
              styles.pesoRow,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
              },
            ]}
          >
            <Text style={styles.pesoSign}>₱</Text>
            <TextInput
              value={draft.budgetLimit}
              onChangeText={(v) =>
                setDraft((d) => ({
                  ...d,
                  budgetLimit: v.replace(/[^0-9.]/g, ''),
                }))
              }
              placeholder="No limit"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              style={styles.pesoInput}
            />
          </View>

          {/* Save */}
          <TouchableOpacity
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={saving}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === 'add' ? 'Add category' : 'Save changes'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Delete (edit mode, custom-only) */}
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
                Delete category
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

    // ── Header (matches BillSplitterScreen) ──
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

    // ── Form modal handle (subtle, top of pageSheet) ──
    formTopBar: {
      paddingTop: 12,
      paddingBottom: 8,
      alignItems: 'center',
    },
    formHandle: {
      width: 36,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
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

    // ── Summary card (mirrors HomeScreen onTrack info box) ──
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
      fontSize: 18,
      color: colors.onTrackTitle,
      marginBottom: 4,
    },
    summaryHeadlineSub: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 13,
      color: colors.onTrackSub,
    },
    summarySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.onTrackSub,
      lineHeight: 18,
      marginBottom: 10,
    },
    summaryBarTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(45,106,79,0.12)',
    },
    summaryBarFill: {
      height: '100%',
      borderRadius: 3,
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
    rowMeta: { flex: 1, minWidth: 0, gap: 6 },
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
    rowAmountSub: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 11,
    },
    rowSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
    },
    rowBarTrack: {
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
    },
    rowBarFill: {
      height: '100%',
      borderRadius: 2,
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

    // ── Form modal ─────────────────────────────────────────────────────────
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
    previewName: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 17,
      marginTop: 6,
    },
    previewSub: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 12,
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
    iconCell: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
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
    fieldHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      marginTop: 6,
      lineHeight: 16,
    },
    proLockLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      letterSpacing: 0,
    },
    pickerLockOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
