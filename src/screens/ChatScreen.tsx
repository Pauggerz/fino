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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { Icon } from '../components/icons/Icon';
import { FinoIntelIcon } from '../components/icons/FinoIntelIcon';
import ProfileSidebar from '../components/ProfileSidebar';
import {
  AccountPickerModal,
  type AccountItem,
} from '../components/AccountPickerModal';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  createTransaction,
  updateTransaction,
  updateCategory,
  deleteTransaction,
  saveTransfer,
} from '@/services/localMutations';
import { useAccounts } from '@/hooks/useAccounts';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { useCategories } from '@/hooks/useCategories';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import type RecurringIncomeModel from '@/db/models/RecurringIncome';
import type RecurringBillModel from '@/db/models/RecurringBill';
import type DebtModel from '@/db/models/Debt';
import type ChatMessageModel from '@/db/models/ChatMessage';
import { useIncomeCategories } from '@/hooks/useIncomeCategories';
import {
  parseChatTransaction,
  routeMessage,
  selectProactiveCoach,
  looksLikeQuestion,
  looksLikeCommand,
  type ChatTx,
  type BrainContext,
  type BrainResponseMeta,
  type ChatCard,
  type CardAction,
  type BrainMutation,
  type TxLite,
  type RecurringBillLite,
  type ConversationMemory,
} from '@/intelligence';
import { getInsights, type Insights } from '@/services/IntelligenceEngine';
import { ChatCardView, Reveal, REVEAL_STAGGER_MS } from '@/components/chat';
import { saveChatMessage, loadChatHistory } from '@/services/chatMutations';
import { recordBrainMiss } from '@/services/brainTelemetry';
import { requestBrainAssist } from '@/intelligence/assist/assistClient';
import { getAssistEnabled } from '@/services/assistPrefs';

/** Each "working" step (Fetching → Analyzing → Generating) holds for this long
 *  before the next one lights up; the parent waits steps×this so the indicator
 *  lands on the final step exactly as the (already-computed) reply swaps in.
 *  Mirrors the "Default" pace in docs/chat-timing-mockup.html. */
const WORK_STAGE_MS = 430;

const STEP_SETS: Record<string, string[]> = {
  spend: [
    'Fetching your transactions',
    'Calculating totals',
    'Identifying top categories',
  ],
  category: [
    'Fetching transactions',
    'Grouping by category',
    'Comparing to last month',
  ],
  budget: [
    'Loading spending history',
    'Running 3-month baseline',
    'Building recommendation',
  ],
  bills: [
    'Checking recurring bills',
    'Scanning upcoming due dates',
    'Mapping to accounts',
  ],
  save: [
    'Fetching income & expenses',
    'Calculating savings rate',
    'Comparing to your goal',
  ],
  income: [
    'Fetching income records',
    'Summing this month',
    'Checking vs last month',
  ],
  default: ['Fetching your data', 'Analyzing', 'Generating response'],
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

/** Intents whose "working" steps map to each STEP_SET. Driving the indicator off
 *  the brain's *resolved* intent keeps the steps honest (the old text-regex
 *  `pickSteps` drifted from the real answer); we fall back to the regex only
 *  when the intent is unknown (a fallback turn). */
const STEPS_BY_INTENT: Record<string, string[]> = {
  spend: STEP_SETS.spend,
  topCategory: STEP_SETS.spend,
  transactions: STEP_SETS.spend,
  typicalSpend: STEP_SETS.spend,
  explainSpend: STEP_SETS.spend,
  breakdown: STEP_SETS.category,
  compare: STEP_SETS.category,
  needsVsWants: STEP_SETS.category,
  dowPattern: STEP_SETS.category,
  incomeShare: STEP_SETS.category,
  monthPattern: STEP_SETS.category,
  trend: STEP_SETS.category,
  categoryOf: STEP_SETS.category,
  budgetStatus: STEP_SETS.budget,
  setBudget: STEP_SETS.budget,
  cut: STEP_SETS.budget,
  cutAmount: STEP_SETS.budget,
  overspend: STEP_SETS.budget,
  safeToSpend: STEP_SETS.budget,
  impulseTips: STEP_SETS.budget,
  ruleOfThumb: STEP_SETS.budget,
  billStatus: STEP_SETS.bills,
  upcomingBills: STEP_SETS.bills,
  subscriptionCut: STEP_SETS.bills,
  reminder: STEP_SETS.bills,
  savings: STEP_SETS.save,
  goalPlan: STEP_SETS.save,
  emergencyFund: STEP_SETS.save,
  improveSavings: STEP_SETS.save,
  runway: STEP_SETS.save,
  afford: STEP_SETS.save,
  bonusAdvice: STEP_SETS.save,
  income: STEP_SETS.income,
  salaryStatus: STEP_SETS.income,
  count: STEP_SETS.spend,
};

/** Steps for the brain's resolved intent, falling back to the text heuristic
 *  when the turn produced no intent (a fallback / clarify). */
function stepsForIntent(intent: string | null, text: string): string[] {
  return (intent && STEPS_BY_INTENT[intent]) || pickSteps(text);
}

/** Chit-chat / meta intents have no data to crunch, so they skip the staged
 *  "working" beat and answer instantly. `logClarify` (a purchase statement
 *  missing its amount) is a deterministic ask-back — a fake "analyzing your
 *  spending" beat would be dishonest there. */
const INSTANT_INTENTS = new Set(['greeting', 'thanks', 'help', 'logClarify']);

/** Extra "working" step shown while a low-confidence turn consults the online
 *  router (Phase C) — the honest indicator that this one went to the network. */
const ASSIST_STEPS = [
  'Checking my understanding online',
  'Re-reading your message',
  'Generating response',
];

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
  /** Typed graphical payload from the brain (FINO_CHATBOT_CARDS.md). Reply
   *  cards are snapshots: frozen into payload, never recomputed (§6). */
  card?: ChatCard;
  /** Reply-level action buttons under the bubble (V3 advice cards). */
  actions?: CardAction[];
  /** A proposed data change awaiting Confirm/Cancel. Deliberately NOT persisted
   *  (see handleSend), so a stale proposal can't be re-confirmed after reopen. */
  mutation?: BrainMutation;
  followUps?: string[];
  /** True when the online assist router shaped this reply (Phase C4) — the
   *  bubble is marked "used online help" so network-touched turns are always
   *  visibly distinct from pure-offline ones. Persisted in payload. */
  viaAssist?: boolean;
  timestamp: string;
  txData?: TxData;
};

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build a status-card ChatCard from legacy TxData so old persisted messages
 *  render with the same design as every other card. */
