import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Modal,
  Alert,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useIncomeCategories } from '@/hooks/useIncomeCategories';
import { createTransaction } from '@/services/localMutations';
import { parseChatTransaction, type ChatTx } from '@/intelligence';
import {
  requestVoicePermission,
  startListening,
  stopListening,
} from '@/intelligence/voice/voiceClient';
import {
  AccountPickerModal,
  type AccountItem,
} from '@/components/AccountPickerModal';

type Status = 'idle' | 'listening' | 'processing' | 'confirm' | 'error';

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('not-allowed') || m.includes('permission'))
    return 'Microphone access was denied. Enable it in your device settings to use voice entry.';
  if (m.includes('no-speech') || m.includes('speech-timeout'))
    return "Didn't hear anything — try again.";
  if (m.includes('network'))
    return 'Speech recognition needs a moment — try again.';
  return "Couldn't catch that — try again.";
}

export default function VoiceEntryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { currentUserId } = useAuth();
  const userId = currentUserId;

  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { categories: incomeCategories } = useIncomeCategories();
  const categoryNames = useMemo(
    () => categories.map((c) => c.name),
    [categories]
  );

  const [status, setStatus] = useState<Status>('idle');
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingTx, setPendingTx] = useState<ChatTx | null>(null);
  const [descriptionText, setDescriptionText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [selectedType, setSelectedType] = useState<'expense' | 'income'>(
    'expense'
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const cancelListeningRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelListeningRef.current?.(), []);

  const handleTranscript = (text: string) => {
    setStatus('processing');
    const parsed = parseChatTransaction(
      text,
      accounts.map((a) => ({ id: a.id, name: a.name })),
      categoryNames,
      incomeCategories
    );
    if (!parsed) {
      setStatus('error');
      setErrorMessage(
        "Didn't catch an amount — try again or enter it manually."
      );
      return;
    }
    setPendingTx(parsed);
    setDescriptionText(parsed.displayName);
    setAmountText(parsed.amount.toFixed(2));
    setSelectedType(parsed.type);
    setSelectedCategory(parsed.category);
    setSelectedAccountId(parsed.accountId);
    setShowAccountPicker(!parsed.accountId);
    setStatus('confirm');
  };

  const startVoiceSession = async () => {
    const granted = await requestVoicePermission();
    if (!granted) {
      setStatus('error');
      setErrorMessage(
        'Microphone access was denied. Enable it in your device settings to use voice entry.'
      );
      return;
    }
    setErrorMessage(null);
    setInterimText('');
    setStatus('listening');
    cancelListeningRef.current = startListening({
      onInterimResult: (t) => setInterimText(t),
      onFinalResult: (t) => {
        setInterimText(t);
        handleTranscript(t);
      },
      onError: (message) => {
        setStatus('error');
        setErrorMessage(friendlyError(message));
      },
    });
  };

  const handleMicPress = () => {
    if (status === 'listening') {
      stopListening();
      return;
    }
    startVoiceSession();
  };

  const handleRetry = () => {
    setPendingTx(null);
    setInterimText('');
    setErrorMessage(null);
    setStatus('idle');
  };

  const handleAccountSelected = (accountId: string) => {
    setSelectedAccountId(accountId);
    setShowAccountPicker(false);
  };

  const handleConfirmSave = async () => {
    if (!userId || !selectedAccountId) return;
    const amount = Math.round(parseFloat(amountText || '0') * 100) / 100;
    if (!amount || amount <= 0) {
      Alert.alert('Enter an amount', 'The amount must be greater than zero.');
      return;
    }
    setIsSaving(true);
    try {
      await createTransaction({
        userId,
        accountId: selectedAccountId,
        amount,
        type: selectedType,
        category: selectedCategory,
        displayName: descriptionText.trim() || null,
        signalSource: 'description',
        date: pendingTx?.date ?? new Date().toISOString(),
      });
      navigation.goBack();
    } catch (err) {
      console.error('[VoiceEntry] createTransaction error:', err);
      Alert.alert(
        'Something went wrong',
        'The transaction could not be saved.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const activeCategoryNames =
    selectedType === 'income'
      ? incomeCategories.map((c) => c.name)
      : categoryNames;

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.dismissBtn}
        >
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Entry</Text>
        <View style={{ width: 32 }} />
      </View>

      {status !== 'confirm' && (
        <View style={styles.centerWrap}>
          <MicButton status={status} colors={colors} onPress={handleMicPress} />
          <Text style={styles.hint}>
            {status === 'idle' && 'Tap to speak a transaction'}
            {status === 'listening' && 'Listening… tap to stop'}
            {status === 'processing' && 'Parsing…'}
            {status === 'error' && (errorMessage ?? 'Something went wrong')}
          </Text>
          {(status === 'listening' || status === 'processing') &&
            interimText.length > 0 && (
              <Text style={styles.transcript}>&ldquo;{interimText}&rdquo;</Text>
            )}
          {status === 'error' && (
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  navigation.replace('AddTransaction', { mode: 'expense' })
                }
              >
                <Text style={styles.manualLink}>Enter manually instead</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {status === 'confirm' && (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>What you said</Text>
          <Text style={styles.transcriptRecap}>
            &ldquo;{interimText}&rdquo;
          </Text>

          <View style={styles.typeToggle}>
            {(['expense', 'income'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  setSelectedType(t);
                  setSelectedCategory(null);
                }}
                style={[
                  styles.typeBtn,
                  selectedType === t && styles.typeBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    selectedType === t && styles.typeBtnTextActive,
                  ]}
                >
                  {t === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            value={descriptionText}
            onChangeText={setDescriptionText}
            style={styles.input}
            placeholder="Transaction description"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.sectionLabel}>Amount</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.sectionLabel}>Category</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowCategoryPicker(true)}
          >
            <Text style={styles.rowValue}>
              {selectedCategory ?? 'Select a category'}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Account</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowAccountPicker(true)}
          >
            <Text style={styles.rowValue}>
              {selectedAccount ? selectedAccount.name : 'Select an account'}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleConfirmSave}
            disabled={!selectedAccountId || isSaving}
            style={[
              styles.saveBtn,
              (!selectedAccountId || isSaving) && styles.saveBtnDisabled,
            ]}
          >
            <Text style={styles.saveBtnText}>
              {isSaving ? 'Saving…' : 'Confirm & save'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRetry} style={{ marginTop: 14 }}>
            <Text style={styles.manualLink}>Record again</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <AccountPickerModal
        visible={showAccountPicker}
        accounts={accounts as AccountItem[]}
        pendingTx={pendingTx}
        onSelect={handleAccountSelected}
        onDismiss={() => setShowAccountPicker(false)}
        colors={colors}
        isDark={isDark}
        insetBottom={insets.bottom}
      />

      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View
            style={styles.categorySheet}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.sectionLabel}>Choose a category</Text>
            <View style={styles.chipWrap}>
              {activeCategoryNames.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.chip,
                    selectedCategory === name && styles.chipActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(name);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedCategory === name && styles.chipTextActive,
                    ]}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function MicButton({
  status,
  colors,
  onPress,
}: {
  status: Status;
  colors: any;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'listening') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const isError = status === 'error';
  const bg = isError ? colors.expenseRed : colors.primary;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: bg,
          opacity: 0.18,
          transform: [{ scale: pulse }],
        }}
      />
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        disabled={status === 'processing'}
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={status === 'listening' ? 'square' : 'mic'}
          size={32}
          color="#fff"
        />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    dismissBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    },
    headerTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 16,
      color: colors.textPrimary,
    },
    centerWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 18,
    },
    hint: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    transcript: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      fontStyle: 'italic',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    errorActions: {
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    retryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
    },
    retryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      color: '#fff',
    },
    manualLink: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 0.6,
      color: colors.textSecondary,
      marginTop: 18,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    transcriptRecap: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      fontStyle: 'italic',
      color: colors.textPrimary,
    },
    typeToggle: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    typeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
    },
    typeBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typeBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    typeBtnTextActive: {
      color: '#fff',
    },
    input: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: colors.textPrimary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    rowValue: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: colors.textPrimary,
    },
    saveBtn: {
      marginTop: 28,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    saveBtnDisabled: {
      opacity: 0.5,
    },
    saveBtnText: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 15,
      color: '#fff',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    categorySheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 32,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? '#444' : '#DDD',
      alignSelf: 'center',
      marginBottom: 12,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textPrimary,
    },
    chipTextActive: {
      color: '#fff',
    },
  });
