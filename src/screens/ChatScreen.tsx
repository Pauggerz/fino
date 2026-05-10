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
  detectTransaction,
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

const DEFAULT_PROMPTS = [
  'Summarize my month',
  'How much did I spend on food?',
  'What is my biggest expense?',
  'Did I get paid yet?',
];

const THINKING_PHRASES = [
  'Analysing your finances',
  'Crunching the numbers',
  'Reviewing your spending',
  'Checking your budget',
  'Looking at your data',
  'Thinking it through',
  'Scanning transactions',
  'Calculating patterns',
];

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

// ─── THINKING BUBBLE ────────────────────────────────────────────────────────

function ThinkingBubble({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const fadePhrase = useRef(new Animated.Value(1)).current;
  const dot1Y = useRef(new Animated.Value(0)).current;
  const dot2Y = useRef(new Animated.Value(0)).current;
  const dot3Y = useRef(new Animated.Value(0)).current;
  const dot1O = useRef(new Animated.Value(0.4)).current;
  const dot2O = useRef(new Animated.Value(0.4)).current;
  const dot3O = useRef(new Animated.Value(0.4)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const bounceDot = (y: Animated.Value, o: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(y, { toValue: -7, duration: 280, useNativeDriver: true }),
            Animated.timing(o, { toValue: 1, duration: 280, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(y, { toValue: 0, duration: 280, useNativeDriver: true }),
            Animated.timing(o, { toValue: 0.4, duration: 280, useNativeDriver: true }),
          ]),
          Animated.delay(600),
        ])
      );

    bounceDot(dot1Y, dot1O, 0).start();
    bounceDot(dot2Y, dot2O, 160).start();
    bounceDot(dot3Y, dot3O, 320).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    const interval = setInterval(() => {
      Animated.timing(fadePhrase, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setPhraseIndex((prev) => (prev + 1) % THINKING_PHRASES.length);
        Animated.timing(fadePhrase, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 2200);

    return () => clearInterval(interval);
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
          padding: 14,
          minWidth: 160,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 7 }}>
          <View style={{ position: 'relative', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={{
                position: 'absolute',
                width: 20,
                height: 20,
                borderRadius: 6,
                backgroundColor: colors.chatAILabel,
                opacity: 0.25,
                transform: [{ scale: pulseAnim }],
              }}
            />
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                backgroundColor: colors.chatAILabel,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FinoIntelIcon size={10} color="#fff" />
            </View>
          </View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.chatAILabel }}>
            Fino
          </Text>
        </View>

        <Animated.Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            color: colors.textSecondary,
            marginBottom: 12,
            opacity: fadePhrase,
          }}
        >
          {THINKING_PHRASES[phraseIndex]}...
        </Animated.Text>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 16 }}>
          {[
            { y: dot1Y, o: dot1O },
            { y: dot2Y, o: dot2O },
            { y: dot3Y, o: dot3O },
          ].map((d, i) => (
            <Animated.View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.chatAILabel,
                transform: [{ translateY: d.y }],
                opacity: d.o,
              }}
            />
          ))}
        </View>
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

// ─── HEADER STATUS DOT ───────────────────────────────────────────────────────

