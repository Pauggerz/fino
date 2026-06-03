import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { FinoIntelIcon } from '../components/icons/FinoIntelIcon';
import ProfileSidebar from '../components/ProfileSidebar';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { createTransaction } from '@/services/localMutations';
import { useAccounts } from '@/hooks/useAccounts';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { useCategories } from '@/hooks/useCategories';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import type ChatMessageModel from '@/db/models/ChatMessage';
import { useIncomeCategories } from '@/hooks/useIncomeCategories';
import { parseChatTransaction, type ChatTx } from '@/services/parseChatTransaction';
import { routeMessage, type BrainContext } from '@/services/finoBrain';
import { saveChatMessage, loadChatHistory } from '@/services/chatMutations';

const STEP_SETS: Record<string, string[]> = {
  spend:      ['Fetching your transactions', 'Calculating totals', 'Identifying top categories'],
  category:   ['Fetching transactions', 'Grouping by category', 'Comparing to last month'],
  budget:     ['Loading spending history', 'Running 3-month baseline', 'Building recommendation'],
  bills:      ['Checking recurring bills', 'Scanning upcoming due dates', 'Mapping to accounts'],
  save:       ['Fetching income & expenses', 'Calculating savings rate', 'Comparing to your goal'],
  income:     ['Fetching income records', 'Summing this month', 'Checking vs last month'],
  default:    ['Fetching your data', 'Analyzing', 'Generating response'],
};

function pickSteps(text: string): string[] {
  const t = text.toLowerCase();
  if (/spend|spent|cost|how much|total/.test(t)) return STEP_SETS.spend;
  if (/categor/.test(t)) return STEP_SETS.category;
  if (/budget|cut|reduc|less/.test(t)) return STEP_SETS.budget;
  if (/bill|subscri|due|upcoming/.test(t)) return STEP_SETS.bills;
  if (/save|saving|goal/.test(t)) return STEP_SETS.save;
  if (/income|earn|paid|salary/.test(t)) return STEP_SETS.income;
  return STEP_SETS.default;
}

type RichRow = { label: string; value: string; color?: string };

type TxData = {
  amount: number;
  displayName: string;
  category: string;
  accountName: string;
  txType: 'expense' | 'income';
};

type Message = {
  id: string;
  type: 'ai' | 'user';
  text: string;
  richData?: RichRow[];
  followUps?: string[];
  timestamp: string;
  txData?: TxData;
};

type RecentTx = {
  display_name: string | null;
  amount: number;
  type: string;
  category: string | null;
  date: string;
};

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Map a persisted chat_messages row back into a renderable Message. */
function rowToMessage(row: ChatMessageModel): Message {
  const base: Message = {
    id: row.id,
    type: row.role === 'user' ? 'user' : 'ai',
    text: row.text,
    timestamp: new Date(row.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
  if (row.payload) {
    try {
      const parsed = JSON.parse(row.payload) as Partial<Message>;
      if (parsed.txData) base.txData = parsed.txData;
      if (parsed.richData) base.richData = parsed.richData;
      if (parsed.followUps) base.followUps = parsed.followUps;
    } catch {
      // Corrupt payload — fall back to a plain text bubble.
    }
  }
  return base;
}

// ─── STEP ROW (single line inside ThinkingSteps) ────────────────────────────

type StepStatus = 'active' | 'done';

function StepRow({ text, status, colors }: { text: string; status: StepStatus; colors: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    // Spin (always running; spinner view is only rendered when active)
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 750, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    if (status === 'done') {
      Animated.timing(opacity, { toValue: 0.42, duration: 280, useNativeDriver: true }).start();
    }
  }, [status]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, opacity }}>
      {status === 'done' ? (
        <Ionicons name="checkmark" size={13} color={colors.chatAILabel} style={{ width: 13 }} />
      ) : (
        <Animated.View
          style={{
            width: 13,
            height: 13,
            borderRadius: 7,
            borderWidth: 1.5,
            borderColor: colors.chatAILabel + '30',
            borderTopColor: colors.chatAILabel,
            transform: [{ rotate }],
          }}
        />
      )}
      <Text
        style={{
          fontFamily: 'Inter_400Regular',
          fontSize: 13,
          color: status === 'active' ? colors.chatAIText : colors.chatAILabel,
          lineHeight: 18,
        }}
      >
        {text}{status === 'active' ? '…' : ''}
      </Text>
    </Animated.View>
  );
}

