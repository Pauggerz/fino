import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
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
  assignees: { [personId: string]: number };
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

const SCANNING_PHRASES = [
  'Reading receipt items',
  'Detecting prices',
  'Mapping quantities',
  'Identifying line items',
  'Almost done',
];

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function IdleIllustration({ colors, isDark }: { colors: any; isDark: boolean }) {
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, {
      toValue: 1,
      friction: 7,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, []);

  const scale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <Animated.View
      style={{
        width: 130,
        height: 150,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        opacity: enterAnim,
        transform: [{ scale }],
      }}
    >
      {/* Shadow halo */}
      <View
        style={{
          position: 'absolute',
          width: 110,
          height: 110,
          borderRadius: 28,
          backgroundColor: colors.primary,
          opacity: 0.1,
          bottom: 0,
          transform: [{ scaleX: 1.15 }, { scaleY: 0.35 }],
        }}
      />

      {/* Back receipt card */}
      <View
        style={{
          position: 'absolute',
          width: 78,
          height: 108,
          borderRadius: 12,
          backgroundColor: isDark ? colors.surfaceSubdued : '#EBF0EC',
          transform: [{ rotate: '-9deg' }, { translateY: 6 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View style={{ padding: 10, gap: 6, marginTop: 12 }}>
          {[60, 45, 75, 40].map((w, i) => (
            <View
              key={i}
              style={{
                height: 5,
                width: `${w}%`,
                borderRadius: 3,
                backgroundColor: colors.primary,
                opacity: 0.18,
              }}
            />
          ))}
        </View>
      </View>

      {/* Mid receipt card */}
      <View
        style={{
          position: 'absolute',
          width: 82,
          height: 112,
          borderRadius: 12,
          backgroundColor: isDark ? '#2A2A30' : '#F3F5F2',
          transform: [{ rotate: '5deg' }, { translateY: 2 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 10,
          elevation: 4,
        }}
      >
        <View style={{ padding: 10, gap: 6, marginTop: 12 }}>
          {[70, 50, 80].map((w, i) => (
            <View
              key={i}
              style={{
                height: 5,
                width: `${w}%`,
                borderRadius: 3,
                backgroundColor: colors.primary,
                opacity: 0.22,
              }}
            />
          ))}
        </View>
      </View>

      {/* Front receipt card — main */}
      <View
        style={{
          width: 88,
          height: 116,
          borderRadius: 14,
          backgroundColor: isDark ? colors.surfaceSubdued : '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.4 : 0.14,
          shadowRadius: 16,
          elevation: 8,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: isDark ? colors.primaryLight : `${colors.primary}18`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="receipt-outline" size={28} color={colors.primary} />
        </View>
        <View style={{ gap: 5, marginTop: 12, width: 60 }}>
          {[100, 70, 85].map((w, i) => (
            <View
              key={i}
              style={{
                height: 4,
                width: `${w}%`,
                borderRadius: 2,
                backgroundColor: colors.primary,
                opacity: 0.15,
              }}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function ParsingSpinner({ color }: { color: string }) {
  const dot0 = useRef(new Animated.Value(0.3)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const makePulse = (val: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(val, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          ])
        ),
      ]);

    makePulse(dot0, 0).start();
    makePulse(dot1, 160).start();
    makePulse(dot2, 320).start();
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      {[dot0, dot1, dot2].map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
            opacity: d,
          }}
        />
      ))}
    </View>
  );
}

function PhraseCarousel({ colors }: { colors: any }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setPhraseIdx((p) => (p + 1) % SCANNING_PHRASES.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Animated.Text
      style={{
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: colors.textSecondary,
        opacity: fadeAnim,
      }}
    >
      {SCANNING_PHRASES[phraseIdx]}…
    </Animated.Text>
  );
}

function ItemStatusStripe({
  assignedQty,
  totalQty,
  colors,
}: {
  assignedQty: number;
  totalQty: number;
  colors: any;
}) {
  const ratio = totalQty > 0 ? assignedQty / totalQty : 0;
  const fillAnim = useRef(new Animated.Value(ratio)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: assignedQty / Math.max(totalQty, 1),
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [assignedQty, totalQty]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const fillColor =
    assignedQty === 0
      ? 'transparent'
      : assignedQty < totalQty
      ? '#F59E0B'
      : colors.primary;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: colors.border,
        opacity: assignedQty === 0 ? 0 : 1,
      }}
    >
      <Animated.View
        style={{
          height: 3,
          width: fillWidth,
          backgroundColor: fillColor,
          borderTopRightRadius: assignedQty < totalQty ? 0 : 2,
        }}
      />
    </View>
  );
}

function AssigneeButton({
  person,
  qty,
  isMulti,
  onPress,
}: {
  person: Person;
  qty: number;
  isMulti: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const assigned = qty > 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scaleAnim, {
          toValue: 0.85,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }).start()
      }
      activeOpacity={1}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: scaleAnim }],
          ...(assigned
            ? { backgroundColor: person.color }
            : {
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderColor: `${person.color}80`,
              }),
        }}
      >
        <Text
          style={{
            fontFamily: 'Nunito_800ExtraBold',
            fontSize: 12,
            color: assigned ? '#fff' : person.color,
          }}
        >
          {isMulti && assigned ? qty.toString() : person.name[0].toUpperCase()}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function SummaryProportionBar({
  widthPercent,
  color,
  colors,
}: {
  widthPercent: number;
  color: string;
  colors: any;
}) {
  const fillAnim = useRef(new Animated.Value(widthPercent)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: widthPercent,
      duration: 340,
      useNativeDriver: false,
    }).start();
  }, [widthPercent]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.surfaceSubdued ?? (colors.isDark ? '#2A2A30' : '#EBEBEB'),
        overflow: 'hidden',
        marginHorizontal: 10,
        marginTop: 5,
      }}
    >
      <Animated.View
        style={{
          height: 4,
          width: fillWidth,
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
    </View>
  );
}

