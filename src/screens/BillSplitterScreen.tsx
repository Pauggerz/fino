import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../services/supabase';
import { useTheme } from '../contexts/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignees: { [personId: string]: number }; // personId → qty they're taking
}

interface Person {
  id: string;
  name: string;
  color: string;
}

type Phase = 'idle' | 'parsing' | 'assigning';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSON_COLORS = [
  '#E07A5F',
  '#3A7BD5',
  '#7B5EA7',
  '#5B8C6E',
  '#B87A20',
  '#C96B8A',
  '#2A9D8F',
  '#E9C46A',
];

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BillSplitterScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);

  const [newName, setNewName] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    quantity: '',
    price: '',
  });

  const startEdit = useCallback((item: ReceiptItem) => {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      quantity: item.quantity.toString(),
      price: item.price.toString(),
    });
  }, []);

  const confirmEdit = useCallback(() => {
    if (!editingId) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== editingId) return item;
        const qty = Math.max(1, parseInt(editDraft.quantity) || 1);
        const price = parseFloat(editDraft.price) || item.price;
        const name = editDraft.name.trim() || item.name;
        // clamp existing assignee qtys to new quantity
        const assignees: { [id: string]: number } = {};
        Object.entries(item.assignees).forEach(([pid, q]) => {
          assignees[pid] = Math.min(q, qty);
        });
        return { ...item, name, quantity: qty, price, assignees };
      })
    );
    setEditingId(null);
  }, [editingId, editDraft]);

  // ── Image pick ──────────────────────────────────────────────────────────────
  const pickImage = async (fromCamera: boolean) => {
    const { status } = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        fromCamera
          ? 'Camera access is needed to take a photo.'
          : 'Photo library access is needed to pick an image.'
      );
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.5,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          quality: 0.5,
        });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      parseReceipt(result.assets[0].uri);
    }
  };

  // ── Parse receipt ────────────────────────────────────────────────────────────
  const parseReceipt = async (uri: string) => {
    setPhase('parsing');
    setItems([]);
    setPeople([]);
    setMerchant(null);
    setReceiptTotal(null);

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      const { data, error } = await supabase.functions.invoke('split-receipt', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });
      if (error) {
        // Try to extract a more descriptive error from the function response body
        let detail = error.message;
        try {
          const ctx = (error as any).context;
          if (ctx?.json) {
            const body = await ctx.json();
            if (body?.error)
              detail = body.error + (body.details ? `: ${body.details}` : '');
          } else if (typeof ctx?.text === 'function') {
            detail = await ctx.text();
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const parsed = data as {
        merchant?: string | null;
        items?: {
          name: string;
          price: number;
          unit_price?: number;
          quantity?: number;
        }[];
        total?: number | null;
      };

      if (!parsed.items || parsed.items.length === 0) {
        Alert.alert(
          'No items found',
          'Could not detect individual items on this receipt. Try a clearer photo.'
        );
        setPhase('idle');
        return;
      }

      setMerchant(parsed.merchant ?? null);
      setReceiptTotal(parsed.total ?? null);
      setItems(
        parsed.items.map((item, i) => {
          const qty = item.quantity ?? 1;
          // Normalise: price should always be the total for the line
          const total =
            item.price ?? (item.unit_price ? item.unit_price * qty : 0);
          return {
            id: `item-${i}`,
            name: item.name,
            price: total,
            quantity: qty,
            assignees: {},
          };
        })
      );
      setPhase('assigning');
    } catch (err: any) {
      Alert.alert(
        'Parse failed',
        err.message ?? 'Something went wrong. Please try again.'
      );
      setPhase('idle');
    }
  };

  // ── People management ────────────────────────────────────────────────────────
  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    if (people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Duplicate', `${name} is already in the list.`);
      return;
    }
    const color = PERSON_COLORS[people.length % PERSON_COLORS.length];
    setPeople((prev) => [...prev, { id: `person-${Date.now()}`, name, color }]);
    setNewName('');
    nameInputRef.current?.focus();
  };

  const removePerson = (id: string) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setItems((prev) =>
      prev.map((item) => {
        const { [id]: _, ...rest } = item.assignees;
        return { ...item, assignees: rest };
      })
    );
  };

  // ── Item assignment ──────────────────────────────────────────────────────────
  const cycleAssignee = useCallback((itemId: string, personId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const current = item.assignees[personId] ?? 0;
        const next = current >= item.quantity ? 0 : current + 1;
        return {
          ...item,
          assignees: { ...item.assignees, [personId]: next },
        };
      })
    );
  }, []);

  // ── Summary calc ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totals: Record<string, number> = {};
    people.forEach((p) => {
      totals[p.id] = 0;
    });
    items.forEach((item) => {
      const unitPrice = item.price / item.quantity;
      Object.entries(item.assignees).forEach(([personId, qty]) => {
        if (qty > 0)
          totals[personId] = (totals[personId] ?? 0) + unitPrice * qty;
      });
    });
    return totals;
  }, [items, people]);

  const unassignedTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const assignedQty = Object.values(item.assignees).reduce(
          (s, q) => s + q,
          0
        );
        const unassignedQty = Math.max(0, item.quantity - assignedQty);
        return sum + (item.price / item.quantity) * unassignedQty;
      }, 0),
    [items]
  );

  const totalAssigned = useMemo(
    () => Object.values(summary).reduce((s, v) => s + v, 0),
    [summary]
  );

  // ── Reset ────────────────────────────────────────────────────────────────────
  const reset = () => {
    setPhase('idle');
    setImageUri(null);
    setItems([]);
    setPeople([]);
    setMerchant(null);
    setReceiptTotal(null);
    setNewName('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bill Splitter</Text>
          {merchant && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {merchant}
            </Text>
          )}
        </View>
        {phase === 'assigning' && (
          <TouchableOpacity
            onPress={reset}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <View style={styles.idleContainer}>
          <View
            style={[
              styles.idleIllustration,
              {
                backgroundColor: isDark
                  ? colors.surfaceSubdued
                  : colors.primaryLight,
              },
            ]}
          >
            <Ionicons name="receipt-outline" size={56} color={colors.primary} />
          </View>
          <Text style={styles.idleTitle}>Split a bill</Text>
          <Text style={styles.idleSub}>
            Take or upload a photo of a receipt.{'\n'}We&apos;ll extract the
            items for you.
          </Text>

          {imageUri && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#10B981' }]}
              onPress={() => parseReceipt(imageUri)}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Retry Last Photo</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => pickImage(false)}
            activeOpacity={0.85}
          >
            <Ionicons name="image-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Upload Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.white },
            ]}
            onPress={() => pickImage(true)}
            activeOpacity={0.85}
          >
            <Ionicons
              name="camera-outline"
              size={20}
              color={colors.textPrimary}
            />
            <Text
              style={[styles.secondaryBtnText, { color: colors.textPrimary }]}
            >
              Take Photo
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PARSING ── */}
      {phase === 'parsing' && (
        <View style={styles.parsingContainer}>
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.receiptPreview}
              contentFit="cover"
              transition={150}
            />
          )}
          <View
            style={[
              styles.parsingOverlay,
              {
                backgroundColor: isDark
                  ? 'rgba(0,0,0,0.7)'
                  : 'rgba(255,255,255,0.85)',
              },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.parsingText, { color: colors.textPrimary }]}>
              Reading receipt…
            </Text>
            <Text
              style={[styles.parsingSubText, { color: colors.textSecondary }]}
            >
              Extracting line items with AI
            </Text>
          </View>
        </View>
      )}

      {/* ── ASSIGNING ── */}
      {phase === 'assigning' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[
              styles.assignScroll,
              { paddingBottom: insets.bottom + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── People bar ── */}
            <View
              style={[
                styles.peopleCard,
                { backgroundColor: colors.white, borderColor: colors.border },
              ]}
            >
              <Text style={styles.sectionLabel}>PEOPLE</Text>
              <View style={styles.addPersonRow}>
                <TextInput
                  ref={nameInputRef}
                  style={[
                    styles.nameInput,
                    {
                      backgroundColor: isDark
                        ? colors.surfaceSubdued
                        : '#F4F4F8',
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="Add a name…"
                  placeholderTextColor={colors.textSecondary}
                  value={newName}
                  onChangeText={setNewName}
                  onSubmitEditing={addPerson}
                  returnKeyType="done"
                  autoCapitalize="words"
                />
                <TouchableOpacity
                  onPress={addPerson}
                  activeOpacity={0.8}
                  style={[
                    styles.addPersonBtn,
                    {
                      backgroundColor: newName.trim()
                        ? colors.primary
                        : colors.border,
                    },
                  ]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              {people.length > 0 && (
                <View style={styles.peopleChipsRow}>
                  {people.map((person) => (
                    <View
                      key={person.id}
                      style={[
                        styles.personChip,
                        {
                          backgroundColor: `${person.color}22`,
                          borderColor: `${person.color}55`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.personDot,
                          { backgroundColor: person.color },
                        ]}
                      >
                        <Text style={styles.personDotText}>
                          {person.name[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={[styles.personChipName, { color: person.color }]}
                      >
                        {person.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removePerson(person.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={15}
                          color={person.color}
                          style={{ opacity: 0.7 }}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {people.length === 0 && (
                <Text
                  style={[styles.peopleHint, { color: colors.textSecondary }]}
                >
                  Add people above, then tap their initials on each item.
                </Text>
              )}
            </View>

            {/* ── Items ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ITEMS</Text>
              <Text
                style={[styles.sectionCount, { color: colors.textSecondary }]}
              >
                {items.length} items
              </Text>
            </View>
            <View
              style={[
                styles.itemsCard,
                { backgroundColor: colors.white, borderColor: colors.border },
              ]}
            >
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  people={people}
                  isLast={idx === items.length - 1}
                  onCycle={cycleAssignee}
                  isEditing={editingId === item.id}
                  editDraft={editDraft}
                  onEditDraftChange={setEditDraft}
                  onEditStart={startEdit}
                  onEditConfirm={confirmEdit}
                  colors={colors}
                  isDark={isDark}
                  styles={styles}
                />
              ))}
            </View>

            {/* ── Summary ── */}
            {people.length > 0 && (
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.white, borderColor: colors.border },
                ]}
              >
                <Text style={styles.sectionLabel}>SPLIT SUMMARY</Text>

                {/* Per-person rows */}
                {people.map((person) => (
                  <View
                    key={person.id}
                    style={[
                      styles.summaryRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.summaryAvatar,
                        { backgroundColor: person.color },
                      ]}
                    >
                      <Text style={styles.summaryAvatarText}>
                        {person.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.summaryName,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {person.name}
                    </Text>
                    <Text
                      style={[
                        styles.summaryAmount,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {fmt(summary[person.id] ?? 0)}
                    </Text>
                  </View>
                ))}

                {/* Totals block */}
                <View
                  style={[
                    styles.totalsBlock,
                    {
                      borderTopColor: colors.border,
                      backgroundColor: isDark
                        ? colors.surfaceSubdued
                        : '#F8F8FA',
                    },
                  ]}
                >
                  {/* Total assigned */}
                  <View style={styles.totalsRow}>
                    <Text
                      style={[
                        styles.totalsLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Total Assigned
                    </Text>
                    <Text
                      style={[
                        styles.totalsValue,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {fmt(totalAssigned)}
                    </Text>
                  </View>

                  {/* Unassigned */}
                  {unassignedTotal > 0.005 && (
                    <View style={styles.totalsRow}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <View
                          style={[
                            styles.unassignedDot,
                            { backgroundColor: colors.border },
                          ]}
                        />
                        <Text
                          style={[
                            styles.totalsLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Unassigned
                        </Text>
                      </View>
                      <Text style={[styles.totalsValue, { color: '#E07A5F' }]}>
                        {fmt(unassignedTotal)}
                      </Text>
                    </View>
                  )}

                  {/* Divider + Receipt total */}
                  {receiptTotal != null && (
                    <>
                      <View
                        style={[
                          styles.totalsDivider,
                          { backgroundColor: colors.border },
                        ]}
                      />
                      <View style={styles.totalsRow}>
                        <Text
                          style={[
                            styles.receiptTotalLabel,
                            { color: colors.textPrimary },
                          ]}
                        >
                          Receipt Total
                        </Text>
                        <Text
                          style={[
                            styles.receiptTotalValue,
                            { color: colors.primary },
                          ]}
                        >
                          {fmt(receiptTotal)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: ReceiptItem;
  people: Person[];
  isLast: boolean;
  onCycle: (itemId: string, personId: string) => void;
  isEditing: boolean;
  editDraft: { name: string; quantity: string; price: string };
  onEditDraftChange: (d: {
    name: string;
    quantity: string;
    price: string;
  }) => void;
  onEditStart: (item: ReceiptItem) => void;
  onEditConfirm: () => void;
  colors: any;
  isDark: boolean;
  styles: any;
}

function ItemRow({
  item,
  people,
  isLast,
  onCycle,
  isEditing,
  editDraft,
  onEditDraftChange,
  onEditStart,
  onEditConfirm,
  colors,
  isDark,
  styles,
}: ItemRowProps) {
  const unitPrice = item.price / item.quantity;
  const assignedQty = Object.values(item.assignees).reduce((s, q) => s + q, 0);
  const isMulti = item.quantity > 1;
  const inputBg = isDark ? colors.surfaceSubdued : '#F4F4F8';

  if (isEditing) {
    return (
      <View
        style={[
          styles.itemRow,
          { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.07)',
          },
        ]}
      >
        {/* Name input */}
        <TextInput
          style={[
            styles.editInput,
            { backgroundColor: inputBg, color: colors.textPrimary },
          ]}
          value={editDraft.name}
          onChangeText={(t) => onEditDraftChange({ ...editDraft, name: t })}
          placeholder="Item name"
          placeholderTextColor={colors.textSecondary}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Quantity input */}
          <View style={{ flex: 1 }}>
            <Text style={[styles.editLabel, { color: colors.textSecondary }]}>
              QTY
            </Text>
            <TextInput
              style={[
                styles.editInput,
                { backgroundColor: inputBg, color: colors.textPrimary },
              ]}
              value={editDraft.quantity}
              onChangeText={(t) =>
                onEditDraftChange({
                  ...editDraft,
                  quantity: t.replace(/[^0-9]/g, ''),
                })
              }
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {/* Price input */}
          <View style={{ flex: 2 }}>
            <Text style={[styles.editLabel, { color: colors.textSecondary }]}>
              TOTAL PRICE (₱)
            </Text>
            <TextInput
              style={[
                styles.editInput,
                { backgroundColor: inputBg, color: colors.textPrimary },
              ]}
              value={editDraft.price}
              onChangeText={(t) =>
                onEditDraftChange({
                  ...editDraft,
                  price: t.replace(/[^0-9.]/g, ''),
                })
              }
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {/* Confirm */}
          <TouchableOpacity
            onPress={onEditConfirm}
            activeOpacity={0.8}
            style={[styles.editConfirmBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.itemRow,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.07)',
        },
      ]}
    >
      {/* Left: name + price */}
      <View style={styles.itemLeft}>
        {/* Name row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
          }}
        >
          <Text
            style={[styles.itemName, { color: colors.textPrimary, flex: 1 }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <TouchableOpacity
            onPress={() => onEditStart(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="pencil-outline"
              size={13}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
        {/* Price row */}
        <View style={styles.itemPriceMeta}>
          {isMulti ? (
            <>
              <Text
                style={[
                  styles.itemQtyBadge,
                  {
                    backgroundColor: isDark
                      ? colors.surfaceSubdued
                      : `${colors.primaryLight}88`,
                    color: colors.primary,
                  },
                ]}
              >
                {item.quantity}×
              </Text>
              <Text
                style={[styles.itemUnitPrice, { color: colors.textSecondary }]}
              >
                {' '}
                {fmt(unitPrice)} each
              </Text>
              <Text style={[styles.itemPriceDot, { color: colors.border }]}>
                {' '}
                ·{' '}
              </Text>
              <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
                {fmt(item.price)}
              </Text>
              {assignedQty > 0 && assignedQty < item.quantity && (
                <Text style={[styles.itemLeftBadge, { color: '#E07A5F' }]}>
                  {' '}
                  {item.quantity - assignedQty} left
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
              {fmt(item.price)}
            </Text>
          )}
        </View>
      </View>

      {/* Right: person toggles */}
      <View style={styles.itemAssignees}>
        {people.length === 0 ? (
          <Text style={[styles.itemNopeople, { color: colors.textSecondary }]}>
            Add people first
          </Text>
        ) : (
          people.map((person) => {
            const qty = item.assignees[person.id] ?? 0;
            const assigned = qty > 0;
            return (
              <TouchableOpacity
                key={person.id}
                onPress={() => onCycle(item.id, person.id)}
                activeOpacity={0.7}
                style={[
                  styles.assigneeBtn,
                  assigned
                    ? { backgroundColor: person.color }
                    : {
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderColor: `${person.color}80`,
                      },
                ]}
              >
                <Text
                  style={[
                    styles.assigneeBtnText,
                    { color: assigned ? '#fff' : person.color },
                  ]}
                >
                  {isMulti && assigned
                    ? qty.toString()
                    : person.name[0].toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
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

    // Idle
    idleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    idleIllustration: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    idleTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 26,
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: 'center',
    },
    idleSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 36,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 28,
      borderRadius: 14,
      width: '100%',
      justifyContent: 'center',
      marginBottom: 10,
    },
    primaryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: '#fff',
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 14,
      width: '100%',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    secondaryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
    },

    // Parsing
    parsingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptPreview: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.35,
    },
    parsingOverlay: {
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 40,
      paddingVertical: 32,
      borderRadius: 20,
    },
    parsingText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
    },
    parsingSubText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
    },

    // Assigning
    assignScroll: {
      paddingTop: 8,
      paddingHorizontal: 16,
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      letterSpacing: 0.7,
      marginBottom: 10,
    },
    sectionCount: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      marginBottom: 10,
    },

    // People card
    peopleCard: {
      borderRadius: 16,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
    },
    addPersonRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    nameInput: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
    addPersonBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    peopleChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    personChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    personDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personDotText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 10,
      color: '#fff',
    },
    personChipName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    peopleHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    // Items card
    itemsCard: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 4,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    itemLeft: { flex: 1, minWidth: 0 },
    itemName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13.5,
      lineHeight: 18,
    },
    itemPriceMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    itemQtyBadge: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 11,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      overflow: 'hidden',
    },
    itemUnitPrice: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
    },
    itemPriceDot: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
    },
    itemPrice: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 13,
    },
    itemLeftBadge: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
    },
    itemAssignees: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'flex-end',
      maxWidth: 140,
    },
    itemNopeople: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      textAlign: 'right',
    },
    assigneeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assigneeBtnText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 12,
    },

    // Edit mode
    editInput: {
      height: 38,
      borderRadius: 10,
      paddingHorizontal: 10,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
    },
    editLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    editConfirmBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-end',
    },

    // Summary
    summaryCard: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: 4,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    summaryAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    summaryAvatarText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 14,
      color: '#fff',
    },
    summaryName: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      flex: 1,
    },
    summaryAmount: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 15,
    },

    // Totals block
    totalsBlock: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    totalsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalsLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
    },
    totalsValue: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 13,
    },
    unassignedDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    totalsDivider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 4,
    },
    receiptTotalLabel: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 15,
    },
    receiptTotalValue: {
      fontFamily: 'DMMono_400Regular',
      fontSize: 17,
    },
  });
