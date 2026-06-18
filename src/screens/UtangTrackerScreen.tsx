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
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '@/navigation/RootNavigator';
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

// 'owed_to_me' = a receivable (someone owes the user); 'i_owe' = a payable
// (the user owes someone). Rows created before the direction migration arrive
// without one — anything that isn't 'i_owe' is treated as a receivable.
type Direction = 'owed_to_me' | 'i_owe';

interface Debt {
  id: string;
  debtor_name: string;
  description: string | null;
  total_amount: number;
  amount_paid: number;
  direction: Direction;
  due_date: string | null;
  created_at: string;
}

type StatusFilter = 'all' | 'pending' | 'partial' | 'paid';
type Status = 'pending' | 'partial' | 'paid';

const getStatus = (debt: Debt): Status => {
  if (debt.amount_paid <= 0) return 'pending';
  if (debt.amount_paid >= debt.total_amount) return 'paid';
  return 'partial';
};

const STATUS_COLOR: Record<Status, { color: string; bg: string }> = {
  pending: { color: '#F59E0B', bg: '#FEF3C7' },
  partial: { color: '#3A7BD5', bg: '#DBEAFE' },
  paid: { color: '#10B981', bg: '#D1FAE5' },
};

const statusLabel = (status: Status, direction: Direction): string => {
  if (status === 'paid') return direction === 'i_owe' ? 'Settled' : 'Paid';
  if (status === 'partial') return 'Partial';
  return 'Unpaid';
};

// Everything that distinguishes a receivable from a payable in one place, so the
// list, cards, sheets and empty states all read from the same source of truth.
interface DirMeta {
  accent: string;
  strong: string;
  soft: string;
  icon: 'arrow-down' | 'arrow-up';
  tabTitle: string;
  relLabel: string; // card line: "Owes you" / "You owe"
  paidLabel: string; // amount column: "Collected" / "Paid off"
  paidVerb: string; // progress caption: "collected" / "paid off"
  payTitle: string;
  payAmountLabel: string;
  payActionLabel: string;
}

