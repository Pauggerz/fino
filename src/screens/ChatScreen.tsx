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
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../constants/theme';
import {
  sendMessage,
  ChatMessage,
  UserFinancialContext,
} from '@/services/gemini';
import { useAccounts } from '@/hooks/useAccounts';
import { useMonthlyTotals } from '@/hooks/useMonthlyTotals';
import { useCategories } from '@/hooks/useCategories';
import { supabase } from '@/services/supabase';

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

  const { totalBalance } = useAccounts();
  const { totalIncome, totalExpense: monthlySpent } = useMonthlyTotals();
  const { categories } = useCategories();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [showPrompts, setShowPrompts] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [geminiHistory, setGeminiHistory] = useState<ChatMessage[]>([]);
  const [recentTxns, setRecentTxns] = useState<RecentTx[]>([]);

  // Scroll to bottom when keyboard opens so input stays visible
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  // Fetch recent 10 transactions once on mount
  useEffect(() => {
    supabase
      .from('transactions')
      .select('display_name, amount, type, category, date')
      .order('date', { ascending: false })
      .limit(10)
      .then(({ data }) => setRecentTxns(data ?? []));
  }, []);

  // Build initial welcome message from real data once totals load
  useEffect(() => {
    setMessages([
      {
        id: 'msg-welcome',
        type: 'ai',
        text: "Hi! 👋 Here's your financial snapshot this month:",
        richData: [
          {
            label: 'Spent this month',
            value: `₱${monthlySpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            color: colors.expenseRed,
          },
          {
            label: 'Income this month',
            value: `₱${totalIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            color: '#2d6a4f',
          },
          {
            label: 'Total balance',
            value: `₱${totalBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
          },
        ],
        timestamp: nowTime(),
      },
    ]);
  }, [monthlySpent, totalIncome, totalBalance]);

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
      <Text style={styles.emptyEmoji}>🌱</Text>
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Math.max(insets.top, 16)}
    >
      <View
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

      <View
        style={[
          styles.inputContainer,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.inputField}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              !hasTransactions
                ? 'Log some expenses first...'
                : 'Ask about your finances...'
            }
            placeholderTextColor="#888780"
            editable={hasTransactions}
            multiline
            maxLength={150}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !inputText.trim() || !hasTransactions || isTyping
                ? styles.sendBtnDisabled
                : undefined,
            ]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || !hasTransactions || isTyping}
          >
            <Ionicons name="arrow-up" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F5F2' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerProfile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: { color: '#FFF', fontSize: 20 },
  headerTitle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 16,
    color: '#534AB7',
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
  emptyHeading: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 20,
    color: '#534AB7',
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
    backgroundColor: '#2d6a4f',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },
  emptyBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFF',
  },
  aiMsgWrapper: { alignItems: 'flex-start', marginBottom: 20, maxWidth: '85%' },
  aiBubble: {
    backgroundColor: '#EEEDFE',
    borderWidth: 0.5,
    borderColor: '#AFA9EC',
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
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiIconGlyph: { color: '#FFF', fontSize: 10 },
  aiLabelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#534AB7',
  },
  aiText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#26215C',
    lineHeight: 20,
  },
  timestampAi: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: '#B4B2A9',
    marginTop: 6,
    marginLeft: 4,
  },
  userMsgWrapper: { alignItems: 'flex-end', marginBottom: 20 },
  userBubble: {
    backgroundColor: '#2d6a4f',
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
    color: '#B4B2A9',
    marginTop: 6,
    marginRight: 4,
  },
  typingDot: { fontSize: 16, color: '#534AB7', letterSpacing: 2 },
  richCard: {
    backgroundColor: '#FFF',
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
    color: '#888780',
  },
  richCardValue: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 14,
    color: '#26215C',
  },
  followupWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  followupChip: {
    backgroundColor: '#EEEDFE',
    borderWidth: 1,
    borderColor: '#AFA9EC',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  followupChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#534AB7',
  },
  suggestedContainer: { marginTop: 10, marginBottom: 20 },
  suggestedLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#534AB7',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  suggestedChipsWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestedChip: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DCDAE8',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestedChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#534AB7',
  },
  inputContainer: {
    backgroundColor: '#F7F5F2',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#AFA9EC',
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
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 4,
  },
  sendBtnDisabled: { backgroundColor: '#DCDAE8' },
});
