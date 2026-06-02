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
import { Ionicons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { FinoIntelIcon } from '../components/icons/FinoIntelIcon';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  sendMessage,
  ChatMessage,
  UserFinancialContext,
  DetectedTransaction,
} from '@/services/gemini';
import { createTransaction } from '@/services/localMutations';
import { useAccounts } from '@/hooks/useAccounts';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { useCategories } from '@/hooks/useCategories';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import { getInsights, type Insights } from '@/services/IntelligenceEngine';
import { useIncomeCategories } from '@/hooks/useIncomeCategories';
import { parseChatTransaction } from '@/services/parseChatTransaction';

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

type HeroData = {
  greeting: string;
  title: string;
  balance: number;
  spent: number;
  income: number;
};

type Message = {
  id: string;
  type: 'ai' | 'user';
  text: string;
  richData?: RichRow[];
  heroData?: HeroData;
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
  pendingTx: DetectedTransaction | null;
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
  const { user } = useAuth();
  const userId = user?.id;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { totalBalance, accounts } = useAccounts();
  const { totalIncome, totalExpense: monthlySpent } = useMonthlyTotals();
  const { categories } = useCategories();
  const { categories: incomeCategories } = useIncomeCategories();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [geminiHistory, setGeminiHistory] = useState<ChatMessage[]>([]);
  const [recentTxns, setRecentTxns] = useState<RecentTx[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [lastMsgId, setLastMsgId] = useState<string | null>(null);

  // Streaming / typewriter state
  const [currentSteps, setCurrentSteps] = useState<string[]>(STEP_SETS.default);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const streamGenRef = useRef(0);

  // Transaction logging state
  const [pendingTx, setPendingTx] = useState<DetectedTransaction | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // Keyboard state
  const [headerHeight, setHeaderHeight] = useState(0);
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

  useEffect(() => {
    if (!userId) return;
    const today = new Date();
    getInsights(userId, today.getFullYear(), today.getMonth())
      .then(setInsights)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const hour = new Date().getHours();
    const greet =
      hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const saved = Math.max(0, totalIncome - monthlySpent);
    const title =
      saved > 0
        ? `You're saving ₱${saved.toLocaleString('en-PH', { maximumFractionDigits: 0 })} this month`
        : "Here's your snapshot this month";

    setMessages([
      {
        id: 'msg-welcome',
        type: 'ai',
        text: '',
        heroData: {
          greeting: `${greet} 👋`,
          title,
          balance: totalBalance,
          spent: monthlySpent,
          income: totalIncome,
        },
        timestamp: nowTime(),
      },
    ]);
  }, [monthlySpent, totalIncome, totalBalance]);

  const financialContext = useMemo<UserFinancialContext>(() => {
    const totalBudget = categories.reduce((sum, c) => sum + (c.budget_limit ?? 0), 0);
    return {
      totalBalance,
      monthlyIncome: totalIncome,
      monthlySpent,
      totalBudget: totalBudget > 0 ? totalBudget : null,
      categoryBreakdown: categories.map((c) => ({ name: c.name, spent: c.spent, budget: c.budget_limit ?? null })),
      recentTransactions: recentTxns,
      anomalies: insights?.anomalies,
      trajectory: insights?.trajectory,
      recurringBills: insights?.recurring.slice(0, 5).map((r) => ({ merchant: r.merchant, amount: r.amount, daysUntilNext: r.daysUntilNext })),
      habits: insights?.habits.map((h) => ({ merchant: h.merchant, visitsPerMonth: h.visitsPerMonth, avgAmount: h.avgAmount, monthlySpend: h.monthlySpend })),
      coachMessage: insights?.coach,
      weekDeltas: insights?.weekDeltas,
    };
  }, [totalBalance, totalIncome, monthlySpent, categories, recentTxns, insights]);

  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const hasTransactions = recentTxns.length > 0 || monthlySpent > 0;
  const isSendDisabled = !inputText.trim() || isTyping;

  // ─── LOG TRANSACTION ───────────────────────────────────────────────────────

  const doLogTransaction = async (tx: DetectedTransaction, accountId: string) => {
    if (!userId || tx.amount == null) return;
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
      setMessages((prev) => [
        ...prev,
        {
          id: confirmId,
          type: 'ai',
          text: '',
          txData: {
            amount: tx.amount!,
            displayName: tx.displayName ?? 'Transaction',
            category: tx.category ?? 'Other',
            accountName: account?.name ?? 'Account',
            txType: tx.type,
          },
          timestamp: nowTime(),
        },
      ]);
      setLastMsgId(confirmId);
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

    // Parse transaction synchronously using the same offline taxonomy the
    // Add Transaction sheet uses. Multi-amount inputs ("chicken 50 and rice
    // 50") sum into a single transaction with a structured display name.
    const parsed = parseChatTransaction(
      trimmed,
      accounts.map((a) => ({ id: a.id, name: a.name })),
      categoryNames,
      incomeCategories
    );

    // Log the transaction up front — the offline parser is the source of
    // truth, so logging must succeed even when the LLM round-trip fails
    // (e.g. Gemini free-tier quota errors).
    if (parsed) {
      const tx: DetectedTransaction = {
        isTransaction: true,
        amount: parsed.amount,
        displayName: parsed.displayName,
        category: parsed.category,
        type: parsed.type,
        accountHint: null,
      };
      if (parsed.accountId) {
        await doLogTransaction(tx, parsed.accountId);
      } else {
        setPendingTx(tx);
        setShowAccountPicker(true);
      }
    }

    // Pick context-aware steps and show thinking indicator
    setCurrentSteps(pickSteps(trimmed));
    setIsTyping(true);

    try {
      const reply = await sendMessage(trimmed, geminiHistory, financialContext);

      setGeminiHistory((prev) => [
        ...prev,
        { role: 'user', text: trimmed },
        { role: 'model', text: reply },
      ]);

      setIsTyping(false);

      // Set streaming state BEFORE the message is added so the new bubble
      // renders blank from the first frame — otherwise the full text flashes
      // for one render (msg.text=reply, streamingMsgId still stale) before
      // the typewriter "restarts" it at character 0, which reads as the
      // reply disappearing.
      const aiMsgId = `ai-${Date.now()}`;
      const gen = ++streamGenRef.current;
      setStreamingMsgId(aiMsgId);
      setStreamingText('');
      setMessages((prev) => [...prev, { id: aiMsgId, type: 'ai', text: reply, timestamp: nowTime() }]);
      setLastMsgId(aiMsgId);

      for (let i = 1; i <= reply.length; i++) {
        if (streamGenRef.current !== gen) break;
        await new Promise<void>((r) => setTimeout(r, i <= 3 ? 50 : 15));
        setStreamingText(reply.slice(0, i));
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }

      // Flip streamingMsgId to null only — leave streamingText stale. The
      // message falls back to msg.text (the stored full reply). Clearing
      // streamingText here would race with the streamingMsgId flip in some
      // batch orderings and could leave the bubble blank.
      if (streamGenRef.current === gen) {
        setStreamingMsgId(null);
      }
    } catch (err) {
      console.error('[Fino AI] handleSend error:', err);
      setIsTyping(false);

      // Gemini free-tier 429s should not look like a "something broke" error
      // — and if we already logged a transaction, the user still deserves an
      // acknowledgement that mentions what was recorded.
      const message = String((err as { message?: unknown })?.message ?? err ?? '');
      const isQuota = /429|quota|rate.?limit/i.test(message);

      let fallbackText: string;
      if (parsed) {
        const sign = parsed.type === 'expense' ? '-' : '+';
        const amt = parsed.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 });
        fallbackText = `Got it — logged ${parsed.displayName} (${sign}₱${amt}). 🧾`;
      } else if (isQuota) {
        fallbackText = "I'm at my AI usage limit right now. Try again in a minute.";
      } else {
        fallbackText = 'Something went wrong. Please try again.';
      }

      const errId = `err-${Date.now()}`;
      setMessages((prev) => [...prev, { id: errId, type: 'ai', text: fallbackText, timestamp: nowTime() }]);
      setLastMsgId(errId);
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
        <View style={styles.aiMsgWrapper}>
          <View style={styles.aiBubble}>
            <View style={styles.aiLabelRow}>
              <View style={styles.aiIconBox}>
                <FinoIntelIcon size={10} color="#fff" />
              </View>
              <Text style={styles.aiLabelText}>Fino</Text>
            </View>

            {displayText ? (
              <Text style={styles.aiText}>
                {displayText}
                {isStreaming ? (showCursor ? '|' : ' ') : ''}
              </Text>
            ) : null}

            {!isStreaming && msg.heroData ? (
              <View style={styles.heroCard}>
                <Text style={styles.heroGreet}>{msg.heroData.greeting}</Text>
                <Text style={styles.heroTitle}>{msg.heroData.title}</Text>
                <View style={styles.heroRow}>
                  <View style={styles.heroCol}>
                    <Text style={styles.heroColLabel}>Balance</Text>
                    <Text style={styles.heroColValue}>
                      ₱{msg.heroData.balance.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={[styles.heroCol, styles.heroColDivided]}>
                    <Text style={styles.heroColLabel}>Spent</Text>
                    <Text style={[styles.heroColValue, { color: '#FFB4A8' }]}>
                      ₱{msg.heroData.spent.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={[styles.heroCol, styles.heroColDivided]}>
                    <Text style={styles.heroColLabel}>Income</Text>
                    <Text style={[styles.heroColValue, { color: '#9DEAB1' }]}>
                      ₱{msg.heroData.income.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                </View>
              </View>
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
      </AnimatedMessage>
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── HEADER ─── */}
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 12) }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <FinoIntelIcon size={22} color="#fff" filled />
          <View style={[styles.avatarStatusDot, { backgroundColor: isTyping ? '#F59E0B' : '#22C55E' }]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>Fino AI</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {isTyping ? 'Thinking…' : 'Online · Knows your finances'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerActionBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Tabs', { screen: 'stats' })}
          hitSlop={6}
        >
          <Ionicons name="stats-chart-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ─── STATS STRIP ─── */}
      {hasTransactions ? (
        <View style={styles.statsStrip}>
          <TouchableOpacity
            style={styles.statCell}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Tabs', { screen: 'stats' })}
          >
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={[styles.statValue, { color: colors.incomeGreen }]}>
              ₱{totalBalance.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.statSub}>Across {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statCell, styles.statCellDivided]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Tabs', { screen: 'stats' })}
          >
            <Text style={styles.statLabel}>Spent</Text>
            <Text style={[styles.statValue, { color: colors.expenseRed }]}>
              ₱{monthlySpent.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.statSub}>This month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statCell, styles.statCellDivided]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Tabs', { screen: 'stats' })}
          >
            <Text style={styles.statLabel}>Income</Text>
            <Text style={[styles.statValue, { color: colors.incomeGreen }]}>
              ₱{totalIncome.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.statSub}>This month</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ─── KEYBOARD AVOIDING VIEW ─── */}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        {!hasTransactions ? (
          renderEmptyGuard()
        ) : (
          <ScrollView
            ref={scrollViewRef}
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
        )}

        <View
          style={[
            styles.inputContainer,
            { paddingBottom: isKeyboardVisible ? 16 : Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.inputField}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask or log a transaction..."
              placeholderTextColor={colors.textSecondary}
              editable
              multiline
              maxLength={200}
            />
            <TouchableOpacity
              style={[styles.sendBtn, isSendDisabled ? styles.sendBtnDisabled : undefined]}
              onPress={() => handleSend()}
              disabled={isSendDisabled}
            >
              <Ionicons name="arrow-up" size={18} color="#FFF" />
            </TouchableOpacity>
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
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.chatAILabel,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    avatarStatusDot: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 11,
      height: 11,
      borderRadius: 5.5,
      borderWidth: 2,
      borderColor: colors.background,
    },
    headerInfo: { flex: 1, minWidth: 0 },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 16,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    headerActionBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surfaceSubdued,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: { padding: spacing.screenPadding, paddingBottom: 24 },
    emptyStateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyIconWrap: { marginBottom: 16 },
    emptyHeading: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.chatAILabel, marginBottom: 12 },
    emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    emptyBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16 },
    emptyBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFF' },
    aiMsgWrapper: { alignItems: 'flex-start', marginBottom: 20, maxWidth: '85%' },
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
    aiLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
    aiIconBox: {
      width: 16,
      height: 16,
      borderRadius: 4,
      backgroundColor: colors.chatAILabel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiLabelText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.chatAILabel },
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

    // ─── Hero welcome card (in chat) ───
    heroCard: {
      marginTop: 12,
      backgroundColor: colors.heroCardBg,
      borderRadius: 22,
      padding: 18,
      overflow: 'hidden',
    },
    heroGreet: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.heroSub ?? 'rgba(255,255,255,0.7)',
      marginBottom: 4,
    },
    heroTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 18,
      color: colors.heroOn ?? '#FFF',
      letterSpacing: -0.3,
      lineHeight: 23,
      marginBottom: 14,
    },
    heroRow: {
      flexDirection: 'row',
      backgroundColor: colors.blackTransparent15 ?? 'rgba(0,0,0,0.15)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.whiteTransparent12 ?? 'rgba(255,255,255,0.12)',
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    heroCol: { flex: 1, paddingHorizontal: 10 },
    heroColDivided: {
      borderLeftWidth: 1,
      borderLeftColor: colors.whiteTransparent12 ?? 'rgba(255,255,255,0.12)',
    },
    heroColLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.6,
      color: colors.heroSub ?? 'rgba(255,255,255,0.55)',
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    heroColValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      color: colors.heroOn ?? '#FFF',
    },

    // ─── Stats strip (below header) ───
    statsStrip: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333' : 'rgba(0,0,0,0.05)',
    },
    statCell: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    statCellDivided: {
      borderLeftWidth: 1,
      borderLeftColor: isDark ? '#222' : 'rgba(0,0,0,0.05)',
    },
    statLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.6,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    statValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 13,
      color: colors.textPrimary,
    },
    statSub: {
      fontFamily: 'Inter_500Medium',
      fontSize: 9,
      color: colors.textSecondary,
      marginTop: 1,
    },

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
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333333' : 'rgba(0,0,0,0.05)',
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.white,
      borderWidth: 1.5,
      borderColor: colors.chatAIBubbleBorder,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    inputField: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.textPrimary,
      maxHeight: 100,
      minHeight: 24,
      paddingTop: 8,
      paddingBottom: 8,
    },
    sendBtn: {
      width: 32,
      height: 32,
      borderRadius: 12,
      backgroundColor: colors.chatAILabel,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      marginBottom: 4,
    },
    sendBtnDisabled: { backgroundColor: isDark ? '#333333' : '#DCDAE8' },
  });