const getDirMeta = (direction: Direction, colors: any): DirMeta =>
  direction === 'i_owe'
    ? {
        accent: colors.coral,
        strong: colors.coralDark,
        soft: colors.coralLight,
        icon: 'arrow-up',
        tabTitle: 'I owe',
        relLabel: 'You owe',
        paidLabel: 'Paid off',
        paidVerb: 'paid off',
        payTitle: 'Pay This Down',
        payAmountLabel: 'AMOUNT PAID (₱)',
        payActionLabel: 'Pay Down',
      }
    : {
        accent: colors.primary,
        strong: colors.primaryDark ?? colors.primary,
        soft: colors.primaryLight,
        icon: 'arrow-down',
        tabTitle: 'Owed to me',
        relLabel: 'Owes you',
        paidLabel: 'Collected',
        paidVerb: 'collected',
        payTitle: 'Record Payment',
        payAmountLabel: 'AMOUNT RECEIVED (₱)',
        payActionLabel: 'Record Payment',
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

function PulsingDots({
  color = '#3A7BD5',
  size = 8,
}: {
  color?: string;
  size?: number;
}) {
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
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
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

function ProgressBar({
  pct,
  color,
  trackColor,
  style,
}: {
  pct: number;
  color: string;
  trackColor: string;
  style?: any;
}) {
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
    <View
      style={[
        {
          height: 4,
          borderRadius: 2,
          overflow: 'hidden',
          backgroundColor: trackColor,
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          width: width.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
        }}
      />
    </View>
  );
}

// ─── Animated Card wrapper ────────────────────────────────────────────────────

function AnimatedDebtCard({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
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
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          },
        ],
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
    Animated.spring(scale, {
      toValue: 0.95,
      damping: 18,
      stiffness: 260,
      useNativeDriver: true,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      damping: 16,
      stiffness: 240,
      useNativeDriver: true,
    }).start();

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      activeOpacity={0.9}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Empty Illustration ───────────────────────────────────────────────────────

function DebtEmptyIllustration({
  color,
  icon,
}: {
  color: string;
  icon: 'arrow-down' | 'arrow-up';
}) {
  const scale = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(0.72);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        damping: 16,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 340,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, {
            toValue: -6,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(float, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [icon]);

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
              backgroundColor: `${color}${Math.round(card.opacity * 255)
                .toString(16)
                .padStart(2, '0')}`,
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
          {i === 2 && <Ionicons name={icon} size={26} color="#fff" />}
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
  const [tempDate, setTempDate] = useState(
    initialDate || getLocalDateString(new Date())
  );

  useEffect(() => {
    if (visible) setTempDate(initialDate || getLocalDateString(new Date()));
  }, [visible, initialDate]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: 20,
        }}
      >
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
              <Text
                style={{
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: 14,
                  color: colors.textPrimary,
                }}
              >
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
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 14,
                  color: '#fff',
                }}
              >
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

  const trackColor = isDark ? colors.border : '#F0F0F4';
  const successGreen = '#10B981';

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setDebts([]);
      setLoading(false);
      return undefined;
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
          direction: (r.direction === 'i_owe'
            ? 'i_owe'
            : 'owed_to_me') as Direction,
          due_date: r.dueDate ?? null,
          created_at: (raw.server_created_at as string) ?? '',
        } as Debt;
      });
      setDebts(raws);
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [userId]);

  // ── Active direction tab + status filter
  const [dir, setDir] = useState<Direction>('owed_to_me');
  const [filter, setFilter] = useState<StatusFilter>('all');

  // ── Add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    debtor_name: '',
    description: '',
    total_amount: '',
    due_date: '',
    direction: 'owed_to_me' as Direction,
  });
  const [showCalendar, setShowCalendar] = useState(false);

  const openAdd = (forceDir?: Direction) => {
    setAddForm({
      debtor_name: '',
      description: '',
      total_amount: '',
      due_date: '',
      direction: forceDir ?? dir,
    });
    setShowAdd(true);
  };

  // Prefill + open the add form when the chatbot's "Add to Utang Tracker"
  // action routes here ("Paul owed me 5k") — the user reviews and saves, no
  // silent write. Fires once per param payload.
  const route = useRoute<RouteProp<RootStackParamList, 'UtangTracker'>>();
  const prefilledRef = useRef(false);
  useEffect(() => {
    const p = route.params;
    if (!p || prefilledRef.current) return;
    if (!p.debtorName && p.amount == null) return;
    prefilledRef.current = true;
    const prefillDir: Direction =
      p.direction === 'i_owe' ? 'i_owe' : 'owed_to_me';
    setDir(prefillDir);
    setAddForm({
      debtor_name: p.debtorName ?? '',
      description: '',
      total_amount: p.amount != null ? String(Math.round(p.amount)) : '',
      due_date: '',
      direction: prefillDir,
    });
    setShowAdd(true);
  }, [route.params]);

  // ── Payment modal state
  const [payTarget, setPayTarget] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  // ── Detail modal state
  const [detail, setDetail] = useState<Debt | null>(null);

  // ── Stats (both directions, outstanding only)
  const stats = useMemo(() => {
    const inList = debts.filter((d) => d.direction === 'owed_to_me');
    const outList = debts.filter((d) => d.direction === 'i_owe');
    const outstanding = (list: Debt[]) =>
      list.reduce((s, d) => s + Math.max(0, d.total_amount - d.amount_paid), 0);
    const owedToMe = outstanding(inList);
    const iOwe = outstanding(outList);
    const activeCount = (list: Debt[]) =>
      list.filter((d) => getStatus(d) !== 'paid').length;
    return {
      owedToMe,
      iOwe,
      net: owedToMe - iOwe,
      inCount: inList.length,
      outCount: outList.length,
      activeIn: activeCount(inList),
      activeOut: activeCount(outList),
    };
  }, [debts]);

  // ── List filtered by active direction + status
  const filtered = useMemo(
    () =>
      debts
        .filter((d) => d.direction === dir)
        .filter((d) => (filter === 'all' ? true : getStatus(d) === filter)),
    [debts, dir, filter]
  );

  const activeMeta = getDirMeta(dir, colors);

  // ── Add debt
  const submitAdd = async () => {
    const name = addForm.debtor_name.trim();
    const amount = parseFloat(addForm.total_amount);
    if (!name) {
      Alert.alert(
        'Missing name',
        addForm.direction === 'i_owe'
          ? 'Enter who you owe.'
          : "Enter the debtor's name."
      );
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    const newDir = addForm.direction;
    setShowAdd(false);
    setAddForm({
      debtor_name: '',
      description: '',
      total_amount: '',
      due_date: '',
      direction: newDir,
    });
    // Make sure the new record is visible in the list after saving.
    setDir(newDir);
    setFilter('all');

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not signed in');
      await createDebt({
        userId: authUser.id,
        debtorName: name,
        description: addForm.description.trim() || undefined,
        totalAmount: amount,
        direction: newDir,
        dueDate: addForm.due_date || undefined,
      });
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Please try again.'
      );
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
    if (detail)
      setDetail((prev) => (prev ? { ...prev, amount_paid: newPaid } : null));

    setPayLoading(true);
    try {
      await localUpdateDebt(targetId, { amountPaid: newPaid });
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setPayLoading(false);
    }
  };

  // ── Delete
  const deleteDebt = (debt: Debt) => {
    Alert.alert('Delete record', `Remove ${debt.debtor_name}'s record?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDetail(null);
          try {
            await localDeleteDebt(debt.id);
          } catch (err) {
            Alert.alert(
              'Delete failed',
              err instanceof Error ? err.message : 'Please try again.'
            );
          }
        },
      },
    ]);
  };

  const netSign = stats.net > 0 ? '+' : stats.net < 0 ? '−' : '';
  const netCaption =
    stats.owedToMe === 0 && stats.iOwe === 0
      ? 'Nothing outstanding right now'
      : stats.net > 0
        ? "You're owed more than you owe"
        : stats.net < 0
          ? "You owe more than you're owed"
          : "You owe exactly what you're owed";

  // ─── Render
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Debt Tracker</Text>
          <Text style={styles.headerSub}>
            Money you&apos;re owed &amp; money you owe
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => openAdd()}
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
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Net hero */}
          <LinearGradient
            colors={[colors.statsHeroBg1, colors.statsHeroBg2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroLabel}>NET POSITION</Text>
            <Text style={styles.heroNet}>
              {netSign}
              {fmt(Math.abs(stats.net))}
            </Text>
            <Text style={styles.heroCaption}>{netCaption}</Text>

            <View style={styles.heroSplit}>
              <View style={styles.heroCol}>
                <View style={styles.heroColRow}>
                  <View
                    style={[
                      styles.heroPill,
                      { backgroundColor: 'rgba(151,196,89,0.26)' },
                    ]}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={13}
                      color={colors.statsHeroBar}
                    />
                  </View>
                  <Text style={styles.heroColLabel}>Owed to you</Text>
                </View>
                <Text style={styles.heroColVal}>{fmt(stats.owedToMe)}</Text>
                <Text style={styles.heroColSub}>
                  {stats.activeIn} {stats.activeIn === 1 ? 'person' : 'people'}
                </Text>
              </View>
              <View style={styles.heroCol}>
                <View style={styles.heroColRow}>
                  <View
                    style={[
                      styles.heroPill,
                      { backgroundColor: 'rgba(232,133,106,0.30)' },
                    ]}
                  >
                    <Ionicons name="arrow-up" size={13} color={colors.coral} />
                  </View>
                  <Text style={styles.heroColLabel}>You owe</Text>
                </View>
                <Text style={styles.heroColVal}>{fmt(stats.iOwe)}</Text>
                <Text style={styles.heroColSub}>
                  {stats.activeOut}{' '}
                  {stats.activeOut === 1 ? 'person' : 'people'}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* ── Direction tabs */}
          <View style={styles.dirTabsRow}>
            {(['owed_to_me', 'i_owe'] as Direction[]).map((d) => {
              const meta = getDirMeta(d, colors);
              const active = dir === d;
              const count = d === 'owed_to_me' ? stats.inCount : stats.outCount;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => {
                    setDir(d);
                    setFilter('all');
                  }}
                  activeOpacity={0.85}
                  style={[
                    styles.dirTab,
                    {
                      backgroundColor: active ? meta.soft : colors.white,
                      borderColor: active ? meta.accent : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dirTabIcon,
                      { backgroundColor: active ? meta.accent : meta.soft },
                    ]}
                  >
                    <Ionicons
                      name={meta.icon}
                      size={16}
                      color={active ? '#fff' : meta.strong}
                    />
                  </View>
                  <View style={{ minWidth: 0, flexShrink: 1 }}>
                    <Text
                      style={[
                        styles.dirTabTitle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {meta.tabTitle}
                    </Text>
                    <Text
                      style={[
                        styles.dirTabSub,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {count} {count === 1 ? 'record' : 'records'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Status filter */}
          <View
            style={[
              styles.filterRow,
              {
                backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
                borderColor: colors.border,
              },
            ]}
          >
            {(['all', 'pending', 'partial', 'paid'] as StatusFilter[]).map(
              (tab) => {
                const active = filter === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setFilter(tab)}
                    activeOpacity={0.7}
                    style={[
                      styles.filterTab,
                      active && { backgroundColor: activeMeta.accent },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        { color: active ? '#fff' : colors.textSecondary },
                      ]}
                    >
                      {tab === 'all'
                        ? 'All'
                        : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>

          {/* ── Empty state */}
          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <DebtEmptyIllustration
                color={activeMeta.accent}
                icon={activeMeta.icon}
              />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {filter !== 'all'
                  ? `No ${filter} records`
                  : dir === 'owed_to_me'
                    ? 'Nobody owes you yet'
                    : "You don't owe anyone"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {filter !== 'all'
                  ? 'Switch tabs to see other records.'
                  : dir === 'owed_to_me'
                    ? 'Track money you lent out so you never forget who owes you.'
                    : 'Track money you borrowed so you can pay it back on time.'}
              </Text>
              {filter === 'all' && (
                <SpringButton
                  onPress={() => openAdd(dir)}
                  style={[
                    styles.emptyBtn,
                    { backgroundColor: activeMeta.accent },
                  ]}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>
                    {dir === 'owed_to_me'
                      ? 'Add money owed to me'
                      : 'Add money I owe'}
                  </Text>
                </SpringButton>
              )}
            </View>
          )}

          {/* ── Cards */}
          {filtered.map((debt, index) => {
            const status = getStatus(debt);
            const sc = STATUS_COLOR[status];
            const meta = getDirMeta(debt.direction, colors);
            const remaining = debt.total_amount - debt.amount_paid;
            const pct = Math.min(1, debt.amount_paid / debt.total_amount);
            const overdue =
              debt.due_date &&
              status !== 'paid' &&
              new Date(debt.due_date) < new Date();
            const barColor = status === 'paid' ? successGreen : meta.accent;

            return (
              <AnimatedDebtCard key={debt.id} index={index}>
                <TouchableOpacity
                  onPress={() => setDetail(debt)}
                  activeOpacity={0.82}
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
                      styles.cardAccent,
                      { backgroundColor: meta.accent },
                    ]}
                  />

                  {/* Top: avatar + name + status */}
                  <View style={styles.cardTop}>
                    <View
                      style={[styles.avatar, { backgroundColor: meta.soft }]}
                    >
                      <Text style={[styles.avatarText, { color: meta.strong }]}>
                        {debt.debtor_name.charAt(0).toUpperCase()}
                      </Text>
                      <View
                        style={[
                          styles.avatarBadge,
                          {
                            backgroundColor: meta.accent,
                            borderColor: colors.white,
                          },
                        ]}
                      >
                        <Ionicons name={meta.icon} size={9} color="#fff" />
                      </View>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.debtorName,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {debt.debtor_name}
                      </Text>
                      {debt.description ? (
                        <Text
                          style={[
                            styles.debtDesc,
                            { color: colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {debt.description}
                        </Text>
                      ) : null}
                      <Text
                        style={[styles.relLine, { color: meta.strong }]}
                        numberOfLines={1}
                      >
                        {meta.relLabel} {fmt(remaining)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: isDark ? `${sc.color}33` : sc.bg },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: sc.color }]}>
                        {statusLabel(status, debt.direction)}
                      </Text>
                    </View>
                  </View>

                  {/* Progress */}
                  {status !== 'pending' && (
                    <ProgressBar
                      pct={pct}
                      color={barColor}
                      trackColor={trackColor}
                      style={{
                        marginLeft: 18,
                        marginRight: 14,
                        marginBottom: 10,
                      }}
                    />
                  )}

                  {/* Amounts */}
                  <View style={styles.cardAmounts}>
                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.amountLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Total
                      </Text>
                      <Text
                        style={[
                          styles.amountValue,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {fmt(debt.total_amount)}
                      </Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.amountLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {meta.paidLabel}
                      </Text>
                      <Text
                        style={[styles.amountValue, { color: successGreen }]}
                      >
                        {fmt(debt.amount_paid)}
                      </Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.amountLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Remaining
                      </Text>
                      <Text
                        style={[
                          styles.amountValue,
                          { color: remaining > 0 ? meta.strong : successGreen },
                        ]}
                      >
                        {fmt(remaining)}
                      </Text>
                    </View>
                  </View>

                  {/* Footer */}
                  <View
                    style={[
                      styles.cardFooter,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={overdue ? '#EF4444' : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.dueDateText,
                          { color: overdue ? '#EF4444' : colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
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
                          {
                            backgroundColor: `${meta.accent}18`,
                            borderColor: `${meta.accent}40`,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="cash-outline"
                          size={13}
                          color={meta.strong}
                        />
                        <Text
                          style={[styles.payBtnText, { color: meta.strong }]}
                        >
                          {meta.payActionLabel}
                        </Text>
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
      {/* ADD MODAL */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAdd(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKAV}
        >
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {addForm.direction === 'i_owe'
                ? 'Money I owe'
                : 'Money owed to me'}
            </Text>
            <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
              First, who is this between?
            </Text>

            {/* Direction picker */}
            <View style={styles.pickRow}>
              {(['owed_to_me', 'i_owe'] as Direction[]).map((d) => {
                const meta = getDirMeta(d, colors);
                const selected = addForm.direction === d;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setAddForm((f) => ({ ...f, direction: d }))}
                    activeOpacity={0.85}
                    style={[
                      styles.pickOpt,
                      {
                        backgroundColor: selected ? meta.soft : colors.white,
                        borderColor: selected ? meta.accent : colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.pickIcon,
                        { backgroundColor: selected ? meta.accent : meta.soft },
                      ]}
                    >
                      <Ionicons
                        name={meta.icon}
                        size={18}
                        color={selected ? '#fff' : meta.strong}
                      />
                    </View>
                    <Text
                      style={[styles.pickTitle, { color: colors.textPrimary }]}
                    >
                      {d === 'owed_to_me' ? 'They owe me' : 'I owe them'}
                    </Text>
                    <Text
                      style={[styles.pickSub, { color: colors.textSecondary }]}
                    >
                      {d === 'owed_to_me' ? 'I lent it out' : 'I borrowed it'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                {addForm.direction === 'i_owe'
                  ? 'WHO DO YOU OWE? *'
                  : 'WHO OWES YOU? *'}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                    color: colors.textPrimary,
                  },
                ]}
                placeholder={
                  addForm.direction === 'i_owe'
                    ? 'e.g. Ate Liza'
                    : 'e.g. Juan dela Cruz'
                }
                placeholderTextColor={colors.textSecondary}
                value={addForm.debtor_name}
                onChangeText={(t) =>
                  setAddForm((f) => ({ ...f, debtor_name: t }))
                }
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
                WHAT FOR (optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.surfaceSubdued : '#F4F4F8',
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="e.g. Dinner at ISLA Bar"
                placeholderTextColor={colors.textSecondary}
                value={addForm.description}
                onChangeText={(t) =>
                  setAddForm((f) => ({ ...f, description: t }))
                }
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text
                  style={[styles.formLabel, { color: colors.textSecondary }]}
                >
                  AMOUNT (₱) *
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
                  value={addForm.total_amount}
                  onChangeText={(t) =>
                    setAddForm((f) => ({
                      ...f,
                      total_amount: t.replace(/[^0-9.]/g, ''),
                    }))
                  }
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text
                  style={[styles.formLabel, { color: colors.textSecondary }]}
                >
                  DUE DATE
                </Text>
                <TouchableOpacity
                  onPress={() => setShowCalendar(true)}
                  activeOpacity={0.7}
                  style={[
                    styles.input,
                    styles.datePickerBtn,
                    {
                      backgroundColor: isDark
                        ? colors.surfaceSubdued
                        : '#F4F4F8',
                    },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={
                      addForm.due_date ? colors.primary : colors.textSecondary
                    }
                  />
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 14,
                      color: addForm.due_date
                        ? colors.textPrimary
                        : colors.textSecondary,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {addForm.due_date
                      ? fmtDate(addForm.due_date)
                      : 'Select date'}
                  </Text>
                  {addForm.due_date ? (
                    <TouchableOpacity
                      onPress={() =>
                        setAddForm((f) => ({ ...f, due_date: '' }))
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              </View>
            </View>

            <SpringButton
              onPress={submitAdd}
              style={[
                styles.submitBtn,
                {
                  backgroundColor: getDirMeta(addForm.direction, colors).accent,
                },
              ]}
            >
              <Text style={styles.submitBtnText}>
                {addForm.direction === 'i_owe' ? 'Add Record' : 'Add Record'}
              </Text>
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
      <Modal
        visible={!!payTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setPayTarget(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPayTarget(null)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKAV}
        >
          <View style={[styles.sheet, { backgroundColor: colors.white }]}>
            <View style={styles.sheetHandle} />
            {payTarget &&
              (() => {
                const meta = getDirMeta(payTarget.direction, colors);
                const remaining =
                  payTarget.total_amount - payTarget.amount_paid;
                const pct = Math.min(
                  1,
                  payTarget.amount_paid / payTarget.total_amount
                );
                return (
                  <>
                    <Text
                      style={[styles.sheetTitle, { color: colors.textPrimary }]}
                    >
                      {meta.payTitle}
                    </Text>

                    <View style={styles.payContextRow}>
                      <View
                        style={[
                          styles.payAvatar,
                          { backgroundColor: meta.soft },
                        ]}
                      >
                        <Text
                          style={[styles.payAvatarText, { color: meta.strong }]}
                        >
                          {payTarget.debtor_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text
                          style={[
                            styles.payName,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {payTarget.debtor_name}
                        </Text>
                        <Text
                          style={[
                            styles.payRemaining,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {fmt(remaining)} remaining
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.payPctBadge,
                          { backgroundColor: meta.soft },
                        ]}
                      >
                        <Text
                          style={[styles.payPctText, { color: meta.strong }]}
                        >
                          {Math.round(pct * 100)}% {meta.paidVerb}
                        </Text>
                      </View>
                    </View>

                    <ProgressBar
                      pct={pct}
                      color={meta.accent}
                      trackColor={trackColor}
                      style={{ marginBottom: 0 }}
                    />

                    <View style={[styles.formGroup, { marginTop: 14 }]}>
                      <Text
                        style={[
                          styles.formLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {meta.payAmountLabel}
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: isDark
                              ? colors.surfaceSubdued
                              : '#F4F4F8',
                            color: colors.textPrimary,
                            fontSize: 24,
                            fontFamily: 'DMMono_500Medium',
                            height: 56,
                          },
                        ]}
                        placeholder="0.00"
                        placeholderTextColor={colors.textSecondary}
                        value={payAmount}
                        onChangeText={(t) =>
                          setPayAmount(t.replace(/[^0-9.]/g, ''))
                        }
                        keyboardType="decimal-pad"
                        autoFocus
                      />
                    </View>

                    <View style={styles.quickAmounts}>
                      {[
                        { label: 'Full', value: remaining },
                        { label: 'Half', value: Math.ceil(remaining / 2) },
                      ]
                        .filter((v) => v.value > 0)
                        .map((v, i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => setPayAmount(v.value.toString())}
                            style={[
                              styles.quickPill,
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
                                styles.quickPillLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              {v.label}
                            </Text>
                            <Text
                              style={[
                                styles.quickPillAmount,
                                { color: colors.textPrimary },
                              ]}
                            >
                              {fmt(v.value)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>

                    <SpringButton
                      onPress={submitPayment}
                      disabled={payLoading}
                      style={[
                        styles.submitBtn,
                        { backgroundColor: successGreen },
                      ]}
                    >
                      {payLoading ? (
                        <PulsingDots color="#fff" size={8} />
                      ) : (
                        <Text style={styles.submitBtnText}>
                          Confirm Payment
                        </Text>
                      )}
                    </SpringButton>
                  </>
                );
              })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* DETAIL MODAL */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={!!detail}
        transparent
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDetail(null)}
        />
        <View style={[styles.detailSheet, { backgroundColor: colors.white }]}>
          <View style={styles.sheetHandle} />
          {detail &&
            (() => {
              const status = getStatus(detail);
              const sc = STATUS_COLOR[status];
              const meta = getDirMeta(detail.direction, colors);
              const remaining = detail.total_amount - detail.amount_paid;
              const pct = Math.min(1, detail.amount_paid / detail.total_amount);
              const overdue =
                detail.due_date &&
                status !== 'paid' &&
                new Date(detail.due_date) < new Date();
              const barColor = status === 'paid' ? successGreen : meta.accent;

              return (
                <>
                  {/* Hero header */}
                  <View style={styles.detailHeader}>
                    <View
                      style={[
                        styles.detailAvatar,
                        { backgroundColor: meta.soft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailAvatarText,
                          { color: meta.strong },
                        ]}
                      >
                        {detail.debtor_name.charAt(0).toUpperCase()}
                      </Text>
                      <View
                        style={[
                          styles.avatarBadge,
                          {
                            backgroundColor: meta.accent,
                            borderColor: colors.white,
                          },
                        ]}
                      >
                        <Ionicons name={meta.icon} size={10} color="#fff" />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.detailName,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {detail.debtor_name}
                      </Text>
                      <Text
                        style={[
                          styles.detailDesc,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {meta.relLabel}
                        {detail.description ? ` · ${detail.description}` : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: isDark ? `${sc.color}33` : sc.bg },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: sc.color }]}>
                        {statusLabel(status, detail.direction)}
                      </Text>
                    </View>
                  </View>

                  {/* Progress */}
                  <ProgressBar
                    pct={pct}
                    color={barColor}
                    trackColor={trackColor}
                    style={{ marginBottom: 2 }}
                  />
                  <Text
                    style={[
                      styles.detailProgressLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {Math.round(pct * 100)}% {meta.paidVerb}
                  </Text>

                  {/* Amount grid */}
                  <View
                    style={[styles.detailGrid, { borderColor: colors.border }]}
                  >
                    {[
                      {
                        label: 'Total Amount',
                        value: fmt(detail.total_amount),
                        color: colors.textPrimary,
                      },
                      {
                        label: meta.paidLabel,
                        value: fmt(detail.amount_paid),
                        color: successGreen,
                      },
                      {
                        label: 'Remaining',
                        value: fmt(remaining),
                        color: remaining > 0 ? meta.strong : successGreen,
                      },
                      {
                        label: detail.due_date
                          ? overdue
                            ? 'Overdue Since'
                            : 'Due By'
                          : 'Date Added',
                        value: fmtDate(detail.due_date ?? detail.created_at),
                        color: overdue ? '#EF4444' : colors.textPrimary,
                      },
                    ].map((item, i) => (
                      <View
                        key={i}
                        style={[
                          styles.detailGridCell,
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
                            styles.detailGridLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={[
                            styles.detailGridValue,
                            { color: item.color },
                          ]}
                        >
                          {item.value}
                        </Text>
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
                        style={[
                          styles.detailActionBtn,
                          { backgroundColor: meta.accent, flex: 1 },
                        ]}
                      >
                        <Ionicons name="cash-outline" size={16} color="#fff" />
                        <Text style={styles.detailActionBtnText}>
                          {meta.payActionLabel}
                        </Text>
                      </SpringButton>
                    )}
                    <TouchableOpacity
                      onPress={() => deleteDebt(detail)}
                      style={[
                        styles.detailActionBtn,
                        {
                          backgroundColor: isDark ? '#3D1A1A' : '#FEF2F2',
                          flex: 0,
                          paddingHorizontal: 20,
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
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

    // Hero
    hero: { borderRadius: 22, padding: 18, overflow: 'hidden' },
    heroLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 0.8,
      color: 'rgba(255,255,255,0.62)',
    },
    heroNet: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 32,
      color: '#fff',
      marginTop: 3,
      marginBottom: 1,
    },
    heroCaption: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: 'rgba(255,255,255,0.78)',
      marginBottom: 16,
    },
    heroSplit: { flexDirection: 'row', gap: 10 },
    heroCol: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.09)',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    heroColRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 7,
    },
    heroPill: {
      width: 22,
      height: 22,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroColLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: 'rgba(255,255,255,0.8)',
    },
    heroColVal: { fontFamily: 'DMMono_500Medium', fontSize: 17, color: '#fff' },
    heroColSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10.5,
      color: 'rgba(255,255,255,0.6)',
      marginTop: 2,
    },

    // Direction tabs
    dirTabsRow: { flexDirection: 'row', gap: 8 },
    dirTab: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderWidth: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    dirTabIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dirTabTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 13.5 },
    dirTabSub: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 },

    // Status filter
    filterRow: {
      flexDirection: 'row',
      borderRadius: 12,
      padding: 4,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 2,
    },
    filterTab: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 9,
      alignItems: 'center',
    },
    filterTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 44 },
    emptyTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      marginTop: 20,
      marginBottom: 6,
    },
    emptySub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 28,
      lineHeight: 20,
      paddingHorizontal: 12,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 9999,
    },
    emptyBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

    // Card
    card: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 18,
      paddingRight: 14,
      paddingTop: 14,
      paddingBottom: 10,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18 },
    avatarBadge: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    debtorName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 15 },
    debtDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
    relLine: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 2 },
    statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontFamily: 'Inter_700Bold', fontSize: 11 },

    // Amounts
    cardAmounts: {
      flexDirection: 'row',
      paddingLeft: 18,
      paddingRight: 14,
      paddingBottom: 10,
      gap: 8,
    },
    amountCol: { flex: 1 },
    amountLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      marginBottom: 2,
    },
    amountValue: { fontFamily: 'DMMono_500Medium', fontSize: 13 },

    // Footer
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingLeft: 18,
      paddingRight: 14,
      paddingBottom: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    dueDateText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      flexShrink: 1,
    },
    payBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      flexShrink: 0,
    },
    payBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },

    // Modals
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
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
      backgroundColor: isDark ? '#3a3a42' : '#D1D5DB',
      alignSelf: 'center',
      marginBottom: 18,
    },
    sheetTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      marginBottom: 3,
    },
    sheetSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      marginBottom: 18,
    },

    // Direction picker
    pickRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    pickOpt: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1.5 },
    pickIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 9,
    },
    pickTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 14 },
    pickSub: { fontFamily: 'Inter_400Regular', fontSize: 11.5, marginTop: 1 },

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

    // Pay context
    payContextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
    },
    payAvatar: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    payAvatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18 },
    payName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16 },
    payRemaining: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      marginTop: 1,
    },
    payPctBadge: {
      marginLeft: 'auto',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    payPctText: { fontFamily: 'Inter_700Bold', fontSize: 12 },

    // Quick amounts
    quickAmounts: { flexDirection: 'row', gap: 8, marginVertical: 16 },
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
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    detailAvatar: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailAvatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 22 },
    detailName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18 },
    detailDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 },
    detailProgressLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      marginBottom: 14,
      textAlign: 'right',
      marginTop: 6,
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
    detailGridLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      marginBottom: 4,
    },
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
    detailActionBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: '#fff',
    },
  });
