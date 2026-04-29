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
    999,
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
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
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
        Q.sortBy('sort_order', Q.asc),
      );
    const txQ = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('type', 'expense'),
        Q.where('date', Q.gte(start)),
        Q.where('date', Q.lte(end)),
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
      txQ.observeWithColumns(['amount', 'category', 'type', 'is_transfer', 'date']),
    ])
      .pipe(debounceTime(50))
      .subscribe(([catRecords, txRecords]) => {
        // Compute month-to-date spend per category name (lowercased).
        const spend: Record<string, number> = {};
        for (const tx of txRecords) {
          if (tx.isTransfer || (tx.category ?? '').toLowerCase() === 'transfer') continue;
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
    [rows],
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
        (r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase(),
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
    [rows],
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
    [userId, rows, otherNames],
  );

  const handleDelete = useCallback(async (row: CategoryRow) => {
    if (DEFAULT_EXPENSE_KEYS.has(row.emoji.toLowerCase())) {
      Alert.alert(
        'Cannot delete',
        'Default categories can be edited but not deleted.',
      );
      return;
    }
    Alert.alert(
      'Delete category',
      `Remove "${row.name}"? Past transactions tagged with this category keep their tag.`,
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
      ],
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.white }]}>
      {/* Handle + header */}
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.title}>Categories & Budget</Text>
        <TouchableOpacity
          onPress={closeScreen}
          activeOpacity={0.7}
          style={styles.closeBtn}
          hitSlop={12}
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>YOUR CATEGORIES</Text>

          {rows.map((row) => {
            const spent = spendByName[row.name.toLowerCase()] ?? 0;
            return (
              <CategoryListRow
                key={row.id}
                row={row}
                spent={spent}
                styles={styles}
                colors={colors}
                onPress={() => setEditing(row)}
              />
            );
          })}

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
        canDelete={
          editing !== null &&
          !DEFAULT_EXPENSE_KEYS.has(editing.emoji.toLowerCase())
        }
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
  styles,
  colors,
  onPress,
}: {
  row: CategoryRow;
  spent: number;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const limit = row.budget_limit;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.row}
      onPress={onPress}
    >
      <CategoryIcon
        categoryKey={row.emoji.toLowerCase()}
        color={row.text_colour}
        size={18}
        wrapperSize={36}
      />
      <View style={styles.rowMeta}>
        <Text
          style={[styles.rowName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {row.name}
        </Text>
        <Text
          style={[styles.rowSub, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {limit != null
            ? `₱${spent.toLocaleString('en-PH', { maximumFractionDigits: 0 })} of ₱${limit.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
            : `₱${spent.toLocaleString('en-PH', { maximumFractionDigits: 0 })} spent · No limit`}
        </Text>
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
  canDelete: boolean;
  onClose: () => void;
  onSave: (draft: DraftState) => void | Promise<void>;
  onDelete: () => void;
}) {
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
        style={{ flex: 1, backgroundColor: colors.white }}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>
            {mode === 'add' ? 'New category' : 'Edit category'}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={styles.closeBtn}
            hitSlop={12}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Live preview */}
          <View style={styles.previewWrap}>
            <CategoryIcon
              categoryKey={draft.iconKey}
              color={swatch}
              size={28}
              wrapperSize={64}
            />
            <Text style={[styles.previewName, { color: colors.textPrimary }]}>
              {draft.name.trim() || 'Category name'}
            </Text>
          </View>

          {/* Name */}
          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="e.g. Coffee, Pets"
            placeholderTextColor={colors.textSecondary}
            maxLength={50}
            style={styles.input}
          />

          {/* Icon picker */}
          <Text style={styles.fieldLabel}>ICON</Text>
          <View style={styles.iconGrid}>
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
                          ? colors.surfaceSubdued
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
          </View>

          {/* Colour picker */}
          <Text style={styles.fieldLabel}>COLOR</Text>
          <View style={styles.colorRow}>
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
                      borderColor: active ? colors.textPrimary : 'transparent',
                    },
                  ]}
                >
                  {active && (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Budget */}
          <Text style={styles.fieldLabel}>MONTHLY BUDGET</Text>
          <View style={styles.pesoRow}>
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
              <Text
                style={[styles.deleteText, { color: colors.expenseRed }]}
              >
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
    screen: {
      flex: 1,
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      paddingHorizontal: spacing.screenPadding,
    },
    title: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 20,
      color: colors.textPrimary,
    },
    closeBtn: { padding: 8 },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginTop: 4,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
    },
    rowMeta: { flex: 1, minWidth: 0, gap: 2 },
    rowName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    rowSub: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 11.5,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      marginTop: 4,
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
    previewWrap: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 18,
      marginBottom: 8,
    },
    previewName: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 17,
    },
    fieldLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginTop: 16,
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
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    iconCell: {
      width: 56,
      height: 56,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
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
    pesoInput: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
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