function HeaderReceiptThumb({
  imageUri,
  colors,
}: {
  imageUri: string;
  colors: any;
}) {
  const enterAnim = useRef(new Animated.Value(0)).current;
  const scale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  useEffect(() => {
    Animated.spring(enterAnim, {
      toValue: 1,
      friction: 6,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: enterAnim, transform: [{ scale }] }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          overflow: 'hidden',
          borderWidth: 1.5,
          borderColor: colors.border,
        }}
      >
        <Image
          source={{ uri: imageUri }}
          style={{ width: 44, height: 44 }}
          contentFit="cover"
          transition={150}
        />
      </View>
    </Animated.View>
  );
}

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
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 })
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
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const { data, error } = await supabase.functions.invoke('split-receipt', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });
      if (error) {
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
        } catch { /* ignore */ }
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
          const total = item.price ?? (item.unit_price ? item.unit_price * qty : 0);
          return { id: `item-${i}`, name: item.name, price: total, quantity: qty, assignees: {} };
        })
      );
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
        return { ...item, assignees: { ...item.assignees, [personId]: next } };
      })
    );
  }, []);

  // ── Summary calc ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totals: Record<string, number> = {};
    people.forEach((p) => { totals[p.id] = 0; });
    items.forEach((item) => {
      const unitPrice = item.price / item.quantity;
      Object.entries(item.assignees).forEach(([personId, qty]) => {
        if (qty > 0) totals[personId] = (totals[personId] ?? 0) + unitPrice * qty;
      });
    });
    return totals;
  }, [items, people]);

  const unassignedTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const assignedQty = Object.values(item.assignees).reduce((s, q) => s + q, 0);
        const unassignedQty = Math.max(0, item.quantity - assignedQty);
        return sum + (item.price / item.quantity) * unassignedQty;
      }, 0),
    [items]
  );

  const totalAssigned = useMemo(
    () => Object.values(summary).reduce((s, v) => s + v, 0),
    [summary]
  );

  const assignedItemCount = useMemo(
    () =>
      items.filter(
        (item) =>
          Object.values(item.assignees).reduce((s, q) => s + q, 0) >= item.quantity
      ).length,
    [items]
  );

  const allAssigned = assignedItemCount === items.length && items.length > 0;

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
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bill Splitter</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {phase === 'idle'
              ? 'Scan a receipt to split'
              : phase === 'parsing'
              ? 'Scanning…'
              : merchant ?? 'Assign items to people'}
          </Text>
        </View>

        {/* Right slot */}
        {phase === 'assigning' && imageUri ? (
          <HeaderReceiptThumb imageUri={imageUri} colors={colors} />
        ) : phase === 'assigning' ? (
          <TouchableOpacity onPress={reset} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* ── Phase step dots ── */}
      {phase !== 'idle' && (
        <View style={styles.stepRow}>
          {(['idle', 'parsing', 'assigning'] as Phase[]).map((p, idx, arr) => {
            const activeIdx = arr.indexOf(phase);
            const isActive = idx <= activeIdx;
            return (
              <React.Fragment key={p}>
                <View
                  style={[
                    styles.stepDot,
                    { backgroundColor: isActive ? colors.primary : colors.border },
                    idx === activeIdx && { width: 18 },
                  ]}
                />
                {idx < arr.length - 1 && (
                  <View
                    style={[
                      styles.stepLine,
                      { backgroundColor: isActive && idx < activeIdx ? colors.primary : colors.border },
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <View style={styles.idleContainer}>
          <IdleIllustration colors={colors} isDark={isDark} />
          <Text style={styles.idleTitle}>Split the bill,{'\n'}skip the drama</Text>
          <Text style={styles.idleSub}>
            Take or upload a receipt photo.{'\n'}We'll extract every line item for you.
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
            <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
              Take Photo
            </Text>
          </TouchableOpacity>

          {/* How it works pills */}
          <View style={styles.howItWorks}>
            {['📷 Scan receipt', '👥 Add people', '✅ Assign items'].map((step, i) => (
              <View
                key={i}
                style={[
                  styles.howStep,
                  {
                    backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.howStepText, { color: colors.textSecondary }]}>{step}</Text>
              </View>
            ))}
          </View>
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
                backgroundColor: isDark ? 'rgba(14,14,16,0.88)' : 'rgba(255,255,255,0.92)',
              },
            ]}
          >
            {/* Icon with pulse */}
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: isDark ? colors.surfaceSubdued : `${colors.primary}14`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              <Ionicons name="scan-outline" size={32} color={colors.primary} />
            </View>

            <Text style={[styles.parsingText, { color: colors.textPrimary }]}>
              Reading receipt
            </Text>
            <PhraseCarousel colors={colors} />
            <View style={{ marginTop: 8 }}>
              <ParsingSpinner color={colors.primary} />
            </View>
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
                      backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
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
                    { backgroundColor: newName.trim() ? colors.primary : colors.border },
                  ]}
                >
                  <Ionicons name="add" size={22} color="#fff" />
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
                          backgroundColor: `${person.color}18`,
                          borderColor: `${person.color}40`,
                        },
                      ]}
                    >
                      <View
                        style={[styles.personDot, { backgroundColor: person.color }]}
                      >
                        <Text style={styles.personDotText}>
                          {person.name[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.personChipName, { color: person.color }]}>
                        {person.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removePerson(person.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={15}
                          color={person.color}
                          style={{ opacity: 0.6 }}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {people.length === 0 && (
                <Text style={[styles.peopleHint, { color: colors.textSecondary }]}>
                  Add people above, then tap their initials on each item.
                </Text>
              )}
            </View>

            {/* ── Items section header ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ITEMS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
                  {assignedItemCount}/{items.length}
                </Text>
                {items.length > 0 && (
                  <View
                    style={[
                      styles.assignedPill,
                      {
                        backgroundColor: allAssigned
                          ? `${colors.primary}18`
                          : 'rgba(245,158,11,0.12)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.assignedPillText,
                        { color: allAssigned ? colors.primary : '#F59E0B' },
                      ]}
                    >
                      {allAssigned ? 'All assigned' : 'Pending'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Items list ── */}
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
                <Text style={[styles.sectionLabel, { paddingHorizontal: 16, paddingTop: 16 }]}>
                  SPLIT SUMMARY
                </Text>

                {/* Per-person rows */}
                {people.map((person) => {
                  const amount = summary[person.id] ?? 0;
                  const pct =
                    totalAssigned > 0 ? (amount / totalAssigned) * 100 : 0;
                  return (
                    <View
                      key={person.id}
                      style={[
                        styles.summaryRow,
                        { borderBottomColor: colors.border },
                      ]}
                    >
                      <View
                        style={[styles.summaryAvatar, { backgroundColor: person.color }]}
                      >
                        <Text style={styles.summaryAvatarText}>
                          {person.name[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[styles.summaryName, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {person.name}
                        </Text>
                        <SummaryProportionBar
                          widthPercent={pct}
                          color={person.color}
                          colors={colors}
                        />
                      </View>
                      <Text style={[styles.summaryAmount, { color: colors.textPrimary }]}>
                        {fmt(amount)}
                      </Text>
                    </View>
                  );
                })}

                {/* Totals block */}
                <View
                  style={[
                    styles.totalsBlock,
                    {
                      borderTopColor: colors.border,
                      backgroundColor: isDark ? colors.surfaceSubdued : '#F8F8FA',
                    },
                  ]}
                >
                  <View style={styles.totalsRow}>
                    <Text style={[styles.totalsLabel, { color: colors.textSecondary }]}>
                      Total Assigned
                    </Text>
                    <Text style={[styles.totalsValue, { color: colors.textPrimary }]}>
                      {fmt(totalAssigned)}
                    </Text>
                  </View>

                  {unassignedTotal > 0.005 && (
                    <View style={styles.totalsRow}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <View
                          style={[
                            styles.unassignedWarningPill,
                            { backgroundColor: 'rgba(245,158,11,0.14)' },
                          ]}
                        >
                          <Ionicons name="alert-circle-outline" size={11} color="#F59E0B" />
                          <Text style={styles.unassignedWarningText}>Unassigned</Text>
                        </View>
                      </View>
                      <Text style={[styles.totalsValue, { color: '#E07A5F' }]}>
                        {fmt(unassignedTotal)}
                      </Text>
                    </View>
                  )}

                  {receiptTotal != null && (
                    <>
                      <View
                        style={[
                          styles.totalsDivider,
                          { backgroundColor: colors.border },
                        ]}
                      />
                      <View style={styles.totalsRow}>
                        <Text style={[styles.receiptTotalLabel, { color: colors.textPrimary }]}>
                          Receipt Total
                        </Text>
                        <Text style={[styles.receiptTotalValue, { color: colors.primary }]}>
                          {fmt(receiptTotal)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Reset button at bottom of summary */}
                <TouchableOpacity
                  onPress={reset}
                  activeOpacity={0.7}
                  style={[
                    styles.resetBtn,
                    {
                      borderTopColor: colors.border,
                      backgroundColor: isDark ? colors.surfaceSubdued : '#F8F8FA',
                    },
                  ]}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>
                    Start over
                  </Text>
                </TouchableOpacity>
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
  onEditDraftChange: (d: { name: string; quantity: string; price: string }) => void;
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
          <View style={{ flex: 1 }}>
            <Text style={[styles.editLabel, { color: colors.textSecondary }]}>QTY</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: inputBg, color: colors.textPrimary }]}
              value={editDraft.quantity}
              onChangeText={(t) =>
                onEditDraftChange({ ...editDraft, quantity: t.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={[styles.editLabel, { color: colors.textSecondary }]}>
              TOTAL PRICE (₱)
            </Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: inputBg, color: colors.textPrimary }]}
              value={editDraft.price}
              onChangeText={(t) =>
                onEditDraftChange({ ...editDraft, price: t.replace(/[^0-9.]/g, '') })
              }
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
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
        { position: 'relative' },
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.07)',
        },
      ]}
    >
      {/* Assignment status stripe */}
      <ItemStatusStripe
        assignedQty={assignedQty}
        totalQty={item.quantity}
        colors={colors}
      />

      {/* Left: name + price */}
      <View style={styles.itemLeft}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Text
            style={[styles.itemName, { color: colors.textPrimary, flex: 1 }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <TouchableOpacity
            onPress={() => onEditStart(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="pencil-outline" size={13} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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
              <Text style={[styles.itemUnitPrice, { color: colors.textSecondary }]}>
                {' '}{fmt(unitPrice)} each
              </Text>
              <Text style={[styles.itemPriceDot, { color: colors.border }]}>{' '}·{' '}</Text>
              <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
                {fmt(item.price)}
              </Text>
              {assignedQty > 0 && assignedQty < item.quantity && (
                <Text style={[styles.itemLeftBadge, { color: '#F59E0B' }]}>
                  {' '}{item.quantity - assignedQty} left
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
            return (
              <AssigneeButton
                key={person.id}
                person={person}
                qty={qty}
                isMulti={isMulti}
                onPress={() => onCycle(item.id, person.id)}
              />
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
      paddingVertical: 10,
      gap: 10,
      backgroundColor: isDark ? colors.background : '#F7F5F2',
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
    },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },

    // Step dots
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 10,
      gap: 0,
    },
    stepDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    stepLine: {
      height: 2,
      width: 20,
      borderRadius: 1,
      marginHorizontal: 3,
    },

    // Idle
    idleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    idleTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 26,
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: -0.3,
      lineHeight: 33,
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
      borderRadius: 16,
      width: '100%',
      justifyContent: 'center',
      marginBottom: 10,
    },
    primaryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: '#fff',
      letterSpacing: 0.2,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 16,
      width: '100%',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    secondaryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      letterSpacing: 0.2,
    },
    howItWorks: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 28,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    howStep: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9999,
      borderWidth: 1,
    },
    howStepText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
    },

    // Parsing
    parsingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptPreview: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.2,
    },
    parsingOverlay: {
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 40,
      paddingVertical: 36,
      borderRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 20,
      elevation: 8,
    },
    parsingText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      letterSpacing: -0.2,
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
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    sectionCount: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      marginBottom: 10,
    },
    assignedPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 9999,
      marginBottom: 10,
    },
    assignedPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      letterSpacing: 0.3,
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
      height: 44,
      borderRadius: 12,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
    addPersonBtn: {
      width: 44,
      height: 44,
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
      paddingTop: 15,
      paddingBottom: 12,
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
      gap: 0,
      justifyContent: 'flex-end',
      maxWidth: 180,
    },
    itemNopeople: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      textAlign: 'right',
    },
    assigneeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assigneeBtnText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 12,
    },

    // Edit mode
    editInput: {
      height: 44,
      borderRadius: 12,
      paddingHorizontal: 12,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
    },
    editLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    editConfirmBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
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
      paddingVertical: 14,
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
    },
    summaryAmount: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      flexShrink: 0,
    },

    // Totals block
    totalsBlock: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
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
    unassignedWarningPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 9999,
    },
    unassignedWarningText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: '#F59E0B',
    },
    totalsDivider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 2,
    },
    receiptTotalLabel: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 15,
    },
    receiptTotalValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 17,
    },
    resetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    resetBtnText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
    },
  });
