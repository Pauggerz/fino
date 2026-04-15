import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../services/supabase';
import { useTheme } from '../contexts/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignees: string[]; // person IDs
}

interface Person {
  id: string;
  name: string;
  color: string;
}

type Phase = 'idle' | 'parsing' | 'assigning';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSON_COLORS = [
  '#E07A5F', '#3A7BD5', '#7B5EA7',
  '#5B8C6E', '#B87A20', '#C96B8A',
  '#2A9D8F', '#E9C46A',
];

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BillSplitterScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [phase, setPhase]       = useState<Phase>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [items, setItems]       = useState<ReceiptItem[]>([]);
  const [people, setPeople]     = useState<Person[]>([]);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);

  const [newName, setNewName]   = useState('');
  const nameInputRef            = useRef<TextInput>(null);

  // ── Image pick ──────────────────────────────────────────────────────────────
  const pickImage = async (fromCamera: boolean) => {
    const { status } = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission required', fromCamera
        ? 'Camera access is needed to take a photo.'
        : 'Photo library access is needed to pick an image.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, quality: 0.8 });

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
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const { data, error } = await supabase.functions.invoke('split-receipt', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });
      if (error) throw new Error(error.message);

      const parsed = data as {
        merchant?: string | null;
        items?: { name: string; price: number; quantity?: number }[];
        total?: number | null;
      };

      if (!parsed.items || parsed.items.length === 0) {
        Alert.alert('No items found', 'Could not detect individual items on this receipt. Try a clearer photo.');
        setPhase('idle');
        return;
      }

      setMerchant(parsed.merchant ?? null);
      setReceiptTotal(parsed.total ?? null);
      setItems(parsed.items.map((item, i) => ({
        id: `item-${i}`,
        name: item.name,
        price: item.price,
        quantity: item.quantity ?? 1,
        assignees: [],
      })));
      setPhase('assigning');
    } catch (err: any) {
      Alert.alert('Parse failed', err.message ?? 'Something went wrong. Please try again.');
      setPhase('idle');
    }
  };

  // ── People management ────────────────────────────────────────────────────────
  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    if (people.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Duplicate', `${name} is already in the list.`);
      return;
    }
    const color = PERSON_COLORS[people.length % PERSON_COLORS.length];
    setPeople(prev => [...prev, { id: `person-${Date.now()}`, name, color }]);
    setNewName('');
    nameInputRef.current?.focus();
  };

  const removePerson = (id: string) => {
    setPeople(prev => prev.filter(p => p.id !== id));
    // unassign this person from all items
    setItems(prev => prev.map(item => ({
      ...item,
      assignees: item.assignees.filter(a => a !== id),
    })));
  };

  // ── Item assignment ──────────────────────────────────────────────────────────
  const toggleAssignee = useCallback((itemId: string, personId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const has = item.assignees.includes(personId);
      return {
        ...item,
        assignees: has
          ? item.assignees.filter(id => id !== personId)
          : [...item.assignees, personId],
      };
    }));
  }, []);

  // ── Summary calc ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totals: Record<string, number> = {};
    people.forEach(p => { totals[p.id] = 0; });
    items.forEach(item => {
      if (item.assignees.length === 0) return;
      const share = item.price / item.assignees.length;
      item.assignees.forEach(id => { totals[id] = (totals[id] ?? 0) + share; });
    });
    return totals;
  }, [items, people]);

  const unassignedTotal = useMemo(() =>
    items.reduce((sum, item) => item.assignees.length === 0 ? sum + item.price : sum, 0),
  [items]);

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bill Splitter</Text>
          {merchant && <Text style={styles.headerSub} numberOfLines={1}>{merchant}</Text>}
        </View>
        {phase === 'assigning' && (
          <TouchableOpacity onPress={reset} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <View style={styles.idleContainer}>
          <View style={[styles.idleIllustration, { backgroundColor: isDark ? colors.surfaceSubdued : colors.primaryLight }]}>
            <Ionicons name="receipt-outline" size={56} color={colors.primary} />
          </View>
          <Text style={styles.idleTitle}>Split a bill</Text>
          <Text style={styles.idleSub}>Take or upload a photo of a receipt.{'\n'}We'll extract the items for you.</Text>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => pickImage(false)} activeOpacity={0.85}>
            <Ionicons name="image-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Upload Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.white }]} onPress={() => pickImage(true)} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Take Photo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PARSING ── */}
      {phase === 'parsing' && (
        <View style={styles.parsingContainer}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.receiptPreview} resizeMode="cover" />
          )}
          <View style={[styles.parsingOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.parsingText, { color: colors.textPrimary }]}>Reading receipt…</Text>
            <Text style={[styles.parsingSubText, { color: colors.textSecondary }]}>Extracting line items with AI</Text>
          </View>
        </View>
      )}

      {/* ── ASSIGNING ── */}
      {phase === 'assigning' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.assignScroll, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── People bar ── */}
            <View style={[styles.peopleCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
              <Text style={styles.sectionLabel}>PEOPLE</Text>
              <View style={styles.addPersonRow}>
                <TextInput
                  ref={nameInputRef}
                  style={[styles.nameInput, { backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8', color: colors.textPrimary }]}
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
                  style={[styles.addPersonBtn, { backgroundColor: newName.trim() ? colors.primary : colors.border }]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              {people.length > 0 && (
                <View style={styles.peopleChipsRow}>
                  {people.map(person => (
                    <View key={person.id} style={[styles.personChip, { backgroundColor: person.color + '22', borderColor: person.color + '55' }]}>
                      <View style={[styles.personDot, { backgroundColor: person.color }]}>
                        <Text style={styles.personDotText}>{person.name[0].toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.personChipName, { color: person.color }]}>{person.name}</Text>
                      <TouchableOpacity onPress={() => removePerson(person.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={15} color={person.color} style={{ opacity: 0.7 }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {people.length === 0 && (
                <Text style={[styles.peopleHint, { color: colors.textSecondary }]}>Add people above, then tap their initials on each item.</Text>
              )}
            </View>

            {/* ── Items ── */}
            <Text style={[styles.sectionLabel, { marginHorizontal: 20, marginBottom: 8 }]}>ITEMS</Text>
            <View style={[styles.itemsCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  people={people}
                  isLast={idx === items.length - 1}
                  onToggle={toggleAssignee}
                  colors={colors}
                  isDark={isDark}
                  styles={styles}
                />
              ))}
            </View>

            {/* ── Summary ── */}
            {people.length > 0 && (
              <View style={[styles.summaryCard, { backgroundColor: colors.white, borderColor: colors.border }]}>
                <Text style={styles.sectionLabel}>SPLIT SUMMARY</Text>

                {people.map(person => (
                  <View key={person.id} style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.summaryAvatar, { backgroundColor: person.color }]}>
                      <Text style={styles.summaryAvatarText}>{person.name[0].toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.summaryName, { color: colors.textPrimary }]}>{person.name}</Text>
                    <Text style={[styles.summaryAmount, { color: colors.textPrimary }]}>
                      {fmt(summary[person.id] ?? 0)}
                    </Text>
                  </View>
                ))}

                {unassignedTotal > 0 && (
                  <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                    <View style={[styles.summaryAvatar, { backgroundColor: colors.border }]}>
                      <Ionicons name="help" size={13} color={colors.textSecondary} />
                    </View>
                    <Text style={[styles.summaryName, { color: colors.textSecondary }]}>Unassigned</Text>
                    <Text style={[styles.summaryAmount, { color: colors.textSecondary }]}>{fmt(unassignedTotal)}</Text>
                  </View>
                )}

                {receiptTotal != null && (
                  <View style={[styles.totalRow, { borderTopColor: colors.border, backgroundColor: isDark ? colors.surfaceSubdued : '#F8F8FA' }]}>
                    <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Receipt Total</Text>
                    <Text style={[styles.totalAmount, { color: colors.textPrimary }]}>{fmt(receiptTotal)}</Text>
                  </View>
                )}
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
  onToggle: (itemId: string, personId: string) => void;
  colors: any;
  isDark: boolean;
  styles: any;
}

function ItemRow({ item, people, isLast, onToggle, colors, isDark, styles }: ItemRowProps) {
  return (
    <View style={[styles.itemRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.07)' }]}>
      {/* Left: name + price */}
      <View style={styles.itemLeft}>
        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={2}>{item.name}</Text>
        <View style={styles.itemPriceMeta}>
          {item.quantity > 1 && (
            <Text style={[styles.itemQty, { color: colors.textSecondary }]}>{item.quantity}×  </Text>
          )}
          <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>{fmt(item.price)}</Text>
          {item.assignees.length > 1 && (
            <Text style={[styles.itemShare, { color: colors.primary }]}>
              {' '}· {fmt(item.price / item.assignees.length)} each
            </Text>
          )}
        </View>
      </View>

      {/* Right: person toggles */}
      <View style={styles.itemAssignees}>
        {people.length === 0 ? (
          <Text style={[styles.itemNopeople, { color: colors.textSecondary }]}>Add people first</Text>
        ) : (
          people.map(person => {
            const assigned = item.assignees.includes(person.id);
            return (
              <TouchableOpacity
                key={person.id}
                onPress={() => onToggle(item.id, person.id)}
                activeOpacity={0.7}
                style={[
                  styles.assigneeBtn,
                  assigned
                    ? { backgroundColor: person.color }
                    : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: person.color + '80' },
                ]}
              >
                <Text style={[styles.assigneeBtnText, { color: assigned ? '#fff' : person.color }]}>
                  {person.name[0].toUpperCase()}
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

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
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

  // Idle
  idleContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  idleIllustration: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  idleTitle: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 26,
    color: colors.textPrimary, marginBottom: 10, textAlign: 'center',
  },
  idleSub: {
    fontFamily: 'Inter_400Regular', fontSize: 14,
    color: colors.textSecondary, textAlign: 'center',
    lineHeight: 22, marginBottom: 36,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 15, paddingHorizontal: 28,
    borderRadius: 14, width: '100%', justifyContent: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff',
  },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, width: '100%', justifyContent: 'center',
    borderWidth: 1.5,
  },
  secondaryBtnText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 15,
  },

  // Parsing
  parsingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  receiptPreview: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  parsingOverlay: {
    alignItems: 'center', gap: 12,
    paddingHorizontal: 40, paddingVertical: 32,
    borderRadius: 20,
  },
  parsingText: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 20,
  },
  parsingSubText: {
    fontFamily: 'Inter_400Regular', fontSize: 13,
  },

  // Assigning
  assignScroll: {
    paddingTop: 8, paddingHorizontal: 16, gap: 12,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold', fontSize: 11,
    color: colors.textSecondary, letterSpacing: 0.7,
    marginBottom: 10,
  },

  // People card
  peopleCard: {
    borderRadius: 16, padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addPersonRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  nameInput: {
    flex: 1, height: 42, borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular', fontSize: 14,
  },
  addPersonBtn: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  peopleChipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  personChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  personDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  personDotText: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 10, color: '#fff',
  },
  personChipName: {
    fontFamily: 'Inter_600SemiBold', fontSize: 12,
  },
  peopleHint: {
    fontFamily: 'Inter_400Regular', fontSize: 12,
    lineHeight: 18, marginTop: 4,
  },

  // Items card
  itemsCard: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  itemLeft: { flex: 1, minWidth: 0 },
  itemName: {
    fontFamily: 'Inter_500Medium', fontSize: 13.5,
    lineHeight: 18, marginBottom: 3,
  },
  itemPriceMeta: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
  },
  itemQty: {
    fontFamily: 'Inter_400Regular', fontSize: 12,
  },
  itemPrice: {
    fontFamily: 'DMMono_400Regular', fontSize: 12.5,
  },
  itemShare: {
    fontFamily: 'Inter_400Regular', fontSize: 11,
  },
  itemAssignees: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    justifyContent: 'flex-end', maxWidth: 140,
  },
  itemNopeople: {
    fontFamily: 'Inter_400Regular', fontSize: 11,
    textAlign: 'right',
  },
  assigneeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  assigneeBtnText: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 12,
  },

  // Summary
  summaryCard: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  summaryAvatarText: {
    fontFamily: 'Nunito_800ExtraBold', fontSize: 13, color: '#fff',
  },
  summaryName: {
    fontFamily: 'Inter_500Medium', fontSize: 14, flex: 1,
  },
  summaryAmount: {
    fontFamily: 'DMMono_400Regular', fontSize: 14,
  },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: 13,
  },
  totalAmount: {
    fontFamily: 'DMMono_400Regular', fontSize: 14,
  },
});
