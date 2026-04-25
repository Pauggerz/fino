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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  sendMessage,
  ChatMessage,
  UserFinancialContext,
} from '@/services/gemini';
import { useAccounts } from '@/hooks/useAccounts';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { useCategories } from '@/hooks/useCategories';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';

const SUGGESTED_PROMPTS = [
  'How much did I spend on food?',
  'What is my biggest expense?',
  'Summarize my month',
  'Did I get paid yet?',
];

type RichRow = { label: string; value: string; color?: string };
type Message = {
  id: string;
  type: 'ai' | 'user';
  text: string;
  richData?: RichRow[];
  followUps?: string[];
  timestamp: string;
};

type RecentTx = {
  display_name: string | null;
  amount: number;
  type: string;
  category: string | null;
  date: string;
};

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);

  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { totalBalance } = useAccounts();
  const { totalIncome, totalExpense: monthlySpent } = useMonthlyTotals();
  const { categories } = useCategories();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [showPrompts, setShowPrompts] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [geminiHistory, setGeminiHistory] = useState<ChatMessage[]>([]);
  const [recentTxns, setRecentTxns] = useState<RecentTx[]>([]);

  // ─── KEYBOARD & LAYOUT STATE ───
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Use 'will' events for smoother iOS transitions
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setRecentTxns([]);
      return;
    }
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
    setMessages([
      {
        id: 'msg-welcome',
        type: 'ai',
        text: "Hi! Here's your financial snapshot this month:",
        richData: [
          {
            label: 'Spent this month',
            value: `₱${monthlySpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            color: colors.expenseRed,
          },
          {
            label: 'Income this month',
            value: `₱${totalIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            color: colors.incomeGreen,
          },
          {
            label: 'Total balance',
            value: `₱${totalBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            color: colors.textPrimary,
          },
        ],
        timestamp: nowTime(),
      },
    ]);
  }, [monthlySpent, totalIncome, totalBalance, colors]);

  const financialContext = useMemo<UserFinancialContext>(() => {
    const totalBudget = categories.reduce(
      (sum, c) => sum + (c.budget_limit ?? 0),
      0
    );
    return {
      totalBalance,
      monthlyIncome: totalIncome,
      monthlySpent,
      totalBudget: totalBudget > 0 ? totalBudget : null,
      categoryBreakdown: categories.map((c) => ({
        name: c.name,
        spent: c.spent,
        budget: c.budget_limit ?? null,
      })),
      recentTransactions: recentTxns,
    };
  }, [totalBalance, totalIncome, monthlySpent, categories, recentTxns]);

  const hasTransactions = recentTxns.length > 0 || monthlySpent > 0;
  const isSendDisabled = !inputText.trim() || isTyping;

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride ?? inputText;
    if (!textToSend.trim()) return;

    setShowPrompts(false);
    setInputText('');

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: textToSend.trim(),
      timestamp: nowTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const reply = await sendMessage(
        textToSend.trim(),
        geminiHistory,
        financialContext
      );

      setGeminiHistory((prev) => [
        ...prev,
        { role: 'user', text: textToSend.trim() },
        { role: 'model', text: reply },
      ]);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        text: reply,
        timestamp: nowTime(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('[Fino AI] sendMessage error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          text: 'Something went wrong. Please try again.',
          timestamp: nowTime(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

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

  const renderSuggestedPrompts = () => {
    if (!showPrompts) return null;
    return (
      <View style={styles.suggestedContainer}>
        <Text style={styles.suggestedLabel}>TRY ASKING</Text>
        <View style={styles.suggestedChipsWrapper}>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <TouchableOpacity
              key={prompt}
              style={styles.suggestedChip}
              onPress={() => handleSend(prompt)}
            >
              <Text style={styles.suggestedChipText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMessage = (msg: Message) => {
    if (msg.type === 'user') {
      return (
        <View key={msg.id} style={styles.userMsgWrapper}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{msg.text}</Text>
          </View>
          <Text style={styles.timestampUser}>{msg.timestamp}</Text>
        </View>
      );
    }

    return (
      <View key={msg.id} style={styles.aiMsgWrapper}>
        <View style={styles.aiBubble}>
          <View style={styles.aiLabelRow}>
            <View style={styles.aiIconBox}>
              <Text style={styles.aiIconGlyph}>✦</Text>
            </View>
            <Text style={styles.aiLabelText}>Fino</Text>
          </View>
          <Text style={styles.aiText}>{msg.text}</Text>

          {msg.richData ? (
            <View style={styles.richCard}>
              {msg.richData.map((row) => (
                <View key={row.label} style={styles.richCardRow}>
                  <Text style={styles.richCardLabel}>{row.label}</Text>
                  <Text
                    style={[
                      styles.richCardValue,
                      row.color ? { color: row.color } : undefined,
                    ]}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={styles.timestampAi}>{msg.timestamp}</Text>

        {msg.followUps ? (
          <View style={styles.followupWrapper}>
            {msg.followUps.map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={styles.followupChip}
                onPress={() => handleSend(prompt)}
              >
                <Text style={styles.followupChipText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── FIXED HEADER (MEASURED DYNAMICALLY) ─── */}
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[styles.chatHeader, { paddingTop: Math.max(insets.top, 16) }]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerProfile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarGlyph}>✦</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Ask Fino</Text>
            <Text style={styles.headerSubtitle}>AI Financial Assistant</Text>
          </View>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* ─── KEYBOARD AVOIDING VIEW (WITH DYNAMIC OFFSET) ─── */}
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
            onContentSizeChange={() =>
              scrollViewRef.current?.scrollToEnd({ animated: true })
            }
            onLayout={() =>
              scrollViewRef.current?.scrollToEnd({ animated: false })
            }
          >
            {messages.map(renderMessage)}

            {isTyping ? (
              <View style={styles.aiMsgWrapper}>
                <View
                  style={[styles.aiBubble, { width: 70, alignItems: 'center' }]}
                >
                  <Text style={styles.typingDot}>•••</Text>
                </View>
              </View>
            ) : null}

            {renderSuggestedPrompts()}
          </ScrollView>
        )}

        {/* Dynamic Padding: Removes the bottom inset when the keyboard is visible to fix the "levitating" white bar */}
        <View
          style={[
            styles.inputContainer,
            {
              paddingBottom: isKeyboardVisible
                ? 16
                : Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.inputField}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about your finances..."
              placeholderTextColor={colors.textSecondary}
              editable
              multiline
              maxLength={150}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                isSendDisabled ? styles.sendBtnDisabled : undefined,
              ]}
              onPress={() => handleSend()}
              disabled={isSendDisabled}
            >
              <Ionicons name="arrow-up" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    avatarGlyph: { color: '#FFF', fontSize: 20 },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 16,
      color: colors.chatAILabel,
    },
    headerSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
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
    aiMsgWrapper: {
      alignItems: 'flex-start',
      marginBottom: 20,
      maxWidth: '85%',
    },
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
    aiLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      gap: 6,
    },
    aiIconBox: {
      width: 16,
      height: 16,
      borderRadius: 4,
      backgroundColor: colors.chatAILabel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiIconGlyph: {
      color: isDark ? colors.chatAIBubbleBg : '#FFF',
      fontSize: 10,
    },
    aiLabelText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.chatAILabel,
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
    typingDot: { fontSize: 16, color: colors.chatAILabel, letterSpacing: 2 },
    richCard: {
      backgroundColor: colors.white,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
      gap: 8,
    },
    richCardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    richCardLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
    },
    richCardValue: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 14,
      color: colors.textPrimary,
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
    suggestedContainer: { marginTop: 10, marginBottom: 20 },
    suggestedLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.chatAILabel,
      letterSpacing: 0.5,
      marginBottom: 10,
      marginLeft: 4,
    },
    suggestedChipsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    suggestedChip: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#DCDAE8',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    suggestedChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.chatAILabel,
    },
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