// ─── THINKING STEPS (replaces ThinkingBubble) ────────────────────────────────

function ThinkingSteps({ steps, colors, isDark }: { steps: string[]; colors: any; isDark: boolean }) {
  // statuses grows from ['active'] as steps complete
  const [statuses, setStatuses] = useState<StepStatus[]>(['active']);

  useEffect(() => {
    if (steps.length <= 1) return;
    let cumDelay = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    steps.slice(0, -1).forEach((_, i) => {
      cumDelay += 520 + Math.floor(Math.random() * 280);
      const d = cumDelay;
      timeouts.push(
        setTimeout(() => {
          setStatuses((prev) => {
            const next = [...prev];
            next[i] = 'done';
            next.push('active');
            return next;
          });
        }, d)
      );
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const bubbleBg = isDark ? 'rgba(124,101,200,0.12)' : 'rgba(124,101,200,0.07)';
  const borderColor = isDark ? 'rgba(124,101,200,0.35)' : 'rgba(124,101,200,0.2)';

  return (
    <View style={{ alignItems: 'flex-start', marginBottom: 20, maxWidth: '85%' }}>
      <View
        style={{
          backgroundColor: bubbleBg,
          borderWidth: 1,
          borderColor,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 16,
          borderBottomLeftRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          gap: 10,
          minWidth: 190,
        }}
      >
        {statuses.map((status, i) => (
          <StepRow key={i} text={steps[i] ?? ''} status={status} colors={colors} />
        ))}
      </View>
    </View>
  );
}

// ─── ANIMATED MESSAGE WRAPPER ────────────────────────────────────────────────

function AnimatedMessage({ children, isNew }: { children: React.ReactNode; isNew?: boolean }) {
  const opacity = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(isNew ? 12 : 0)).current;

  useEffect(() => {
    if (!isNew) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── TRANSACTION CONFIRM CARD ─────────────────────────────────────────────────

function TxConfirmCard({
  tx,
  colors,
  isDark,
}: {
  tx: TxData;
  colors: any;
  isDark: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const isExpense = tx.txType === 'expense';
  const amountColor = isExpense ? '#EF4444' : '#22C55E';
  const amountStr = `${isExpense ? '-' : '+'}₱${tx.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const cardBg = isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)';
  const borderCol = isDark ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.25)';

  return (
    <Animated.View
      style={{
        opacity: opacityAnim,
        transform: [{ scale: scaleAnim }],
        marginTop: 10,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: borderCol,
        borderRadius: 14,
        padding: 14,
        gap: 10,
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: '#22C55E',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
        </View>
        <Text
          style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 13,
            color: '#22C55E',
          }}
        >
          Transaction Logged
        </Text>
      </View>

      {/* Amount + name */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text
          style={{
            fontFamily: 'Inter_600SemiBold',
            fontSize: 14,
            color: colors.textPrimary,
            flex: 1,
            marginRight: 8,
          }}
        >
          {tx.displayName}
        </Text>
        <Text
          style={{
            fontFamily: 'DMMono_500Medium',
            fontSize: 15,
            color: amountColor,
          }}
        >
          {amountStr}
        </Text>
      </View>

      {/* Meta row */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.textSecondary }}>
            {tx.category}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.textSecondary }}>
            {tx.accountName}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── ACCOUNT PICKER MODAL ────────────────────────────────────────────────────

type AccountItem = { id: string; name: string; letter_avatar: string; brand_colour: string; balance: number };

function AccountPickerModal({
  visible,
  accounts,
  pendingTx,
  onSelect,
  onDismiss,
  colors,
  isDark,
  insetBottom,
}: {
  visible: boolean;
  accounts: AccountItem[];
  pendingTx: ChatTx | null;
  onSelect: (accountId: string) => void;
  onDismiss: () => void;
  colors: any;
  isDark: boolean;
  insetBottom: number;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 300, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible && slideAnim._value === 300) return null;

  const fmt = (n: number) =>
    n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      {/* Backdrop */}
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          opacity: backdropOpacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: Math.max(insetBottom, 24),
          transform: [{ translateY: slideAnim }],
          // iOS shadow
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          // Android
          elevation: 20,
        }}
      >
        {/* Handle */}
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: isDark ? '#444' : '#DDD',
            alignSelf: 'center',
            marginBottom: 20,
          }}
        />

        {/* Title */}
        <Text
          style={{
            fontFamily: 'Nunito_800ExtraBold',
            fontSize: 17,
            color: colors.textPrimary,
            marginBottom: 4,
          }}
        >
          Which account?
        </Text>
        {pendingTx && (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 13,
              color: colors.textSecondary,
              marginBottom: 20,
            }}
          >
            Logging{' '}
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.textPrimary }}>
              {pendingTx.displayName ?? 'transaction'}
            </Text>{' '}
            for{' '}
            <Text style={{ fontFamily: 'DMMono_500Medium', color: colors.expenseRed }}>
              ₱{pendingTx.amount?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) ?? '—'}
            </Text>
          </Text>
        )}

        {/* Account list */}
        <View style={{ gap: 10 }}>
          {accounts.map((acc) => (
            <TouchableOpacity
              key={acc.id}
              activeOpacity={0.75}
              onPress={() => onSelect(acc.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
                borderRadius: 14,
                padding: 14,
                gap: 14,
              }}
            >
              {/* Avatar */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: acc.brand_colour || colors.chatAILabel,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Nunito_800ExtraBold',
                    fontSize: 16,
                    color: '#fff',
                  }}
                >
                  {acc.letter_avatar || acc.name[0]}
                </Text>
              </View>

              {/* Name + balance */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 15,
                    color: colors.textPrimary,
                  }}
                >
                  {acc.name}
                </Text>
                <Text
                  style={{
                    fontFamily: 'DMMono_500Medium',
                    fontSize: 12,
                    color: colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  ₱{fmt(acc.balance)}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel */}
        <TouchableOpacity
          onPress={onDismiss}
          style={{
            marginTop: 16,
            alignItems: 'center',
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 14,
              color: colors.textSecondary,
            }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);

  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { totalBalance, accounts } = useAccounts();
  const { totalIncome, totalExpense: monthlySpent } = useMonthlyTotals();
  const { categories } = useCategories();
  const { categories: incomeCategories } = useIncomeCategories();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [recentTxns, setRecentTxns] = useState<RecentTx[]>([]);
  const [lastMsgId, setLastMsgId] = useState<string | null>(null);

  // Profile drawer (right) — same component HomeScreen uses.
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Live insight context for the offline brain: this month's spend grouped by
  // category + last month's total expense. Feeds the breakdown / compare / cut
  // suggestion prompts so they answer with real numbers.
  const [insight, setInsight] = useState<{
    topCategories: { name: string; amount: number }[];
    lastMonthSpent: number;
  }>({ topCategories: [], lastMonthSpent: 0 });

  // Streaming / typewriter state
  const [currentSteps, setCurrentSteps] = useState<string[]>(STEP_SETS.default);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const streamGenRef = useRef(0);

  // Transaction logging state
  const [pendingTx, setPendingTx] = useState<ChatTx | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // Keyboard state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Blinking cursor while streaming
  useEffect(() => {
    if (!streamingMsgId) return;
    const id = setInterval(() => setShowCursor((p) => !p), 500);
    return () => clearInterval(id);
  }, [streamingMsgId]);

  useEffect(() => {
    if (!userId) { setRecentTxns([]); return; }
    const query = database
      .get<TransactionModel>('transactions')
      .query(Q.where('user_id', userId), Q.sortBy('date', Q.desc), Q.take(10));
    const sub = query.observe().subscribe((records) => {
      setRecentTxns(
        records.map((r) => ({
          display_name: r.displayName ?? null,
          amount: r.amount,
          type: r.type,
          category: r.category ?? null,
          date: r.date,
        }))
      );
    });
    return () => sub.unsubscribe();
  }, [userId]);

  // Month-scoped aggregation for the insight prompts. Querying from the start
  // of last month lets one observer cover both this month's by-category
  // breakdown and last month's total. Mirrors useMonthlyTotals' transfer /
  // adjustment exclusions so the numbers line up with the rest of the app.
  useEffect(() => {
    if (!userId) {
      setInsight({ topCategories: [], lastMonthSpent: 0 });
      return undefined;
    }
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endOfThisMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ).toISOString();

    const query = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('date', Q.gte(startOfLastMonth)),
        Q.where('date', Q.lte(endOfThisMonth)),
        Q.where('account_deleted', false),
      );

    const sub = query
      .observeWithColumns(['amount', 'type', 'date', 'is_transfer', 'category'])
      .subscribe((records) => {
        const byCategory: Record<string, number> = {};
        let lastMonthSpent = 0;
        for (const tx of records) {
          if (tx.type !== 'expense') continue;
          const cat = (tx.category ?? '').toLowerCase();
          if (tx.isTransfer || cat === 'transfer' || cat === 'adjustment') {
            continue;
          }
          if (new Date(tx.date) >= startOfThisMonth) {
            const name = tx.category || 'Other';
            byCategory[name] = (byCategory[name] ?? 0) + tx.amount;
          } else {
            lastMonthSpent += tx.amount;
          }
        }
        const topCategories = Object.entries(byCategory)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount);
        setInsight({ topCategories, lastMonthSpent });
      });
    return () => sub.unsubscribe();
  }, [userId]);

  // Load the persisted (local-only) chat thread on mount / user change.
  useEffect(() => {
    if (!userId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    loadChatHistory(userId)
      .then((rows) => {
        if (!cancelled) setMessages(rows.map(rowToMessage));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const hasTransactions = recentTxns.length > 0 || monthlySpent > 0;
  const isSendDisabled = !inputText.trim() || isTyping;
  const profileInitial =
    (profile?.name ?? '').trim().charAt(0).toUpperCase() || 'U';

  // ─── LOG TRANSACTION ───────────────────────────────────────────────────────

  const doLogTransaction = async (tx: ChatTx, accountId: string) => {
    if (!userId) return;
    const account = accounts.find((a) => a.id === accountId);
    try {
      await createTransaction({
        userId,
        accountId,
        amount: tx.amount,
        type: tx.type,
        category: tx.category,
        displayName: tx.displayName,
        signalSource: 'description',
        date: new Date().toISOString(),
      });

      const confirmId = `tx-${Date.now()}`;
      const txData: TxData = {
        amount: tx.amount,
        displayName: tx.displayName ?? 'Transaction',
        category: tx.category ?? 'Other',
        accountName: account?.name ?? 'Account',
        txType: tx.type,
      };
      setMessages((prev) => [
        ...prev,
        { id: confirmId, type: 'ai', text: '', txData, timestamp: nowTime() },
      ]);
      setLastMsgId(confirmId);
      // Persist the confirmation card so it survives reopening the chat.
      saveChatMessage({
        userId,
        role: 'ai',
        text: '',
        payload: JSON.stringify({ txData }),
      }).catch(() => {});
    } catch (err) {
      console.error('[Fino AI] createTransaction error:', err);
    }
  };

  // ─── SEND MESSAGE ──────────────────────────────────────────────────────────

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride ?? inputText;
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    setInputText('');

    // Abort any in-flight stream so it stops updating streamingText
    streamGenRef.current += 1;
    setStreamingMsgId(null);
    setStreamingText('');

    const userMsgId = Date.now().toString();
    setMessages((prev) => [...prev, { id: userMsgId, type: 'user', text: trimmed, timestamp: nowTime() }]);
    setLastMsgId(userMsgId);
    if (userId) {
      saveChatMessage({ userId, role: 'user', text: trimmed }).catch(() => {});
    }

    // Offline transaction parse + log, using the same taxonomy the Add
    // Transaction sheet uses. Multi-amount inputs ("chicken 50 and rice 50")
    // sum into one transaction. This never touches the network.
    const parsed = parseChatTransaction(
      trimmed,
      accounts.map((a) => ({ id: a.id, name: a.name })),
      categoryNames,
      incomeCategories
    );

    // A parsed transaction is acknowledged by the green TxConfirmCard — logged
    // inline when the account is known, or after the account picker resolves.
    // No chat reply is generated in that case.
    if (parsed) {
      if (parsed.accountId) {
        await doLogTransaction(parsed, parsed.accountId);
      } else {
        setPendingTx(parsed);
        setShowAccountPicker(true);
      }
      return;
    }

    // Otherwise produce an offline reply via the local brain. A short delay
    // keeps the ThinkingSteps animation visible now that there's no network
    // latency to fill it.
    setCurrentSteps(pickSteps(trimmed));
    setIsTyping(true);

    const now = new Date();
    const brainCtx: BrainContext = {
      balance: totalBalance,
      income: totalIncome,
      spent: monthlySpent,
      lastMonthSpent: insight.lastMonthSpent,
      topCategories: insight.topCategories,
      dayOfMonth: now.getDate(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    };
    const reply = routeMessage(trimmed, brainCtx);
    await new Promise<void>((r) => setTimeout(r, 500 + Math.floor(Math.random() * 350)));

    setIsTyping(false);

    // Set streaming state BEFORE the message is added so the new bubble renders
    // blank from the first frame — otherwise the full text flashes for one
    // render before the typewriter "restarts" it at character 0.
    const aiMsgId = `ai-${Date.now()}`;
    const gen = ++streamGenRef.current;
    setStreamingMsgId(aiMsgId);
    setStreamingText('');
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, type: 'ai', text: reply.text, followUps: reply.followUps, timestamp: nowTime() },
    ]);
    setLastMsgId(aiMsgId);
    if (userId) {
      saveChatMessage({
        userId,
        role: 'ai',
        text: reply.text,
        payload: reply.followUps ? JSON.stringify({ followUps: reply.followUps }) : null,
      }).catch(() => {});
    }

    for (let i = 1; i <= reply.text.length; i++) {
      if (streamGenRef.current !== gen) break;
      await new Promise<void>((r) => setTimeout(r, i <= 3 ? 50 : 15));
      setStreamingText(reply.text.slice(0, i));
      scrollViewRef.current?.scrollToEnd({ animated: false });
    }

    // Flip streamingMsgId to null only — leave streamingText stale; the message
    // falls back to msg.text (the stored full reply).
    if (streamGenRef.current === gen) {
      setStreamingMsgId(null);
    }
  };

  const handleAccountSelected = async (accountId: string) => {
    setShowAccountPicker(false);
    if (pendingTx) {
      await doLogTransaction(pendingTx, accountId);
      setPendingTx(null);
    }
  };

  const handlePickerDismiss = () => {
    setShowAccountPicker(false);
    setPendingTx(null);
  };

  // ─── RENDER HELPERS ────────────────────────────────────────────────────────

  const renderEmptyGuard = () => (
    <View style={styles.emptyStateContainer}>
      <View style={styles.emptyIconWrap}>
        <Icon name="chat" size={48} color={colors.chatAILabel} />
      </View>
      <Text style={styles.emptyHeading}>Start your journey</Text>
      <Text style={styles.emptyBody}>
        Fino needs some data to work its magic. Log your first expense or income to get personalized insights.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} activeOpacity={0.8} onPress={() => navigation.navigate('AddTransaction', { mode: 'expense' })}>
        <Text style={styles.emptyBtnText}>Log your first expense</Text>
      </TouchableOpacity>
    </View>
  );

  // Gemini-style landing: shown when the user has data but no chat thread yet.
  // A calm greeting, a single subtle finance "glance", and four insight prompts
  // that route straight through handleSend (and the data-aware brain).
  const renderLanding = () => {
    const hour = new Date().getHours();
    const greet =
      hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = (profile?.name ?? '').trim().split(/\s+/)[0];
    const saved = Math.max(0, totalIncome - monthlySpent);
    const suggestions: {
      label: string;
      sub: string;
      prompt: string;
      icon: keyof typeof Ionicons.glyphMap;
      tint: string;
    }[] = [
      {
        label: 'Spending breakdown',
        sub: 'See this month by category',
        prompt: 'Give me a spending breakdown for this month',
        icon: 'bar-chart-outline',
        tint: '#3A7BD5',
      },
      {
        label: 'Compare to last month',
        sub: 'Am I up or down vs last month?',
        prompt: 'How does my spending compare to last month?',
        icon: 'swap-horizontal-outline',
        tint: colors.chatAILabel,
      },
      {
        label: 'Where can I cut?',
        sub: 'Find easy wins to trim',
        prompt: 'Where can I cut back this month?',
        icon: 'cut-outline',
        tint: colors.expenseRed,
      },
      {
        label: 'Savings forecast',
        sub: "Where you'll land this month",
        prompt: "What's my savings forecast for this month?",
        icon: 'trending-up-outline',
        tint: colors.primary,
      },
    ];

    return (
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.landingScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.landingSpacer} />

        <Text style={styles.landingEyebrow}>
          {greet}
          {firstName ? `, ${firstName}` : ''}
        </Text>
        <Text style={styles.landingTitle}>What can I{'\n'}help you with?</Text>

        <TouchableOpacity
          style={styles.glance}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Tabs', { screen: 'stats' })}
        >
          <View style={styles.glanceDot} />
          <Text style={styles.glanceAmt}>
            ₱{totalBalance.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
          </Text>
          {saved > 0 ? (
            <>
              <Text style={styles.glanceSep}>·</Text>
              <Text style={styles.glanceSave}>
                saving ₱{saved.toLocaleString('en-PH', { maximumFractionDigits: 0 })} this month
              </Text>
            </>
          ) : null}
          <Ionicons
            name="chevron-forward"
            size={15}
            color={colors.textSecondary}
            style={{ marginLeft: 2 }}
          />
        </TouchableOpacity>

        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s.prompt}
              style={styles.suggCard}
              activeOpacity={0.8}
              onPress={() => handleSend(s.prompt)}
            >
              <View style={[styles.suggTile, { backgroundColor: `${s.tint}22` }]}>
                <Ionicons name={s.icon} size={18} color={s.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggLabel}>{s.label}</Text>
                <Text style={styles.suggSub}>{s.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.landingSpacer} />
      </ScrollView>
    );
  };

  const renderMessage = (msg: Message) => {
    const isNew = msg.id === lastMsgId;
    const isStreaming = msg.id === streamingMsgId;
    const displayText = isStreaming ? streamingText : msg.text;

    if (msg.type === 'user') {
      return (
        <AnimatedMessage key={msg.id} isNew={isNew}>
          <View style={styles.userMsgWrapper}>
            <View style={styles.userBubble}>
              <Text style={styles.userText}>{msg.text}</Text>
            </View>
            <Text style={styles.timestampUser}>{msg.timestamp}</Text>
          </View>
        </AnimatedMessage>
      );
    }

    return (
      <AnimatedMessage key={msg.id} isNew={isNew}>
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}>
            <FinoIntelIcon size={15} color="#fff" />
          </View>

          <View style={styles.aiMsgWrapper}>
            <View style={styles.aiBubble}>
              <Text style={styles.aiLabelText}>Fino</Text>

              {displayText ? (
                <Text style={styles.aiText}>
                  {displayText}
                  {isStreaming ? (showCursor ? '|' : ' ') : ''}
                </Text>
              ) : null}

              {/* Only show rich cards / tx card when not streaming */}
              {!isStreaming && msg.richData ? (
                <View style={styles.richCard}>
                  {msg.richData.map((row) => (
                    <View key={row.label} style={styles.richCardRow}>
                      <Text style={styles.richCardLabel}>{row.label}</Text>
                      <Text style={[styles.richCardValue, row.color ? { color: row.color } : undefined]}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {!isStreaming && msg.txData ? (
                <TxConfirmCard tx={msg.txData} colors={colors} isDark={isDark} />
              ) : null}
            </View>

            {!isStreaming && <Text style={styles.timestampAi}>{msg.timestamp}</Text>}

            {!isStreaming && msg.followUps ? (
              <View style={styles.followupWrapper}>
                {msg.followUps.map((prompt) => (
                  <TouchableOpacity key={prompt} style={styles.followupChip} onPress={() => handleSend(prompt)}>
                    <Text style={styles.followupChipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </AnimatedMessage>
    );
  };

  const renderBody = () => {
    if (!hasTransactions) return renderEmptyGuard();
    if (messages.length === 0) return renderLanding();
    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.bodyScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.map(renderMessage)}
        {isTyping ? <ThinkingSteps steps={currentSteps} colors={colors} isDark={isDark} /> : null}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* The composer rides above the keyboard. This screen is a native-stack
          'modal', whose window does NOT resize for the keyboard — so the KAV
          has to do the lifting. We use 'padding' (not 'height'): it lifts the
          composer the same way, but collapses back to 0 cleanly on retract,
          where 'height' left a stale gap below the bar. The body below is
          flex:1 so it absorbs the lift and the composer stays pinned. */}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior="padding"
      >
        {/* ─── HEADER ─── */}
        <View style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerWordmarkWrap}>
            <Text style={styles.headerWordmark}>Fino</Text>
          </View>

          <TouchableOpacity
            style={styles.profileBtn}
            activeOpacity={0.8}
            onPress={() => setSidebarVisible(true)}
            hitSlop={6}
          >
            <Text style={styles.profileInitial}>{profileInitial}</Text>
          </TouchableOpacity>
        </View>

        {renderBody()}

        <View
          style={[
            styles.inputContainer,
            { paddingBottom: isKeyboardVisible ? 14 : Math.max(insets.bottom, 14) },
          ]}
        >
          <View style={styles.composerInner}>
            <TextInput
              style={styles.inputField}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask or log a transaction…"
              placeholderTextColor={colors.textSecondary}
              editable
              multiline
              maxLength={200}
            />
            <View style={styles.composerToolbar}>
              <TouchableOpacity
                style={styles.composerIconBtn}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ScreenshotScreen')}
                hitSlop={6}
              >
                <Ionicons name="add" size={22} color={colors.textSecondary} />
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleSend()}
                disabled={isSendDisabled}
              >
                {isSendDisabled ? (
                  <View style={[styles.sendBtn, styles.sendBtnDisabled]}>
                    <Ionicons name="arrow-up" size={18} color={colors.textSecondary} />
                  </View>
                ) : (
                  <LinearGradient
                    colors={['#7C65C8', '#4B2DA3']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendBtn}
                  >
                    <Ionicons name="arrow-up" size={18} color="#FFF" />
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ─── ACCOUNT PICKER ─── */}
      <AccountPickerModal
        visible={showAccountPicker}
        accounts={accounts as AccountItem[]}
        pendingTx={pendingTx}
        onSelect={handleAccountSelected}
        onDismiss={handlePickerDismiss}
        colors={colors}
        isDark={isDark}
        insetBottom={insets.bottom}
      />

      {/* ─── PROFILE DRAWER ─── */}
      <ProfileSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />
    </View>
  );
}

// ─── DYNAMIC STYLES ───────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: spacing.screenPadding,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333333' : 'rgba(0,0,0,0.05)',
      backgroundColor: colors.background,
    },
    backBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -4,
    },
    headerWordmarkWrap: { flex: 1, alignItems: 'center' },
    headerWordmark: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 17,
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    profileBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileInitial: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 15,
      color: '#FFF',
    },
    bodyScroll: { flex: 1 },
    scrollContent: { padding: spacing.screenPadding, paddingBottom: 24 },
    emptyStateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyIconWrap: { marginBottom: 16 },
    emptyHeading: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.chatAILabel, marginBottom: 12 },
    emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    emptyBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16 },
    emptyBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFF' },
    aiRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 20,
      maxWidth: '85%',
    },
    aiAvatar: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: colors.chatAILabel,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    aiMsgWrapper: { flex: 1, alignItems: 'flex-start' },
    aiBubble: {
      backgroundColor: colors.chatAIBubbleBg,
      borderWidth: 0.5,
      borderColor: colors.chatAIBubbleBorder,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      padding: 14,
    },
    aiLabelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.chatAILabel,
      marginBottom: 6,
    },
    aiText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.chatAIText, lineHeight: 20 },
    timestampAi: { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.textSecondary, marginTop: 6, marginLeft: 4 },
    userMsgWrapper: { alignItems: 'flex-end', marginBottom: 20 },
    userBubble: {
      backgroundColor: colors.chatUserBg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      padding: 14,
      maxWidth: '80%',
    },
    userText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#FFF', lineHeight: 20 },
    timestampUser: { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.textSecondary, marginTop: 6, marginRight: 4 },
    richCard: { backgroundColor: colors.white, borderRadius: 12, padding: 12, marginTop: 12, gap: 8 },
    richCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    richCardLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textSecondary },
    richCardValue: { fontFamily: 'DMMono_500Medium', fontSize: 14, color: colors.textPrimary },

    // ─── Landing (Gemini-style empty thread) ───
    landingScroll: {
      flexGrow: 1,
      paddingHorizontal: spacing.screenPadding,
      paddingBottom: 12,
    },
    landingSpacer: { flex: 1, minHeight: 12 },
    landingEyebrow: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.chatAILabel,
      marginBottom: 8,
    },
    landingTitle: {
      fontFamily: 'Nunito_900Black',
      fontSize: 34,
      lineHeight: 38,
      letterSpacing: -0.8,
      color: colors.textPrimary,
    },
    glance: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      marginTop: 18,
      backgroundColor: colors.surfaceSubdued,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    glanceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.incomeGreen },
    glanceAmt: { fontFamily: 'DMMono_500Medium', fontSize: 13, color: colors.textPrimary },
    glanceSep: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary },
    glanceSave: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.incomeGreen },
    suggestions: { marginTop: 26, gap: 11 },
    suggCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingVertical: 13,
      paddingHorizontal: 15,
    },
    suggTile: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suggLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: colors.textPrimary },
    suggSub: { fontFamily: 'Inter_500Medium', fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },

    followupWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    followupChip: {
      backgroundColor: colors.chatAIBubbleBg,
      borderWidth: 1,
      borderColor: colors.chatAIBubbleBorder,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    followupChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.chatAILabel },
    inputContainer: {
      backgroundColor: colors.background,
      paddingHorizontal: spacing.screenPadding,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333333' : 'rgba(0,0,0,0.05)',
    },
    composerInner: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      paddingHorizontal: 6,
      paddingTop: 4,
      paddingBottom: 6,
    },
    inputField: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.textPrimary,
      maxHeight: 96,
      minHeight: 24,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
    },
    composerToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 4,
    },
    composerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceSubdued,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: isDark ? '#2A2A30' : '#ECEAF2' },
  });
