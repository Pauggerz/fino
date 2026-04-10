import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  Animated,
  View,
  Text,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Keyboard,
  Vibration,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { TouchableOpacity, ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Calendar } from 'react-native-calendars'; // Fixed missing import
import { useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

import { useTheme } from '../contexts/ThemeContext';
import { INCOME_CATEGORIES } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import {
  createDebouncedAnalyzer,
  type AIAnalysisResult,
} from '../services/aiCategoryMap';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '@/services/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { setLastSaved } from '@/services/lastSavedStore';
import { useSync } from '@/contexts/SyncContext';

type TxType = 'exp' | 'inc';
type Props = { route: RouteProp<RootStackParamList, 'AddTransaction'> };

export default function AddTransactionSheet({ route }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const numpadKeyWidth = Math.floor((windowWidth - 56) / 3);
  const typeToggleBtnWidth = Math.floor((windowWidth - 48) / 2);

  // Refs
  const bottomSheetRef = useRef<BottomSheet>(null);
  const allowCloseRef = useRef(false);
  const amountLimitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const discardShakeX = useRef(new Animated.Value(0)).current;
  const analyzer = useRef(createDebouncedAnalyzer()).current;

  // Data Hooks
  const { addOfflineTransaction } = useSync();
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  // State
  const initialMode = route.params?.mode ?? 'expense';
  const [type, setType] = useState<TxType>(
    initialMode === 'income' ? 'inc' : 'exp'
  );
  const [amount, setAmount] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [aiText, setAiText] = useState<string>('');
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiInputFocused, setAiInputFocused] = useState(false);
  const [signalSource, setSignalSource] = useState<'manual' | 'ai_description'>(
    'manual'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [showAmountLimitToast, setShowAmountLimitToast] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [tempSelectedDate, setTempSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);

  const hasUnsavedInput = amount.trim().length > 0 || aiText.trim().length > 0;

  // Cleanup
  useEffect(() => {
    return () => {
      analyzer.cancel();
      if (amountLimitToastTimerRef.current)
        clearTimeout(amountLimitToastTimerRef.current);
    };
  }, [analyzer]);

  // Defaults
  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  useEffect(() => {
    if (type === 'inc') {
      setCategory(INCOME_CATEGORIES[0].name);
    } else if (categories.length > 0) {
      setCategory(categories[0].name);
    }
  }, [type, categories]);

  // Logic Handlers
  const triggerBlockedFeedback = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {}
    );
    Vibration.vibrate([0, 24, 36, 28]);
    discardShakeX.setValue(0);
    Animated.sequence([
      Animated.timing(discardShakeX, {
        toValue: -8,
        duration: 32,
        useNativeDriver: true,
      }),
      Animated.timing(discardShakeX, {
        toValue: 8,
        duration: 42,
        useNativeDriver: true,
      }),
      Animated.timing(discardShakeX, {
        toValue: 0,
        duration: 28,
        useNativeDriver: true,
      }),
    ]).start();
  }, [discardShakeX]);

  const requestClose = useCallback(() => {
    if (hasUnsavedInput) {
      triggerBlockedFeedback();
      setShowDiscardPrompt(true);
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      allowCloseRef.current = true;
      Keyboard.dismiss();
      bottomSheetRef.current?.close();
    }
  }, [hasUnsavedInput, triggerBlockedFeedback]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        if (allowCloseRef.current || !hasUnsavedInput) {
          navigation.goBack();
        } else {
          triggerBlockedFeedback();
          setShowDiscardPrompt(true);
          bottomSheetRef.current?.snapToIndex(0);
        }
      }
    },
    [hasUnsavedInput, navigation, triggerBlockedFeedback]
  );

  const handleNumTap = (key: string) => {
    if (key === 'back') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (key === '.' && !amount.includes('.')) {
      setAmount((prev) => prev + key);
    } else if (key !== '.') {
      if (amount.replace('.', '').length >= 7) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setShowAmountLimitToast(true);
        if (amountLimitToastTimerRef.current)
          clearTimeout(amountLimitToastTimerRef.current);
        amountLimitToastTimerRef.current = setTimeout(
          () => setShowAmountLimitToast(false),
          1100
        );
        return;
      }
      setAmount((prev) => prev + key);
    }
  };

  const handleAiTextChange = (text: string) => {
    setAiText(text);
    setAiResult(null);
    if (text.trim()) {
      analyzer.analyze(text, (result) => {
        setAiResult(result);
        if (result.suggestedCategory) {
          const matched = categories.find(
            (c) => c.name.toLowerCase() === result.suggestedCategory
          );
          if (matched) {
            setCategory(matched.name);
            setSignalSource('ai_description');
          }
        }
      });
    } else {
      analyzer.cancel();
      setSignalSource('manual');
    }
  };

  const handleSave = async () => {
    const selectedAccount = accounts.find((a) => a.id === accountId);
    if (!selectedAccount || !amount || isSaving) return;

    setIsSaving(true);
    const parsedAmount = parseFloat(amount);
    const txType = type === 'exp' ? 'expense' : 'income';

    try {
      const txPayload = {
        user_id: selectedAccount.user_id,
        account_id: accountId,
        amount: parsedAmount,
        type: txType,
        category: category || null,
        display_name: aiText || category || 'Other',
        transaction_note: aiText || null,
        signal_source:
          signalSource === 'ai_description' ? 'description' : 'manual',
        date: selectedDate.toISOString(),
        account_deleted: false,
      };

      addOfflineTransaction(txPayload).catch(() => {});

      const delta = txType === 'expense' ? -parsedAmount : parsedAmount;
      supabase
        .from('accounts')
        .update({ balance: selectedAccount.balance + delta })
        .eq('id', accountId)
        .then();

      setLastSaved({
        id: `temp_${Date.now()}`,
        accountId,
        previousBalance: selectedAccount.balance,
        amount: parsedAmount,
        type: txType,
        accountName: selectedAccount.name,
        categoryName: category || 'Other',
      });

      allowCloseRef.current = true;
      bottomSheetRef.current?.close();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const resolveCategoryStyle = useCallback(
    (key: string) => {
      const map: Record<string, { bg: string; text: string }> = {
        food: { bg: colors.catFoodBg, text: colors.catFoodText },
        business: { bg: colors.catFoodBg, text: colors.catFoodText },
        transport: { bg: colors.catTransportBg, text: colors.catTransportText },
        allowance: { bg: colors.catTransportBg, text: colors.catTransportText },
        shopping: { bg: colors.catShoppingBg, text: colors.catShoppingText },
        gifts: { bg: colors.catShoppingBg, text: colors.catShoppingText },
        bills: { bg: colors.catBillsBg, text: colors.catBillsText },
        freelance: { bg: colors.catBillsBg, text: colors.catBillsText },
        health: { bg: colors.catHealthBg, text: colors.catHealthText },
        salary: { bg: colors.catHealthBg, text: colors.catHealthText },
        investment: { bg: colors.tagCashBg, text: colors.tagCashText },
      };
      return (
        map[key.toLowerCase()] || {
          bg: colors.catTileEmptyBg,
          text: colors.textSecondary,
        }
      );
    },
    [colors]
  );

  return (
    <View style={styles.container}>
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={['90%']}
        enablePanDownToClose
        onChange={handleSheetChanges}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            onPress={requestClose}
          />
        )}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => setShowDatePickerModal(true)}
            style={styles.datePill}
          >
            <Text style={styles.datePillText}>
              📅{' '}
              {selectedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sheetTitle}>Add transaction</Text>
          <Text style={styles.sheetSub}>Log expense or income</Text>

          <View style={styles.typeToggle}>
            {(['exp', 'inc'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.typeBtn,
                  { width: typeToggleBtnWidth },
                  type === t &&
                    (t === 'exp'
                      ? styles.typeBtnExpActive
                      : styles.typeBtnIncActive),
                ]}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    type === t &&
                      (t === 'exp' ? styles.textExp : styles.textInc),
                  ]}
                >
                  {t === 'exp' ? 'Expense ↓' : 'Income ↑'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={[
              styles.amountDisplay,
              amount.length > 0 && { borderColor: colors.primary },
            ]}
          >
            <View style={styles.amountRow}>
              <Text style={styles.amountCurr}>₱</Text>
              <Text style={styles.amountVal}>{amount || '0'}</Text>
            </View>
            <Text style={styles.amountSub}>
              {amount.length > 0
                ? 'Long-press ⌫ to clear'
                : 'Tap a number to enter amount'}
            </Text>
            {showAmountLimitToast && (
              <View style={styles.amountLimitToast}>
                <Text style={styles.amountLimitToastText}>
                  Max 7 digits reached
                </Text>
              </View>
            )}
          </View>

          <View style={styles.numpad}>
            {[
              '1',
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
              '.',
              '0',
              'back',
            ].map((key) => (
              <TouchableOpacity
                key={key}
                onPress={() => handleNumTap(key)}
                onLongPress={key === 'back' ? () => setAmount('') : undefined}
                style={[
                  styles.numKey,
                  { width: numpadKeyWidth },
                  key === 'back' && styles.numKeyDel,
                ]}
              >
                <Text
                  style={[
                    styles.numKeyText,
                    key === 'back' && styles.numKeyTextDel,
                  ]}
                >
                  {key === 'back' ? '⌫' : key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>From Account</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {accounts.map((acc) => {
                const isSel = accountId === acc.id;
                const logo = ACCOUNT_LOGOS[acc.name];
                return (
                  <TouchableOpacity
                    key={acc.id}
                    onPress={() => setAccountId(acc.id)}
                    style={[styles.accCard, isSel && styles.accCardActive]}
                  >
                    {logo ? (
                      <Image source={logo} style={styles.accLogo} />
                    ) : (
                      <View
                        style={[
                          styles.accAvatar,
                          { backgroundColor: acc.brand_colour },
                        ]}
                      >
                        <Text style={styles.accAvatarText}>
                          {acc.letter_avatar}
                        </Text>
                      </View>
                    )}
                    <Text
                      style={[
                        styles.accName,
                        isSel && { color: colors.primary },
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>
              Category{' '}
              {type === 'exp' && (
                <Text style={styles.aiLabel}>✦ AI suggested</Text>
              )}
            </Text>
            <View style={styles.pillsRow}>
              {(type === 'inc' ? INCOME_CATEGORIES : categories).map(
                (cat: any) => {
                  const catKey =
                    type === 'inc' ? cat.key : (cat.emoji ?? '').toLowerCase();
                  const isSel = category === cat.name;
                  const themeStyles = resolveCategoryStyle(catKey);
                  return (
                    <TouchableOpacity
                      key={cat.id || cat.key}
                      onPress={() => {
                        setCategory(cat.name);
                        setSignalSource('manual');
                      }}
                      style={[
                        styles.catPill,
                        isSel && {
                          borderColor: themeStyles.text,
                          backgroundColor: themeStyles.bg,
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <CategoryIcon
                        categoryKey={catKey}
                        color={isSel ? themeStyles.text : colors.textSecondary}
                        size={14}
                      />
                      <Text
                        style={[
                          styles.catPillText,
                          {
                            color: isSel
                              ? themeStyles.text
                              : colors.textSecondary,
                          },
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>
          </View>

          <View style={styles.aiFieldWrap}>
            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR DESCRIBE</Text>
              <View style={styles.orLine} />
            </View>
            <View
              style={[
                styles.aiField,
                aiInputFocused && { borderColor: colors.primary },
              ]}
            >
              <BottomSheetTextInput
                style={styles.aiFieldText}
                placeholder='e.g. "lunch", "grab ride"'
                value={aiText}
                onChangeText={handleAiTextChange}
                onFocus={() => setAiInputFocused(true)}
                onBlur={() => setAiInputFocused(false)}
              />
            </View>
            {aiResult?.suggestedCategory && (
              <View style={styles.aiConfirm}>
                <Text style={styles.aiConfirmText}>
                  "{aiResult.matchedKeyword}" → {aiResult.suggestedCategory} ✓
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            disabled={!amount || isSaving}
            onPress={handleSave}
            style={styles.saveBtnWrap}
          >
            <LinearGradient
              colors={['#4a7a5e', '#5B8C6E']}
              style={[
                styles.saveBtn,
                (!amount || isSaving) && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isSaving
                  ? 'Saving...'
                  : type === 'exp'
                    ? 'Save Expense'
                    : 'Save Income'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={requestClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>

      {showDiscardPrompt && (
        <View style={styles.discardOverlay}>
          <Pressable
            style={styles.discardOverlayTap}
            onPress={() => setShowDiscardPrompt(false)}
          />
          <Animated.View
            style={[
              styles.discardCard,
              { transform: [{ translateX: discardShakeX }] },
            ]}
          >
            <Text style={styles.discardTitle}>Discard transaction?</Text>
            <Text style={styles.discardBody}>Your progress will be lost.</Text>
            <View style={styles.discardActions}>
              <Pressable
                style={styles.discardKeepBtn}
                onPress={() => setShowDiscardPrompt(false)}
              >
                <Text style={styles.discardKeepText}>Keep Editing</Text>
              </Pressable>
              <Pressable
                style={styles.discardDropBtn}
                onPress={() => {
                  setShowDiscardPrompt(false);
                  allowCloseRef.current = true;
                  bottomSheetRef.current?.close();
                }}
              >
                <Text style={styles.discardDropText}>Discard</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}

      <Modal visible={showDatePickerModal} transparent animationType="fade">
        <View style={styles.dateModalOverlay}>
          <Pressable
            style={styles.dateModalBackdrop}
            onPress={() => setShowDatePickerModal(false)}
          />
          <View style={styles.dateModalCard}>
            <Calendar
              current={tempSelectedDate}
              onDayPress={(day) => setTempSelectedDate(day.dateString)}
              maxDate={new Date().toISOString().split('T')[0]}
              markedDates={{ [tempSelectedDate]: { selected: true } }}
              theme={{
                selectedDayBackgroundColor: colors.primary,
                todayTextColor: colors.primary,
              }}
            />
            <View style={styles.dateModalActions}>
              <Pressable
                onPress={() => setShowDatePickerModal(false)}
                style={styles.dateModalCancelBtn}
              >
                <Text>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSelectedDate(new Date(tempSelectedDate));
                  setShowDatePickerModal(false);
                }}
                style={styles.dateModalApplyBtn}
              >
                <Text style={{ color: '#FFF' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    sheetBackground: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      backgroundColor: isDark ? '#444' : '#D8D6D0',
      marginTop: 10,
    },
    scrollContent: { padding: 20, paddingBottom: 60 },
    datePill: {
      alignSelf: 'flex-start',
      backgroundColor: isDark ? 'rgba(91,140,110,0.15)' : '#EBF2EE',
      padding: 8,
      borderRadius: 20,
      marginBottom: 12,
    },
    datePillText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
    sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    sheetSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
    typeToggle: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    typeBtn: {
      flex: 1,
      height: 50,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: isDark ? '#333' : '#EEE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeBtnExpActive: {
      backgroundColor: 'rgba(192,57,42,0.1)',
      borderColor: colors.expenseRed,
    },
    typeBtnIncActive: {
      backgroundColor: 'rgba(45,106,79,0.1)',
      borderColor: colors.incomeGreen,
    },
    typeBtnText: { fontWeight: '700', color: colors.textSecondary },
    textExp: { color: colors.expenseRed },
    textInc: { color: colors.incomeGreen },
    amountDisplay: {
      backgroundColor: colors.catTileEmptyBg,
      padding: 20,
      borderRadius: 16,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      marginBottom: 20,
    },
    amountRow: { flexDirection: 'row', alignItems: 'center' },
    amountCurr: { fontSize: 24, color: colors.textSecondary, marginRight: 4 },
    amountVal: { fontSize: 48, fontWeight: '700', color: colors.textPrimary },
    amountSub: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    amountLimitToast: {
      marginTop: 8,
      backgroundColor: 'rgba(232,133,106,0.1)',
      padding: 6,
      borderRadius: 8,
    },
    amountLimitToastText: { fontSize: 11, color: colors.coral },
    numpad: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24,
    },
    numKey: {
      height: 50,
      backgroundColor: colors.white,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#EEE',
    },
    numKeyDel: { backgroundColor: 'rgba(192,57,42,0.1)' },
    numKeyText: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
    numKeyTextDel: { color: colors.expenseRed },
    section: { marginBottom: 24 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    aiLabel: { color: colors.lavenderDark, textTransform: 'none' },
    accCard: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#EEE',
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      minWidth: 100,
    },
    accCardActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(91,140,110,0.1)' : '#F0F7F3',
    },
    accLogo: { width: 24, height: 24 },
    accAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accAvatarText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    accName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#EEE',
    },
    catPillText: { fontSize: 13, fontWeight: '600' },
    aiFieldWrap: { marginBottom: 24 },
    orDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    orLine: { flex: 1, height: 1, backgroundColor: isDark ? '#333' : '#EEE' },
    orText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
    aiField: {
      backgroundColor: colors.catTileEmptyBg,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    aiFieldText: { fontSize: 14, color: colors.textPrimary },
    aiConfirm: {
      marginTop: 8,
      backgroundColor: 'rgba(91,140,110,0.1)',
      padding: 8,
      borderRadius: 8,
    },
    aiConfirmText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
    saveBtnWrap: { marginBottom: 12 },
    saveBtn: { padding: 16, borderRadius: 16, alignItems: 'center' },
    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    cancelBtn: { alignItems: 'center', padding: 10 },
    cancelBtnText: {
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    discardOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100,
    },
    discardOverlayTap: { ...StyleSheet.absoluteFillObject },
    discardCard: {
      width: '85%',
      backgroundColor: colors.white,
      padding: 20,
      borderRadius: 20,
    },
    discardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    discardBody: {
      fontSize: 14,
      color: colors.textSecondary,
      marginVertical: 12,
    },
    discardActions: { flexDirection: 'row', gap: 10 },
    discardKeepBtn: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#EEE',
      alignItems: 'center',
    },
    discardKeepText: { fontWeight: '700' },
    discardDropBtn: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.expenseRed,
      alignItems: 'center',
    },
    discardDropText: { color: '#FFF', fontWeight: '700' },
    dateModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: 20,
    },
    dateModalBackdrop: { ...StyleSheet.absoluteFillObject },
    dateModalCard: {
      backgroundColor: colors.white,
      borderRadius: 20,
      padding: 20,
    },
    dateModalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    dateModalCancelBtn: { flex: 1, padding: 12, alignItems: 'center' },
    dateModalApplyBtn: {
      flex: 1,
      padding: 12,
      backgroundColor: colors.primary,
      borderRadius: 10,
      alignItems: 'center',
    },
  });
