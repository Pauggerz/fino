import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../constants/theme';

const MOCK_HAS_TRANSACTIONS = true;

type RichRow = { label: string; value: string; color?: string };
type Message = {
  id: string;
  type: 'ai' | 'user';
  text: string;
  richData?: RichRow[];
  followUps?: string[];
  timestamp: string;
};

const SUGGESTED_PROMPTS = [
  'How much did I spend on food?',
  'What is my biggest expense?',
  'Summarize my week',
  'Did I get paid yet?',
];

const INITIAL_MSG: Message = {
  id: 'msg-1',
  type: 'ai',
  text: "Hi Hans! 👋 Here's a quick summary of your finances this month:",
  richData: [
    { label: 'Total spent', value: '₱4,820.50', color: '#E57373' },
    { label: 'Total income', value: '₱25,000.00', color: '#2d6a4f' },
  ],
  timestamp: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  }),
};

const FOOD_REPLY: Message = {
  id: 'msg-food',
  type: 'ai',
  text: "You've spent ₱405.00 on Food this month. Here's the breakdown:",
  richData: [
    { label: 'Jollibee Drive Thru', value: '₱185.00' },
    { label: 'Starbucks', value: '₱220.00' },
  ],
  followUps: ['What about transport?', 'Show highest expense'],
  timestamp: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  }),
};

const GENERIC_REPLY: Message = {
  id: 'msg-generic',
  type: 'ai',
  text: "I'm still learning! Right now I can only answer questions about your food expenses.",
  timestamp: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  }),
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputText, setInputText] = useState('');
  const [showPrompts, setShowPrompts] = useState(true);
  const [isTyping, setIsTyping] = useState(false);

  //   useEffect(() => {
  //     const checkPrompts = async () => {
  //       try {
  //         const stored = await AsyncStorage.getItem('fino_prompts_shown');
  //         if (stored !== 'true') {
  //           setShowPrompts(true);
  //         }
  //       } catch (e) {
  //         // ESLint fix: Silently ignore storage fetch errors
  //       }
  //     };
  //     checkPrompts();
  //   }, []);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || inputText;
    if (!textToSend.trim()) return;

    if (showPrompts) {
      setShowPrompts(false);
      try {
        await AsyncStorage.setItem('fino_prompts_shown', 'true');
      } catch (e) {
        // Silently ignore storage save errors
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const isFoodQuery = textToSend.toLowerCase().includes('food');

      const replyMsg: Message = {
        ...(isFoodQuery ? FOOD_REPLY : GENERIC_REPLY),
        id: (Date.now() + 1).toString(),
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, replyMsg]);
    }, 1500);
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
      style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.chatHeader}>
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

      {!MOCK_HAS_TRANSACTIONS ? (
        renderEmptyGuard()
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
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
              !MOCK_HAS_TRANSACTIONS
                ? 'Log some expenses first...'
                : 'Ask about your finances...'
            }
            placeholderTextColor="#888780"
            editable={MOCK_HAS_TRANSACTIONS}
            multiline
            maxLength={150}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !inputText.trim() || !MOCK_HAS_TRANSACTIONS
                ? styles.sendBtnDisabled
                : undefined,
            ]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || !MOCK_HAS_TRANSACTIONS}
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