function StatusDot({ isTyping }: { isTyping: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.6, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      dotOpacity.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(dotOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isTyping]);

  const dotColor = isTyping ? '#F59E0B' : '#22C55E';

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: dotColor,
          opacity: 0.35,
          transform: [{ scale: pulse }],
        }}
      />
      <Animated.View
        style={{
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: dotColor,
          opacity: dotOpacity,
        }}
      />
    </View>
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [showPrompts, setShowPrompts] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [geminiHistory, setGeminiHistory] = useState<ChatMessage[]>([]);
  const [recentTxns, setRecentTxns] = useState<RecentTx[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [lastMsgId, setLastMsgId] = useState<string | null>(null);

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
    setMessages([
      {
        id: 'msg-welcome',
        type: 'ai',
        text: "Hi! Here's your financial snapshot this month:",
        richData: [
          { label: 'Spent this month', value: `₱${monthlySpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, color: colors.expenseRed },
          { label: 'Income this month', value: `₱${totalIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, color: colors.incomeGreen },
          { label: 'Total balance', value: `₱${totalBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, color: colors.textPrimary },
        ],
        timestamp: nowTime(),
      },
    ]);
  }, [monthlySpent, totalIncome, totalBalance, colors]);

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

  const suggestedPrompts = useMemo(() => {
    const prompts: string[] = [];
    if (insights?.anomalies?.[0]) prompts.push(`Why is my ${insights.anomalies[0].category} spending so high?`);
    if (insights?.trajectory?.pacingOver) prompts.push('How can I cut back this month?');
    if (insights?.recurring?.length) prompts.push('What bills are coming up?');
    if (insights?.habits?.[0]) prompts.push(`Am I overspending on ${insights.habits[0].merchant}?`);
    for (const d of DEFAULT_PROMPTS) {
      if (prompts.length >= 4) break;
      if (!prompts.includes(d)) prompts.push(d);
    }
    return prompts.slice(0, 4);
  }, [insights]);

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
    if (!textToSend.trim()) return;

    setShowPrompts(false);
    setInputText('');

    const userMsgId = Date.now().toString();
    setMessages((prev) => [...prev, { id: userMsgId, type: 'user', text: textToSend.trim(), timestamp: nowTime() }]);
    setLastMsgId(userMsgId);
    setIsTyping(true);

    try {
      // Run chat reply + transaction detection in parallel
      const [reply, detected] = await Promise.all([
        sendMessage(textToSend.trim(), geminiHistory, financialContext),
        detectTransaction(textToSend.trim(), categoryNames),
      ]);

      setGeminiHistory((prev) => [
        ...prev,
        { role: 'user', text: textToSend.trim() },
        { role: 'model', text: reply },
      ]);

      const aiMsgId = `ai-${Date.now()}`;
      setMessages((prev) => [...prev, { id: aiMsgId, type: 'ai', text: reply, timestamp: nowTime() }]);
      setLastMsgId(aiMsgId);

      // Handle detected transaction
      if (detected.isTransaction && detected.amount != null) {
        const hint = detected.accountHint?.toLowerCase() ?? '';
        const matched = hint
          ? accounts.find((a) => a.name.toLowerCase().includes(hint))
          : null;

        if (accounts.length === 1) {
          // Only one account — log it automatically
          await doLogTransaction(detected, accounts[0].id);
        } else if (matched) {
          // Account hint matched a user account — log automatically
          await doLogTransaction(detected, matched.id);
        } else {
          // Can't determine account — ask the user
          setPendingTx(detected);
          setShowAccountPicker(true);
        }
      }
    } catch (err) {
      console.error('[Fino AI] handleSend error:', err);
      const errId = `err-${Date.now()}`;
      setMessages((prev) => [...prev, { id: errId, type: 'ai', text: 'Something went wrong. Please try again.', timestamp: nowTime() }]);
      setLastMsgId(errId);
    } finally {
      setIsTyping(false);
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

  const renderSuggestedPrompts = () => {
    if (!showPrompts) return null;
    return (
      <View style={styles.suggestedContainer}>
        <Text style={styles.suggestedLabel}>TRY ASKING</Text>
        <View style={styles.suggestedChipsWrapper}>
          {suggestedPrompts.map((prompt) => (
            <TouchableOpacity key={prompt} style={styles.suggestedChip} onPress={() => handleSend(prompt)}>
              <Text style={styles.suggestedChipText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMessage = (msg: Message) => {
    const isNew = msg.id === lastMsgId;

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

            {msg.text ? <Text style={styles.aiText}>{msg.text}</Text> : null}

            {msg.richData ? (
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

            {msg.txData ? (
              <TxConfirmCard tx={msg.txData} colors={colors} isDark={isDark} />
            ) : null}
          </View>

          <Text style={styles.timestampAi}>{msg.timestamp}</Text>

          {msg.followUps ? (
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
        style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 16) }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerProfile}>
          <View style={styles.avatar}>
            <FinoIntelIcon size={26} color={colors.lavenderDark} filled />
          </View>
          <View>
            <Text style={styles.headerTitle}>Ask Fino</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <StatusDot isTyping={isTyping} />
              <Text style={styles.headerSubtitle}>
                {isTyping ? 'Thinking...' : 'AI Financial Assistant'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.backBtn} />
      </View>

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
            {isTyping ? <ThinkingBubble colors={colors} isDark={isDark} /> : null}
            {renderSuggestedPrompts()}
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
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screenPadding,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333333' : 'rgba(0,0,0,0.05)',
      backgroundColor: colors.background,
    },
    backBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
    headerProfile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.chatAILabel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16, color: colors.chatAILabel },
    headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary },
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
    suggestedContainer: { marginTop: 10, marginBottom: 20 },
    suggestedLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, color: colors.chatAILabel, letterSpacing: 0.5, marginBottom: 10, marginLeft: 4 },
    suggestedChipsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    suggestedChip: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#DCDAE8',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    suggestedChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.chatAILabel },
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