function txDataToCard(tx: TxData): ChatCard {
  const isExpense = tx.txType === 'expense';
  return {
    kind: 'status',
    data: {
      yes: true,
      status: 'good',
      title: 'Transaction Logged',
      message: `${isExpense ? '-' : '+'}₱${tx.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} — ${tx.displayName}`,
      tx: {
        id: '',
        name: tx.displayName,
        category: tx.category,
        amount: tx.amount,
        type: tx.txType,
        date: new Date().toISOString(),
      },
    },
  };
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
      // Migrate legacy txData → status card so old confirmations use the
      // unified card design instead of the removed TxConfirmCard.
      if (parsed.txData && !parsed.card) {
        base.card = txDataToCard(parsed.txData);
      }
      if (parsed.card) base.card = parsed.card;
      if (parsed.actions) base.actions = parsed.actions;
      if (parsed.followUps) base.followUps = parsed.followUps;
      if (parsed.viaAssist) base.viaAssist = true;
    } catch {
      // Corrupt payload — fall back to a plain text bubble.
    }
  }
  return base;
}

// ─── STEP ROW (single line inside ThinkingSteps) ────────────────────────────

type StepStatus = 'active' | 'done';

function StepRow({
  text,
  status,
  colors,
}: {
  text: string;
  status: StepStatus;
  colors: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    // Spin (always running; spinner view is only rendered when active)
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 750,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  useEffect(() => {
    if (status === 'done') {
      Animated.timing(opacity, {
        toValue: 0.42,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [status]);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 9, opacity }}
    >
      {status === 'done' ? (
        <Ionicons
          name="checkmark"
          size={13}
          color={colors.chatAILabel}
          style={{ width: 13 }}
        />
      ) : (
        <Animated.View
          style={{
            width: 13,
            height: 13,
            borderRadius: 7,
            borderWidth: 1.5,
            borderColor: `${colors.chatAILabel}30`,
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
        {text}
        {status === 'active' ? '…' : ''}
      </Text>
    </Animated.View>
  );
}

// ─── THINKING STEPS (replaces ThinkingBubble) ────────────────────────────────

function ThinkingSteps({
  steps,
  colors,
  isDark,
  stageMs = WORK_STAGE_MS,
}: {
  steps: string[];
  colors: any;
  isDark: boolean;
  stageMs?: number;
}) {
  // statuses grows from ['active'] as steps complete
  const [statuses, setStatuses] = useState<StepStatus[]>(['active']);

  useEffect(() => {
    if (steps.length <= 1) return undefined;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Advance one step per `stageMs` (deterministic, so the beat matches the
    // parent's steps×stageMs wait). The last step stays 'active' until the
    // parent unmounts this on the reply.
    steps.slice(0, -1).forEach((_, i) => {
      timeouts.push(
        setTimeout(
          () => {
            setStatuses((prev) => {
              const next = [...prev];
              next[i] = 'done';
              next.push('active');
              return next;
            });
          },
          (i + 1) * stageMs
        )
      );
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const bubbleBg = isDark ? 'rgba(124,101,200,0.12)' : 'rgba(124,101,200,0.07)';
  const borderColor = isDark
    ? 'rgba(124,101,200,0.35)'
    : 'rgba(124,101,200,0.2)';

  return (
    <View
      style={{ alignItems: 'flex-start', marginBottom: 20, maxWidth: '85%' }}
    >
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
          <StepRow
            key={i}
            text={steps[i] ?? ''}
            status={status}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

// ─── ANIMATED MESSAGE WRAPPER ────────────────────────────────────────────────

function AnimatedMessage({
  children,
  isNew,
}: {
  children: React.ReactNode;
  isNew?: boolean;
}) {
  const opacity = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(isNew ? 12 : 0)).current;

  useEffect(() => {
    if (!isNew) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// TxConfirmCard removed — transaction confirmations now use the unified
// `status` card rendered by ChatCardView, matching all other card designs.

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);

  const { colors, isDark } = useTheme();
  const { currentUserId, profile } = useAuth();
  const userId = currentUserId;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { totalBalance, accounts } = useAccounts();
  const { totalIncome, totalExpense: monthlySpent } = useMonthlyTotals();
  const { categories } = useCategories();
  const { categories: incomeCategories } = useIncomeCategories();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // Bounded transaction snapshot the offline brain queries for record-level
  // answers ("last 5", "the ₱1,500 charge", "over ₱5k this year"). Built from a
  // trailing analytical window and injected into BrainContext.transactions so the
  // brain stays pure & synchronous (FINO_CHATBOT V3 §"core lever").
  const [txSnapshot, setTxSnapshot] = useState<TxLite[]>([]);
  // Oldest moment the snapshot fully covers — lets the brain caveat range
  // answers that reach further back instead of silently undercounting.
  const [txSnapshotStart, setTxSnapshotStart] = useState<string | null>(null);
  // Configured recurring income (for "did my salary hit yet?").
  const [recurringIncome, setRecurringIncome] = useState<
    { label: string; amount: number; dayOfMonth?: number }[]
  >([]);
  // Configured recurring bills (for "when is my next bill due?").
  const [recurringBills, setRecurringBills] = useState<RecurringBillLite[]>([]);
  // Utang receivables (money owed TO the user) for debt questions.
  const [debts, setDebts] = useState<
    {
      debtor: string;
      total: number;
      paid: number;
      remaining: number;
      dueDate?: string;
    }[]
  >([]);
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

  // Full IntelligenceEngine insights (anomalies / trajectory / coach), resolved
  // async here and injected into the synchronous brain via BrainContext so it
  // can answer with forecast / coach cards (FINO_CHATBOT_CARDS.md §1, §2).
  const [engineInsights, setEngineInsights] = useState<Insights | null>(null);
  // The live, unpersisted proactive coach card is dismissible per session (§5/§6).
  const [proactiveDismissed, setProactiveDismissed] = useState(false);

  // The intent-aware "working" steps shown while the reply is produced.
  const [currentSteps, setCurrentSteps] = useState<string[]>(STEP_SETS.default);
  // Drops concurrent sends (e.g. a follow-up tap during the working beat) so a
  // reply is never produced twice in parallel.
  const isBusyRef = useRef(false);

  // Flipped on unmount. handleSend awaits a "working beat" (a timer) before it
  // appends the reply; if the user leaves the screen during that wait we skip
  // the now-pointless UI setState (the reply is still persisted for next open).
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    []
  );

  // Short-term conversational memory — the rolling window of recently-resolved
  // turns the brain leans on for follow-ups ("what about last month?"). Held in
  // a ref (not state): it's read+written synchronously inside handleSend and
  // never needs to drive a re-render, and a ref avoids a stale read between two
  // rapid sends. Threaded into BrainContext.memory and replaced from
  // reply.memory after each brain answer. Naturally resets on remount (the chat
  // modal cold-mounts each open), and the short continuation TTL in the brain
  // ages stale turns out within a session.
  const conversationMemoryRef = useRef<ConversationMemory | undefined>(
    undefined
  );

  // "Ask online when unsure" preference (Phase C5) — read once per mount into
  // a ref (checked synchronously inside handleSend; a Settings change applies
  // on next chat open). Default ON; the assist only ever sends message text.
  const assistEnabledRef = useRef(true);
  useEffect(() => {
    getAssistEnabled().then((v) => {
      assistEnabledRef.current = v;
    });
  }, []);

  // Transaction logging state
  const [pendingTx, setPendingTx] = useState<ChatTx | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  // Message ids whose proposed mutation has been confirmed or cancelled — their
  // Confirm/Cancel row is then hidden so a change can't be applied twice.
  const [resolvedMutations, setResolvedMutations] = useState<Set<string>>(
    () => new Set()
  );

  // Keyboard state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Bounded analytical snapshot for the brain's transaction-query layer. Window:
  // the earlier of (start of this calendar year) and (13 months ago) → now, so
  // "this year" and "vs last 3 months" both resolve, capped to the most recent
  // ~2,000 rows to keep it light. Re-emits as transactions change.
  useEffect(() => {
    if (!userId) {
      setTxSnapshot([]);
      setTxSnapshotStart(null);
      return undefined;
    }
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const thirteenMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 13,
      1
    );
    const windowStart = (
      startOfYear < thirteenMonthsAgo ? startOfYear : thirteenMonthsAgo
    ).toISOString();

    const query = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('account_deleted', false),
        Q.where('date', Q.gte(windowStart)),
        Q.sortBy('date', Q.desc),
        Q.take(2000)
      );
    const sub = query
      .observeWithColumns([
        'amount',
        'type',
        'category',
        'merchant_name',
        'display_name',
        'date',
        'account_id',
      ])
      .subscribe((records) => {
        setTxSnapshot(
          records.map((r) => ({
            id: r.id,
            amount: r.amount,
            type: r.type as TxLite['type'],
            category: r.category ?? null,
            merchant: r.merchantName ?? r.displayName ?? null,
            name: r.displayName ?? null,
            date: r.date,
            accountId: r.accountId,
          }))
        );
        // When the row cap truncated the window, coverage only reaches the
        // oldest row actually loaded (records are date-desc, so that's last).
        setTxSnapshotStart(
          records.length >= 2000
            ? records[records.length - 1].date
            : windowStart
        );
      });
    return () => sub.unsubscribe();
  }, [userId]);

  // Active recurring income → "did my salary hit yet?" expectation.
  useEffect(() => {
    if (!userId) {
      setRecurringIncome([]);
      return undefined;
    }
    const sub = database
      .get<RecurringIncomeModel>('recurring_incomes')
      .query(Q.where('user_id', userId), Q.where('is_active', true))
      .observeWithColumns(['title', 'amount', 'next_due_at', 'anchor_date'])
      .subscribe((records) => {
        setRecurringIncome(
          records.map((r) => {
            const anchor = r.nextDueAt || r.anchorDate;
            const d = anchor ? new Date(anchor) : null;
            return {
              label: r.title,
              amount: r.amount,
              dayOfMonth:
                d && !Number.isNaN(d.getTime()) ? d.getDate() : undefined,
            };
          })
        );
      });
    return () => sub.unsubscribe();
  }, [userId]);

  // Active recurring bills → "when is my next bill due?" answers.
  useEffect(() => {
    if (!userId) {
      setRecurringBills([]);
      return undefined;
    }
    const sub = database
      .get<RecurringBillModel>('recurring_bills')
      .query(Q.where('user_id', userId), Q.where('is_active', true))
      .observeWithColumns(['title', 'amount', 'cadence', 'next_due_at'])
      .subscribe((records) => {
        setRecurringBills(
          records.map((r) => ({
            label: r.title,
            amount: r.amount,
            cadence: r.cadence,
            nextDueAt: r.nextDueAt || undefined,
          }))
        );
      });
    return () => sub.unsubscribe();
  }, [userId]);

  // Utang receivables → "how much do I owe / who owes me" answers. Money owed
  // TO the user; remaining = total_amount − amount_paid.
  useEffect(() => {
    if (!userId) {
      setDebts([]);
      return undefined;
    }
    const sub = database
      .get<DebtModel>('debts')
      .query(Q.where('user_id', userId))
      .observeWithColumns([
        'debtor_name',
        'total_amount',
        'amount_paid',
        'direction',
        'due_date',
      ])
      .subscribe((records) => {
        setDebts(
          records
            // The brain answers "who owes me" from receivables only. Payables
            // ('i_owe') are the user's own debts and must not be counted here;
            // anything that isn't explicitly 'i_owe' is a receivable.
            .filter((r) => r.direction !== 'i_owe')
            .map((r) => ({
              debtor: r.debtorName,
              total: r.totalAmount,
              paid: r.amountPaid,
              remaining: Math.max(0, r.totalAmount - r.amountPaid),
              dueDate: r.dueDate,
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
      1
    ).toISOString();
    const endOfThisMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();

    const query = database
      .get<TransactionModel>('transactions')
      .query(
        Q.where('user_id', userId),
        Q.where('date', Q.gte(startOfLastMonth)),
        Q.where('date', Q.lte(endOfThisMonth)),
        Q.where('account_deleted', false)
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

  // Resolve the full IntelligenceEngine insights for the current month, refreshed
  // (debounced) when transactions change. `getInsights` is async; we resolve it
  // here and inject the result into the synchronous brain via BrainContext, so
  // the offline/sync law holds (FINO_CHATBOT_CARDS.md §1 ⚠️).
  useEffect(() => {
    if (!userId) {
      setEngineInsights(null);
      return undefined;
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchInsights = () => {
      getInsights(userId, year, month)
        .then((res) => {
          if (!cancelled) setEngineInsights(res);
        })
        .catch(() => {});
    };

    fetchInsights();
    const sub = database
      .get<TransactionModel>('transactions')
      .query(Q.where('user_id', userId))
      .observeWithColumns(['amount', 'type', 'date', 'is_transfer', 'category'])
      .subscribe(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fetchInsights, 400);
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub.unsubscribe();
    };
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
        if (cancelled) return;
        const loaded = rows.map(rowToMessage);
        // Don't clobber messages a send appended while the load was in flight:
        // the live thread wins (persisted scrollback is intact on next open).
        // On a fresh mount `prev` is empty, so this is a plain hydrate.
        setMessages((prev) => (prev.length > 0 ? prev : loaded));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const categoryNames = useMemo(
    () => categories.map((c) => c.name),
    [categories]
  );

  // Context the brain queries (V3): account balances, per-category budgets, and
  // the tx snapshot enriched with account names. Memoized so the per-send ctx
  // build stays cheap.
  const accountsForBrain = useMemo(
    () =>
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: a.balance,
        type: a.type,
      })),
    [accounts]
  );
  const budgetsForBrain = useMemo(
    () =>
      categories
        .filter((c) => (c.budget_limit ?? 0) > 0)
        .map((c) => ({ category: c.name, limit: c.budget_limit as number })),
    [categories]
  );
  const txForBrain = useMemo(() => {
    const nameById = new Map(accounts.map((a) => [a.id, a.name]));
    return txSnapshot.map((t) => ({
      ...t,
      accountName: nameById.get(t.accountId),
    }));
  }, [txSnapshot, accounts]);

  // The proactive opening coach card: recomputed live from current insights,
  // never persisted (FINO_CHATBOT_CARDS.md §5/§6). Null unless there's a
  // non-neutral, noteworthy nudge — so the chat doesn't open with filler.
  const proactiveCard = useMemo(
    () =>
      engineInsights && !proactiveDismissed
        ? selectProactiveCoach(engineInsights)
        : null,
    [engineInsights, proactiveDismissed]
  );
  // The snapshot is the brain's transaction source of truth, so "has any
  // activity" derives from it (plus this month's spend) — no separate observer.
  const hasTransactions = txSnapshot.length > 0 || monthlySpent > 0;
  const isSendDisabled = !inputText.trim() || isTyping;
  const profileInitial =
    (profile?.name ?? '').trim().charAt(0).toUpperCase() || 'U';

  // ─── LOG TRANSACTION ───────────────────────────────────────────────────────

  const doLogTransaction = async (tx: ChatTx, accountId: string) => {
    if (!userId) return;
    try {
      await createTransaction({
        userId,
        accountId,
        amount: tx.amount,
        type: tx.type,
        category: tx.category,
        displayName: tx.displayName,
        signalSource: 'description',
        // Honor an unambiguous back-date ("spent 50 yesterday"); else log now.
        date: tx.date ?? new Date().toISOString(),
      });

      const confirmId = `tx-${Date.now()}`;
      const isExpense = tx.type === 'expense';
      const amtStr = `${isExpense ? '-' : '+'}₱${tx.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
      const card: ChatCard = {
        kind: 'status',
        data: {
          yes: true,
          status: 'good',
          title: 'Transaction Logged',
          message: `${amtStr} — ${tx.displayName ?? 'Transaction'}`,
          tx: {
            id: confirmId,
            name: tx.displayName ?? 'Transaction',
            category: tx.category ?? 'Other',
            amount: tx.amount,
            type: tx.type,
            date: new Date().toISOString(),
          },
        },
      };
      setMessages((prev) => [
        ...prev,
        { id: confirmId, type: 'ai', text: '', card, timestamp: nowTime() },
      ]);
      setLastMsgId(confirmId);
      // Persist the confirmation card so it survives reopening the chat.
      saveChatMessage({
        userId,
        role: 'ai',
        text: '',
        payload: JSON.stringify({ card }),
      }).catch(() => {});
    } catch (err) {
      console.error('[Fino AI] createTransaction error:', err);
    }
  };

  // ─── SEND MESSAGE ──────────────────────────────────────────────────────────

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride ?? inputText;
    const trimmed = textToSend.trim();
    // Drop sends while the account picker is resolving a pending log — a
    // follow-up tap must not overwrite pendingTx or fire a parallel reply.
    if (!trimmed || isBusyRef.current || showAccountPicker) return;

    isBusyRef.current = true;
    setInputText('');

    const userMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, type: 'user', text: trimmed, timestamp: nowTime() },
    ]);
    setLastMsgId(userMsgId);
    if (userId) {
      saveChatMessage({ userId, role: 'user', text: trimmed }).catch(() => {});
    }

    try {
      // Offline transaction parse + log, using the same taxonomy the Add
      // Transaction sheet uses. Multi-amount inputs ("chicken 50 and rice 50")
      // sum into one transaction. This never touches the network.
      //
      // A message that READS as a question ("where can I cut ₱2,000?",
      // "transactions over ₱5,000") or a mutation COMMAND ("recategorize the
      // ₱1,500 charge as Coffee", "split my ₱100 bill") is routed to the brain,
      // NOT logged — without this gate an amount-bearing query/command would
      // silently create a transaction.
      const parsed =
        looksLikeQuestion(trimmed) || looksLikeCommand(trimmed)
          ? null
          : parseChatTransaction(
              trimmed,
              accounts.map((a) => ({ id: a.id, name: a.name })),
              categoryNames,
              incomeCategories
            );

      // A parsed transaction is acknowledged by a status card — logged
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

      // Otherwise produce an offline reply via the local brain. The reply is
      // computed synchronously up front (so the working steps can reflect the
      // brain's *resolved* intent); the ONLY wait is the deliberate "working"
      // beat (Thinking → Analyzing → Generating) that signals Fino is on it.
      //
      // The brain is pure & synchronous, but a malformed snapshot row could
      // still throw inside a builder — never let that strand the spinner.
      let reply: ReturnType<typeof routeMessage>;
      // Assist bookkeeping (Phase C): the meta of the ORIGINAL offline turn
      // (telemetry must describe the miss, not the assisted recovery), plus
      // the resolution the online router produced, if any.
      let preAssistMeta: BrainResponseMeta | undefined;
      let assistResolvedIntent: string | undefined;
      let assistResolvedQuery: string | undefined;
      try {
        const now = new Date();
        const brainCtx: BrainContext = {
          balance: totalBalance,
          income: totalIncome,
          spent: monthlySpent,
          lastMonthSpent: insight.lastMonthSpent,
          topCategories: insight.topCategories,
          dayOfMonth: now.getDate(),
          daysInMonth: new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0
          ).getDate(),
          now: now.toISOString(),
          insights: engineInsights ?? undefined,
          transactions: txForBrain,
          snapshotStart: txSnapshotStart ?? undefined,
          accounts: accountsForBrain,
          budgets: budgetsForBrain,
          recurringIncome,
          recurringBills,
          debts,
          memory: conversationMemoryRef.current,
        };
        reply = routeMessage(trimmed, brainCtx);
        // Advance the short-term memory window for the next follow-up. The brain
        // returns the updated window (with this turn folded in); a turn that
        // carried no signal passes the window through unchanged.
        if (reply.memory) conversationMemoryRef.current = reply.memory;
        preAssistMeta = reply.meta;

        // ── Online assist (INTELLIGENCE_UPGRADE.md, Phase C4). One attempt,
        // only when the brain flagged the turn (true fallback or a low-
        // confidence classifier win) AND the user's "ask online when unsure"
        // toggle is on. The LLM only ROUTES — it returns an intent + a
        // canonical rewrite of the user's sentence; every number, card, and
        // confirm still comes from the offline pipeline re-run below. The
        // request body is the message text alone. Fail-quiet: offline, slow
        // (>4s), or invalid replies keep the offline clarify already in
        // `reply`.
        if (reply.meta?.assistEligible && assistEnabledRef.current) {
          // Surface the wait honestly — this is the one beat that goes online.
          setCurrentSteps(ASSIST_STEPS);
          setIsTyping(true);
          const decision = await requestBrainAssist(trimmed);
          if (decision && decision.intent === 'log' && decision.query) {
            // A purchase statement the offline gates missed. NEVER write from
            // an LLM interpretation — offer the rewrite as a one-tap chip that
            // re-enters the normal deterministic log path (parse → account →
            // status card), where the user is the one confirming.
            assistResolvedIntent = 'log';
            assistResolvedQuery = decision.query;
            reply = {
              text: 'Looks like you meant to log a purchase. Tap to confirm and I\'ll log it:',
              followUps: [decision.query],
              meta: preAssistMeta,
            };
          } else if (decision && decision.intent !== 'none' && decision.query) {
            const rerouted = routeMessage(decision.query, brainCtx);
            // Adopt the reroute only when the offline brain confidently
            // understood the rewrite — a shaky reroute would just launder the
            // original guess through prettier words.
            if (
              rerouted.meta &&
              rerouted.meta.intent !== null &&
              !rerouted.meta.assistEligible &&
              rerouted.meta.confidence >= 0.6
            ) {
              assistResolvedIntent = rerouted.meta.intent ?? undefined;
              assistResolvedQuery = decision.query;
              reply = rerouted;
              if (rerouted.memory) {
                conversationMemoryRef.current = rerouted.memory;
              }
            }
          }
        }
      } catch (err) {
        console.error('[Fino AI] routeMessage error:', err);
        reply = {
          text: 'Sorry — I hit a snag answering that. Mind rephrasing?',
        };
      }

      // Log a trainable miss to the local, anonymized telemetry buffer: a true
      // fallback (intent null) OR a low-confidence turn (`assistEligible`) —
      // the force-answer failure class Phase B made visible. `preAssistMeta`
      // describes the ORIGINAL offline decision even when the online assist
      // recovered the turn; the assist's intent + rewrite ride along as a
      // ready-made labeled corpus pair (Phase C6). Fire-and-forget. A
      // 'declined' source (abusive / empty input) is intentionally excluded so
      // a slur never seeds the training corpus.
      if (
        userId &&
        preAssistMeta &&
        preAssistMeta.source !== 'declined' &&
        (preAssistMeta.intent === null || preAssistMeta.assistEligible)
      ) {
        recordBrainMiss({
          text: trimmed,
          source: preAssistMeta.source,
          mlMatched: preAssistMeta.mlMatched,
          confidence: preAssistMeta.confidence,
          resolvedIntent: assistResolvedIntent,
          resolvedQuery: assistResolvedQuery,
        }).catch(() => {});
      }

      // Chit-chat (hi / thanks / help / count) has no data to crunch, so it
      // answers instantly — as does a deterministic decline (abusive / empty
      // input), which shouldn't show a fake "analyzing your spending" beat.
      // Everything else shows the staged indicator and lands on its final step
      // as the reply swaps in (one step per WORK_STAGE_MS).
      const replyIntent = reply.meta?.intent ?? null;
      const declined = reply.meta?.source === 'declined';
      if (!declined && (!replyIntent || !INSTANT_INTENTS.has(replyIntent))) {
        const steps = stepsForIntent(replyIntent, trimmed);
        setCurrentSteps(steps);
        setIsTyping(true);
        await new Promise<void>((r) =>
          setTimeout(r, steps.length * WORK_STAGE_MS)
        );
      }

      // Render the full reply at once — the bubble fades in as a block
      // (AnimatedMessage) and any card assembles itself (ChatCardView reveal).
      // No typewriter: the text arrives instantly instead of crawling.
      const aiMsgId = `ai-${Date.now()}`;
      // The online router shaped this reply (log-confirm chip or an adopted
      // reroute) → mark the bubble "used online help" (Phase C4). The marker
      // persists so the distinction survives reopen.
      const viaAssist = assistResolvedIntent !== undefined;
      if (userId) {
        // Snapshot the card + actions + follow-ups into payload so the reply
        // renders identically on reopen — frozen as-of-asked (CARDS.md §6).
        // Persist BEFORE the mount guard so a reply computed during the working
        // beat survives a reopen even if the user already left the screen.
        const payload =
          reply.card || reply.actions || reply.followUps || viaAssist
            ? JSON.stringify({
                card: reply.card,
                actions: reply.actions,
                followUps: reply.followUps,
                ...(viaAssist ? { viaAssist: true } : {}),
              })
            : null;
        saveChatMessage({
          userId,
          role: 'ai',
          text: reply.text,
          payload,
        }).catch(() => {});
      }
      // Left the screen during the working beat → reply is saved; skip the UI.
      if (!isMountedRef.current) return;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          type: 'ai',
          text: reply.text,
          card: reply.card,
          actions: reply.actions,
          // Mutation lives only in live state (never persisted), so its
          // Confirm/Cancel row is gone on reopen — a stale change can't re-run.
          mutation: reply.mutation,
          followUps: reply.followUps,
          ...(viaAssist ? { viaAssist: true } : {}),
          timestamp: nowTime(),
        },
      ]);
      setLastMsgId(aiMsgId);
      requestAnimationFrame(() =>
        scrollViewRef.current?.scrollToEnd({ animated: true })
      );
    } finally {
      // Always clear the working state — even if the brain threw — so the
      // ThinkingSteps indicator can never get stuck spinning.
      setIsTyping(false);
      isBusyRef.current = false;
    }
  };

  const handleAccountSelected = async (accountId: string) => {
    // Capture + clear synchronously so a double-tap (two account rows before
    // the sheet unmounts) can't log the same transaction twice.
    const tx = pendingTx;
    setShowAccountPicker(false);
    setPendingTx(null);
    if (tx) await doLogTransaction(tx, accountId);
  };

  // Dispatch a brain-emitted card/reply action (V3). `navigate` opens a screen
  // (optionally pre-filled, so "do" actions confirm on the real screen — no
  // silent writes); `prompt` re-enters the send path with a canned query.
  const handleCardAction = (action: CardAction) => {
    if (action.kind === 'prompt') {
      handleSend(action.send);
      return;
    }
    const p = (action.params ?? {}) as Record<string, unknown>;
    switch (action.target) {
      case 'insights':
        navigation.navigate('Tabs', { screen: 'stats' });
        break;
      case 'addTransaction':
        navigation.navigate('AddTransaction', {
          mode: (p.mode as 'expense' | 'income') ?? 'expense',
          prefill: p.prefill as never,
        });
        break;
      case 'transactionDetail':
        if (typeof p.id === 'string') {
          navigation.navigate('TransactionDetail', { id: p.id });
        }
        break;
      case 'savingsGoal':
        navigation.navigate('SavingsGoal', {
          name: p.name as string | undefined,
          target: p.target as number | undefined,
          monthlyContribution: p.monthlyContribution as number | undefined,
        });
        break;
      case 'recurringBills':
        navigation.navigate('RecurringBills');
        break;
      case 'recurringIncome':
        navigation.navigate('RecurringIncome');
        break;
      case 'utangTracker':
        navigation.navigate('UtangTracker', {
          debtorName: p.debtorName as string | undefined,
          amount: p.amount as number | undefined,
          direction: p.direction as 'owed_to_me' | 'i_owe' | undefined,
        });
        break;
      case 'billSplitter':
        navigation.navigate('BillSplitter');
        break;
      case 'categories':
        navigation.navigate('Categories', {
          focusCategory: p.focusCategory as string | undefined,
          budgetLimit: p.budgetLimit as number | undefined,
        });
        break;
      case 'accounts':
        navigation.navigate('Accounts');
        break;
      case 'cashFlow':
        navigation.navigate('CashFlow', {
          accountId: p.accountId as string | undefined,
        });
        break;
      default:
        break;
    }
  };

  const handlePickerDismiss = () => {
    setShowAccountPicker(false);
    setPendingTx(null);
    // Acknowledge the cancelled log so the user's message isn't left dangling
    // with no response (transient, session-only).
    const noteId = `ai-note-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: noteId,
        type: 'ai',
        text: "Okay, I didn't log that. Tap an account next time to save it.",
        timestamp: nowTime(),
      },
    ]);
    setLastMsgId(noteId);
  };

  // Execute (or decline) a brain-proposed mutation after the user taps
  // Confirm/Cancel. The brain only proposes (no silent writes) — this is the one
  // place the change actually hits the DB, via the existing mutation service.
  const appendAiNote = (text: string, card?: ChatCard) => {
    const noteId = `ai-mut-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: noteId, type: 'ai', text, card, timestamp: nowTime() },
    ]);
    setLastMsgId(noteId);
    if (userId) {
      saveChatMessage({
        userId,
        role: 'ai',
        text,
        payload: card ? JSON.stringify({ card }) : null,
      }).catch(() => {});
    }
  };

  const handleMutation = async (msg: Message, confirm: boolean) => {
    const mut = msg.mutation;
    if (!mut || resolvedMutations.has(msg.id)) return;
    // Mark resolved first so a double-tap can't run the write twice.
    setResolvedMutations((prev) => new Set(prev).add(msg.id));

    if (!confirm) {
      appendAiNote('No changes made.');
      return;
    }

    const pesoNote = (n: number) =>
      `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

    try {
      switch (mut.kind) {
        case 'recategorize': {
          await updateTransaction(mut.txId, { category: mut.toCategory });
          appendAiNote('', {
            kind: 'status',
            data: {
              yes: true,
              status: 'good',
              title: 'Re-categorized',
              message: `${mut.txLabel} → ${mut.toCategory}`,
            },
          });
          break;
        }
        case 'setBudget': {
          const target = categories.find(
            (c) => c.name.toLowerCase() === mut.category.toLowerCase()
          );
          if (!target) {
            appendAiNote(
              `I couldn't find a category named ${mut.category} — set it up in Categories and I'll budget it from there.`
            );
            break;
          }
          await updateCategory(target.id, { budgetLimit: mut.limit });
          appendAiNote('', {
            kind: 'status',
            data: {
              yes: true,
              status: 'good',
              title: 'Budget set',
              message: `${target.name} — ${pesoNote(mut.limit)}/month`,
            },
          });
          break;
        }
        case 'delete': {
          await deleteTransaction(mut.txId);
          appendAiNote('', {
            kind: 'status',
            data: {
              yes: true,
              status: 'good',
              title: 'Deleted',
              message: `${mut.txLabel} (${pesoNote(mut.amount)}) removed.`,
            },
          });
          break;
        }
        case 'transfer': {
          if (!userId) break;
          await saveTransfer({
            userId,
            sourceAccountId: mut.fromAccountId,
            sourceAccountName: mut.fromLabel,
            destAccountId: mut.toAccountId,
            destAccountName: mut.toLabel,
            amount: mut.amount,
          });
          appendAiNote('', {
            kind: 'status',
            data: {
              yes: true,
              status: 'good',
              title: 'Transferred',
              message: `${pesoNote(mut.amount)}: ${mut.fromLabel} → ${mut.toLabel}`,
            },
          });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error('[Fino AI] mutation error:', err);
      appendAiNote("Sorry — I couldn't apply that change. Mind trying again?");
    }
  };

  // ─── RENDER HELPERS ────────────────────────────────────────────────────────

  const renderEmptyGuard = () => (
    <View style={styles.emptyStateContainer}>
      <View style={styles.emptyIconWrap}>
        <Icon name="chat" size={48} color={colors.chatAILabel} />
      </View>
      <Text style={styles.emptyHeading}>Start your journey</Text>
      <Text style={styles.emptyBody}>
        Fino needs some data to work its magic. Log your first expense or income
        to get personalized insights.
      </Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        activeOpacity={0.8}
        onPress={() =>
          navigation.navigate('AddTransaction', { mode: 'expense' })
        }
      >
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
      hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening';
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
            ₱
            {totalBalance.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
          </Text>
          {saved > 0 ? (
            <>
              <Text style={styles.glanceSep}>·</Text>
              <Text style={styles.glanceSave}>
                saving ₱
                {saved.toLocaleString('en-PH', { maximumFractionDigits: 0 })}{' '}
                this month
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
              <View
                style={[styles.suggTile, { backgroundColor: `${s.tint}22` }]}
              >
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

  // Live, dismissible proactive coach card pinned above the thread (§5/§6).
  const renderProactiveCard = () => {
    if (!proactiveCard) return null;
    return (
      <View style={styles.proactiveWrap}>
        <View style={styles.proactiveHead}>
          <Text style={styles.proactiveEyebrow}>FOR YOU</Text>
          <TouchableOpacity
            onPress={() => setProactiveDismissed(true)}
            hitSlop={10}
          >
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ChatCardView
          card={proactiveCard}
          colors={colors}
          onAction={handleCardAction}
        />
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
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}>
            <FinoIntelIcon size={15} color="#fff" />
          </View>

          <View style={styles.aiMsgWrapper}>
            <View style={styles.aiBubble}>
              <Text style={styles.aiLabelText}>Fino</Text>

              {msg.text ? <Text style={styles.aiText}>{msg.text}</Text> : null}

              {msg.card ? (
                <ChatCardView
                  card={msg.card}
                  colors={colors}
                  onAction={handleCardAction}
                  animateIn={isNew}
                />
              ) : null}
            </View>

            <Text style={styles.timestampAi}>
              {msg.viaAssist
                ? `${msg.timestamp} · used online help`
                : msg.timestamp}
            </Text>

            {msg.mutation && !resolvedMutations.has(msg.id) ? (
              <Reveal
                animate={isNew}
                delay={REVEAL_STAGGER_MS * 2}
                style={styles.mutationWrapper}
              >
                <TouchableOpacity
                  style={styles.mutationConfirmBtn}
                  activeOpacity={0.85}
                  onPress={() => handleMutation(msg, true)}
                >
                  <Ionicons name="checkmark" size={15} color="#fff" />
                  <Text style={styles.mutationConfirmText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mutationCancelBtn}
                  activeOpacity={0.8}
                  onPress={() => handleMutation(msg, false)}
                >
                  <Text style={styles.mutationCancelText}>Cancel</Text>
                </TouchableOpacity>
              </Reveal>
            ) : null}

            {msg.actions && msg.actions.length > 0 ? (
              <Reveal
                animate={isNew}
                delay={REVEAL_STAGGER_MS * 2}
                style={styles.replyActionWrapper}
              >
                {msg.actions.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={styles.replyActionBtn}
                    activeOpacity={0.8}
                    onPress={() => handleCardAction(a)}
                  >
                    <Text style={styles.replyActionText}>{a.label}</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                ))}
              </Reveal>
            ) : null}

            {msg.followUps ? (
              <Reveal
                animate={isNew}
                delay={REVEAL_STAGGER_MS * 3}
                style={styles.followupWrapper}
              >
                {msg.followUps.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={styles.followupChip}
                    onPress={() => handleSend(prompt)}
                  >
                    <Text style={styles.followupChipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </Reveal>
            ) : null}
          </View>
        </View>
      </AnimatedMessage>
    );
  };

  const renderBody = () => {
    // An existing thread always wins. Otherwise a brain reply (which works
    // without any transaction data, e.g. budgeting tips) would stay hidden
    // behind the empty guard for a user who hasn't logged anything yet.
    if (messages.length === 0) {
      return hasTransactions ? renderLanding() : renderEmptyGuard();
    }
    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.bodyScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
        onLayout={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
      >
        {renderProactiveCard()}
        {messages.map(renderMessage)}
        {isTyping ? (
          <ThinkingSteps steps={currentSteps} colors={colors} isDark={isDark} />
        ) : null}
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
        <View
          style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 12) }]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.textPrimary}
            />
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
            {
              paddingBottom: isKeyboardVisible
                ? 14
                : Math.max(insets.bottom, 14),
            },
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
              maxLength={500}
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
                    <Ionicons
                      name="arrow-up"
                      size={18}
                      color={colors.textSecondary}
                    />
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
      <ProfileSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
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
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyIconWrap: { marginBottom: 16 },
    emptyHeading: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.chatAILabel,
      marginBottom: 12,
    },
    emptyBody: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    emptyBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 16,
    },
    emptyBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: '#FFF',
    },
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
    aiText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.chatAIText,
      lineHeight: 20,
    },
    timestampAi: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 6,
      marginLeft: 4,
    },
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
    userText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: '#FFF',
      lineHeight: 20,
    },
    timestampUser: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 6,
      marginRight: 4,
    },

    // ─── Proactive coach card (live, unpersisted) ───
    proactiveWrap: { marginBottom: 16 },
    proactiveHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    proactiveEyebrow: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },

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
    glanceDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.incomeGreen,
    },
    glanceAmt: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 13,
      color: colors.textPrimary,
    },
    glanceSep: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
    },
    glanceSave: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.incomeGreen,
    },
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
    suggLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14.5,
      color: colors.textPrimary,
    },
    suggSub: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11.5,
      color: colors.textSecondary,
      marginTop: 1,
    },

    followupWrapper: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    followupChip: {
      backgroundColor: colors.chatAIBubbleBg,
      borderWidth: 1,
      borderColor: colors.chatAIBubbleBorder,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    followupChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.chatAILabel,
    },
    // Reply-level action buttons (V3) — slightly more prominent than follow-up
    // chips since they navigate / pre-fill a screen.
    replyActionWrapper: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    replyActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.chatAIBubbleBg,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    replyActionText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.primary,
    },
    // Confirm/Cancel row for a brain-proposed mutation (recategorize). Confirm is
    // filled (it commits a write); Cancel is a quiet text button.
    mutationWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    mutationConfirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    mutationConfirmText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: '#FFF',
    },
    mutationCancelBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    mutationCancelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
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
