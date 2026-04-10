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
import { useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

import { useTheme } from '../contexts/ThemeContext'; // 🌙 <-- Dynamic Theme Hook
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
  const initialMode = route.params?.mode ?? 'expense';
  const bottomSheetRef = useRef<BottomSheet>(null);
  const allowCloseRef = useRef(false);
  const hasUnsavedInputRef = useRef(false);
  const showDiscardPromptRef = useRef(false);
  const amountLimitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discardShakeX = useRef(new Animated.Value(0)).current;
  const numpadKeyWidth = Math.floor((windowWidth - 56) / 3);
  const typeToggleBtnWidth = Math.floor((windowWidth - 48) / 2);

  // 🌙 Dynamic Theme Injection
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { addOfflineTransaction } = useSync();
  const { accounts } = useAccounts();
  const { categories } = useCategories();

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
  const [tempSelectedDate, setTempSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);

  const analyzer = useRef(createDebouncedAnalyzer()).current;

  // ─── DYNAMIC THEME RESOLVER ───
  const resolveCategoryStyle = useCallback(
    (key: string) => {
      switch (key.toLowerCase()) {
        case 'food':
        case 'business':
          return { bg: colors.catFoodBg, text: colors.catFoodText };
        case 'transport':
        case 'allowance':
          return { bg: colors.catTransportBg, text: colors.catTransportText };
        case 'shopping':
        case 'gifts':
          return { bg: colors.catShoppingBg, text: colors.catShoppingText };
        case 'bills':
        case 'freelance':
          return { bg: colors.catBillsBg, text: colors.catBillsText };
        case 'health':
        case 'salary':
          return { bg: colors.catHealthBg, text: colors.catHealthText };
        case 'investment':
          return { bg: colors.tagCashBg, text: colors.tagCashText };
        default:
          return { bg: colors.catTileEmptyBg, text: colors.textSecondary };
      }
    },
    [colors]
  );

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

  useEffect(() => {
    return () => analyzer.cancel();
  }, [analyzer]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        navigation.goBack();
      }
    },
    [navigation]
  );
  useEffect(() => {
    return () => {
      if (amountLimitToastTimerRef.current) {
        clearTimeout(amountLimitToastTimerRef.current);
      }
    };
  }, []);

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    bottomSheetRef.current?.close();
  }, []);

  const hasUnsavedInput = amount.trim().length > 0 || aiText.trim().length > 0;

  useEffect(() => {
    hasUnsavedInputRef.current = hasUnsavedInput;
  }, [hasUnsavedInput]);

  useEffect(() => {
    showDiscardPromptRef.current = showDiscardPrompt;
  }, [showDiscardPrompt]);

  const triggerBlockedFeedback = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    Vibration.vibrate(24);
    Vibration.vibrate([0, 24, 36, 28]);

    discardShakeX.stopAnimation();
    discardShakeX.setValue(0);
    Animated.sequence([
      Animated.timing(discardShakeX, { toValue: -8, duration: 32, useNativeDriver: true }),
      Animated.timing(discardShakeX, { toValue: 8, duration: 42, useNativeDriver: true }),
      Animated.timing(discardShakeX, { toValue: -6, duration: 34, useNativeDriver: true }),
      Animated.timing(discardShakeX, { toValue: 6, duration: 34, useNativeDriver: true }),
      Animated.timing(discardShakeX, { toValue: 0, duration: 28, useNativeDriver: true }),
    ]).start();
  }, [discardShakeX]);

  const openDiscardPrompt = useCallback(() => {
    triggerBlockedFeedback();

    if (showDiscardPromptRef.current) return;
    setShowDiscardPrompt(true);
  }, [triggerBlockedFeedback]);

  const requestClose = useCallback(() => {
    if (hasUnsavedInputRef.current) {
      openDiscardPrompt();
      bottomSheetRef.current?.snapToIndex(0);
      return;
    }

    allowCloseRef.current = true;
    dismiss();
  }, [dismiss, openDiscardPrompt]);

  const handleKeepEditing = useCallback(() => {
    setShowDiscardPrompt(false);
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const handleDiscard = useCallback(() => {
    setShowDiscardPrompt(false);
    allowCloseRef.current = true;
    dismiss();
  }, [dismiss]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index !== -1) return;

    if (allowCloseRef.current || !hasUnsavedInputRef.current) {
      allowCloseRef.current = false;
      navigation.goBack();
      return;
    }

    bottomSheetRef.current?.snapToIndex(0);
    openDiscardPrompt();
  }, [navigation, openDiscardPrompt]);

  const handleSheetAnimate = useCallback((_: number, toIndex: number) => {
    if (toIndex === -1 && !allowCloseRef.current && hasUnsavedInputRef.current) {
      openDiscardPrompt();
      bottomSheetRef.current?.snapToIndex(0);
    }
  }, [openDiscardPrompt]);

  const handleBackdropPress = useCallback(() => {
    requestClose();
  }, [requestClose]);

  const clearAmount = useCallback(() => {
    if (!amount) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAmount('');
  }, [amount]);

  const triggerAmountLimitFeedback = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Vibration.vibrate(14);
    setShowAmountLimitToast(true);

    if (amountLimitToastTimerRef.current) {
      clearTimeout(amountLimitToastTimerRef.current);
    }

    amountLimitToastTimerRef.current = setTimeout(() => {
      setShowAmountLimitToast(false);
    }, 1100);
  }, []);

  const openDatePicker = useCallback(() => {
    setTempSelectedDate(selectedDate.toISOString().split('T')[0]);
    setShowDatePickerModal(true);
  }, [selectedDate]);

  const cancelDatePicker = useCallback(() => {
    setShowDatePickerModal(false);
  }, []);

  const applyDatePicker = useCallback(() => {
    const nextDate = new Date(tempSelectedDate);
    nextDate.setHours(12, 0, 0, 0);
    setSelectedDate(nextDate);
    setShowDatePickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [tempSelectedDate]);

  const toTransactionDateIso = useCallback((date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(12, 0, 0, 0);
    return normalized.toISOString();
  }, []);

  const handleNumTap = (key: string) => {
    if (key === 'back') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (key === '.' && !amount.includes('.')) {
      setAmount((prev) => prev + key);
    } else if (key !== '.') {
      const digitCount = amount.replace('.', '').length;
      if (digitCount >= 7) {
        triggerAmountLimitFeedback();
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

  const handleCategoryManualSelect = (name: string) => {
    setCategory(name);
    setSignalSource('manual');
  };

  const isSaveDisabled =
    !amount || amount === '0' || amount === '.' || isSaving;

  const handleSave = async () => {
    if (isSaveDisabled) return;
    const selectedAccount = accounts.find((a) => a.id === accountId);
    if (!selectedAccount) return;

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
        display_name: aiText || category || null,
        transaction_note: aiText || null,
        signal_source:
          signalSource === 'ai_description' ? 'description' : 'manual',
        date: new Date().toISOString(),
        signal_source: signalSource === 'ai_description' ? 'description' : 'manual',
        date: toTransactionDateIso(selectedDate),
        account_deleted: false,
      };

      addOfflineTransaction(txPayload).catch(() => {});

      const delta = txType === 'expense' ? -parsedAmount : parsedAmount;
      const updateBalance = async () => {
        try {
          await supabase
            .from('accounts')
            .update({ balance: selectedAccount.balance + delta })
            .eq('id', accountId);
        } catch (e) {}
      };
      updateBalance();

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
      dismiss();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="none" onPress={handleBackdropPress} />
    ),
    [handleBackdropPress]
  );

  const today = new Date();
  const isToday = selectedDate.toDateString() === today.toDateString();
  const dateLabel = isToday
    ? `📅 Today, ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : `📅 ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const amountHasValue = amount.length > 0 && amount !== '0';
  const displayAmount = amount || '0';
  const saveLabel = isSaving
    ? 'Saving…'
    : type === 'exp'
      ? 'Save expense'
      : 'Save income';

  return (
    <View style={styles.container}>
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={['90%']}
        enablePanDownToClose
        enableBlurKeyboardOnGesture
        onChange={handleSheetChanges}
        onAnimate={handleSheetAnimate}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior={Platform.OS === 'ios' ? 'interactive' : 'extend'}
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }
        >
          <TouchableOpacity activeOpacity={0.7} onPress={openDatePicker} style={styles.datePill}>
            <Text style={styles.datePillText}>{dateLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.sheetTitle}>Add transaction</Text>
          <Text style={styles.sheetSub}>Log expense or income</Text>

          <View style={styles.typeToggle}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setType('exp')}
              style={[
                styles.typeBtn,
                { width: typeToggleBtnWidth },
                type === 'exp'
                  ? {
                      backgroundColor: isDark
                        ? 'rgba(192,57,42,0.15)'
                        : '#fde8e0',
                      borderColor: isDark ? colors.expenseRed : '#e87c5a',
                    }
                  : {
                      backgroundColor: colors.catTileEmptyBg,
                      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
                    },
              ]}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  {
                    color:
                      type === 'exp'
                        ? isDark
                          ? colors.expenseRed
                          : '#c0391a'
                        : colors.textSecondary,
                  },
                ]}
              >
                Expense ↓
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setType('inc')}
              style={[
                styles.typeBtn,
                { width: typeToggleBtnWidth },
                type === 'inc'
                  ? {
                      backgroundColor: isDark
                        ? 'rgba(45,106,79,0.15)'
                        : '#e8f5ee',
                      borderColor: isDark ? colors.incomeGreen : '#2d6a4f',
                    }
                  : {
                      backgroundColor: colors.catTileEmptyBg,
                      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
                    },
              ]}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  {
                    color:
                      type === 'inc'
                        ? isDark
                          ? colors.incomeGreen
                          : '#27500A'
                        : colors.textSecondary,
                  },
                ]}
              >
                Income ↑
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.amountDisplay,
              {
                borderColor: amountHasValue
                  ? colors.primary
                  : isDark
                    ? '#333333'
                    : '#e0dfd7',
              },
            ]}
          >
            <View style={styles.amountRow}>
              <Text style={styles.amountCurr}>₱</Text>
              <Text style={styles.amountVal}>{displayAmount}</Text>
            </View>
            {!amountHasValue && <Text style={styles.amountSub}>Tap a number to enter amount</Text>}
            {amountHasValue && <Text style={styles.amountSub}>Long-press amount or ⌫ to clear</Text>}
            {showAmountLimitToast && (
              <View style={styles.amountLimitToast}>
                <Text style={styles.amountLimitToastText}>Max 7 digits reached</Text>
              </View>
            )}
          </TouchableOpacity>

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
            ].map((key) => {
              const isDel = key === 'back';
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.7}
                  onPress={() => handleNumTap(key)}
                  style={[
                    styles.numKey,
                    { width: numpadKeyWidth },
                    isDel && styles.numKeyDel,
                  ]}
                  onLongPress={isDel ? clearAmount : undefined}
                  delayLongPress={180}
                  style={[styles.numKey, { width: numpadKeyWidth }, isDel && styles.numKeyDel]}
                >
                  <Text
                    style={[styles.numKeyText, isDel && styles.numKeyTextDel]}
                  >
                    {isDel ? '⌫' : key}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>FROM ACCOUNT</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              style={{ marginHorizontal: -20 }}
            >
              <View style={{ width: 20 }} />
              {accounts.map((acc, index) => {
                const isSel = accountId === acc.id;
                const isLastUsed = index === 0;
                const logo = ACCOUNT_LOGOS[acc.name];
                const avatarLetter =
                  ACCOUNT_AVATAR_OVERRIDE[acc.name] ?? acc.letter_avatar;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    onPress={() => setAccountId(acc.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 14,
                      borderWidth: isSel ? 2 : 1,
                      borderColor: isSel
                        ? colors.primary
                        : isDark
                          ? '#333333'
                          : 'rgba(30,30,46,0.12)',
                      backgroundColor: isSel
                        ? isDark
                          ? 'rgba(91,140,110,0.15)'
                          : '#EBF2EE'
                        : colors.white,
                      minWidth: 90,
                    }}
                  >
                    {logo ? (
                      <View style={styles.logoWrap}>
                        <Image
                          source={logo}
                          style={{ width: 22, height: 22 }}
                          resizeMode="contain"
                        />
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.avatarWrap,
                          {
                            backgroundColor:
                              acc.brand_colour ?? colors.catTileEmptyBg,
                          },
                        ]}
                      >
                        <Text style={styles.avatarLetter}>{avatarLetter}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.acctText,
                          {
                            color: isSel ? colors.primary : colors.textPrimary,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {acc.name}
                      </Text>
                      {isLastUsed && (
                        <Text style={styles.lastUsedText}>last used</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <View style={{ width: 20 }} />
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>
              CATEGORY
              {type === 'exp' && (
                <Text style={styles.aiLabel}> ✦ AI suggested</Text>
              )}
            </Text>
            <View style={styles.pillsRow}>
              {(type === 'inc' ? INCOME_CATEGORIES : categories).map(
                (cat: any) => {
                  const catName = cat.name;
                  const catKey =
                    type === 'inc' ? cat.key : (cat.emoji ?? '').toLowerCase();
                  const isSel = category === catName;
                  const { bg, text } = resolveCategoryStyle(catKey);

                  return (
                    <TouchableOpacity
                      key={cat.key || cat.id}
                      onPress={() => handleCategoryManualSelect(catName)}
                      style={[
                        styles.catPill,
                        {
                          borderColor: isSel
                            ? text
                            : isDark
                              ? '#333333'
                              : 'rgba(30,30,46,0.12)',
                          backgroundColor: isSel ? bg : colors.white,
                          borderWidth: isSel ? 2 : 1,
                        },
                      ]}
                    >
                      <CategoryIcon
                        categoryKey={catKey}
                        color={isSel ? text : colors.textSecondary}
                        size={14}
                        wrapperSize={22}
                      />
                      <Text
                        style={[
                          styles.catPillText,
                          { color: isSel ? text : colors.textSecondary },
                        ]}
                      >
                        {catName}
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
              <Text style={styles.orText}>or describe</Text>
              <View style={styles.orLine} />
            </View>

            <View
              style={[
                styles.aiField,
                aiInputFocused && { borderColor: colors.primary },
              ]}
            >
              <View
                style={[
                  styles.aiFieldIcon,
                  aiText ? styles.aiFieldIconMapped : {},
                ]}
              />
              <BottomSheetTextInput
                style={[
                  styles.aiFieldText,
                  aiText ? styles.aiFieldTextHasText : {},
                ]}
                placeholder='e.g. "lunch", "grab ride", "gamot"'
                placeholderTextColor={colors.textSecondary}
                value={aiText}
                onChangeText={handleAiTextChange}
                onFocus={() => setAiInputFocused(true)}
                onBlur={() => setAiInputFocused(false)}
                returnKeyType="done"
              />
            </View>

            {!!aiResult && aiResult.suggestedCategory && (
              <View style={styles.aiConfirm}>
                <View style={styles.aiConfirmDot} />
                <Text style={styles.aiConfirmText}>
                  &quot;{aiResult.matchedKeyword}&quot; →{' '}
                  {aiResult.suggestedCategory.charAt(0).toUpperCase() +
                    aiResult.suggestedCategory.slice(1)}{' '}
                  ✓
                </Text>
              </View>
            )}

            {!!aiText && !!aiResult && !aiResult.suggestedCategory && (
              <View style={styles.aiNudge}>
                <View style={styles.aiNudgeDot} />
                <Text style={styles.aiNudgeText}>
                  Not sure about that one — pick a category?
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isSaveDisabled}
            onPress={handleSave}
            style={[
              styles.saveBtnWrap,
              isSaveDisabled && {
                opacity: 0.4,
                shadowOpacity: 0,
                elevation: 0,
              },
            ]}
          >
            <LinearGradient
              colors={['#4a7a5e', '#5B8C6E', '#6a9e7f']}
              style={styles.saveBtn}
            >
              <Text style={styles.saveBtnText}>{saveLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={requestClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>

      {showDiscardPrompt && (
        <View style={styles.discardOverlay}>
          <Pressable style={styles.discardOverlayTap} onPress={handleKeepEditing} />
          <Animated.View style={[styles.discardCard, { transform: [{ translateX: discardShakeX }] }]}>
            <Text style={styles.discardTitle}>Discard transaction?</Text>
            <Text style={styles.discardBody}>You have entered an amount or description. Your draft will be lost.</Text>
            <View style={styles.discardActions}>
              <Pressable style={styles.discardKeepBtn} onPress={handleKeepEditing}>
                <Text style={styles.discardKeepText}>Keep editing</Text>
              </Pressable>
              <Pressable style={styles.discardDropBtn} onPress={handleDiscard}>
                <Text style={styles.discardDropText}>Discard</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}

      <Modal visible={showDatePickerModal} transparent animationType="fade" onRequestClose={cancelDatePicker}>
        <View style={styles.dateModalOverlay}>
          <Pressable style={styles.dateModalBackdrop} onPress={cancelDatePicker} />
          <View style={styles.dateModalCard}>
            <Text style={styles.dateModalTitle}>Select date</Text>

            <View style={styles.dateModalBody}>
              <Calendar
                current={tempSelectedDate}
                onDayPress={(day) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setTempSelectedDate(day.dateString);
                }}
                maxDate={new Date().toISOString().split('T')[0]}
                markedDates={{
                  [tempSelectedDate]: { selected: true, disableTouchEvent: true },
                }}
                theme={{
                  backgroundColor: colors.background,
                  calendarBackground: colors.background,
                  textSectionTitleColor: colors.textSecondary,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: colors.white,
                  todayTextColor: colors.primary,
                  dayTextColor: colors.textPrimary,
                  textDisabledColor: '#d9e1e8',
                  arrowColor: colors.primary,
                  monthTextColor: colors.textPrimary,
                  indicatorColor: colors.primary,
                  textDayFontFamily: 'Inter_600SemiBold',
                  textMonthFontFamily: 'Nunito_800ExtraBold',
                  textDayHeaderFontFamily: 'Inter_700Bold',
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
                style={styles.calendarComponent}
              />
            </View>

            <View style={styles.dateModalActions}>
              <Pressable onPress={cancelDatePicker} style={styles.dateModalCancelBtn}>
                <Text style={styles.dateModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={applyDatePicker} style={styles.dateModalApplyBtn}>
                <Text style={styles.dateModalApplyText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── DYNAMIC STYLES ───────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, height: '100%' },
  sheetBackground: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHandle: { width: 36, height: 4, backgroundColor: isDark ? '#333333' : '#D8D6D0', borderRadius: 2, marginTop: 10, marginBottom: 16 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 60 : 40 },
  datePill: { 
    alignSelf: 'flex-start', 
    borderWidth: 1, 
    borderColor: isDark ? 'rgba(91,140,110,0.3)' : 'rgba(168,213,181,0.3)', 
    backgroundColor: isDark ? 'rgba(91,140,110,0.15)' : '#EBF2EE', 
    borderRadius: 20, 
    paddingVertical: 5, 
    paddingHorizontal: 12, 
    marginBottom: 14 
  },
  datePillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: isDark ? colors.primary : '#3f6b52' },
  sheetTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.textPrimary, marginBottom: 4 },
  sheetSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
  typeToggle: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, width: '100%' },
  typeBtn: { minHeight: 52, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  typeBtnText: { fontFamily: 'Nunito_700Bold', fontSize: 14 },
  amountDisplay: { backgroundColor: colors.catTileEmptyBg, borderWidth: 2, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 18 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start' },
  amountCurr: { fontFamily: 'Inter_600SemiBold', fontSize: 22, color: colors.textSecondary, marginTop: 12, marginRight: 3 },
  amountVal: { fontFamily: 'DMMono_500Medium', fontSize: 52, color: colors.textPrimary, letterSpacing: -2, lineHeight: 58 },
  amountSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  
  // New from main: Amount Limit Toast dynamically styled
  amountLimitToast: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: isDark ? 'rgba(232,133,106,0.15)' : '#FBF0EC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(232,133,106,0.3)' : 'rgba(232,133,106,0.45)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  amountLimitToastText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: isDark ? colors.coral : colors.coralDark,
  },

  numpad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, justifyContent: 'space-between' },
  numKey: { height: 52, backgroundColor: colors.white, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: isDark ? '#333333' : '#e0dfd7', shadowColor: isDark ? '#000' : '#1E1E2E', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  numKeyDel: { backgroundColor: isDark ? 'rgba(192,57,42,0.15)' : '#fde8e0', borderColor: isDark ? colors.expenseRed : '#f0997b', borderWidth: 1 },
  numKeyText: { fontFamily: 'DMMono_500Medium', fontSize: 20, color: colors.textPrimary },
  numKeyTextDel: { color: isDark ? colors.expenseRed : '#c0391a' },
  section: { marginBottom: 18 },
  fieldLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  aiLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: colors.lavenderDark, textTransform: 'none', letterSpacing: 0 },
  logoWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.catTileEmptyBg, borderWidth: 1, borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#FFFFFF' },
  acctText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  lastUsedText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.primary, marginTop: 1 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  catPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  aiFieldWrap: { marginBottom: 24 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)' },
  orText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: colors.textSecondary, letterSpacing: 0.5 },
  aiField: { backgroundColor: isDark ? 'rgba(201,184,245,0.1)' : colors.lavenderLight, borderWidth: 1.5, borderColor: isDark ? 'rgba(201,184,245,0.3)' : colors.lavender, borderRadius: 12, paddingVertical: Platform.OS === 'ios' ? 14 : 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiFieldIcon: { width: 10, height: 10, borderRadius: 3, backgroundColor: isDark ? colors.textSecondary : '#B8B4D8' },
  aiFieldIconMapped: { backgroundColor: colors.primary },
  aiFieldText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textSecondary, flex: 1 },
  aiFieldTextHasText: { fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  aiConfirm: { backgroundColor: isDark ? 'rgba(91,140,110,0.15)' : colors.primaryLight, borderWidth: 1, borderColor: isDark ? 'rgba(91,140,110,0.3)' : 'rgba(91,140,110,0.3)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, alignSelf: 'flex-start' },
  aiConfirmDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  aiConfirmText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: colors.primaryDark },
  aiNudge: { backgroundColor: isDark ? 'rgba(232,133,106,0.15)' : '#FBF0EC', borderWidth: 1, borderColor: isDark ? 'rgba(232,133,106,0.3)' : 'rgba(232,133,106,0.4)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, alignSelf: 'flex-start' },
  aiNudgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.coral },
  aiNudgeText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.coralDark },
  saveBtnWrap: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 4, marginBottom: 12 },
  saveBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  saveBtnText: { fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' },
  cancelBtn: { paddingVertical: 8, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' },

  // ─── NEW FROM MAIN: Modals dynamically styled for dark mode ───
  discardOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  discardOverlayTap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22, 25, 23, 0.3)' },
  discardCard: {
    width: '100%',
    maxWidth: 360,
    zIndex: 1,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: isDark ? '#333333' : '#E6DDD0',
    padding: 18,
    shadowColor: isDark ? '#000' : '#1E1E2E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  discardTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 20, color: colors.textPrimary },
  discardBody: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  discardActions: { flexDirection: 'row', gap: 10 },
  discardKeepBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? '#333333' : '#D8D6D0',
    backgroundColor: colors.catTileEmptyBg,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardKeepText: { fontWeight: '700', fontSize: 13, color: colors.textPrimary },
  discardDropBtn: { flex: 1, borderRadius: 12, backgroundColor: colors.expenseRed, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  discardDropText: { fontWeight: '700', fontSize: 13, color: '#FFFFFF' },

  dateModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  dateModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22, 25, 23, 0.3)' },
  dateModalCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: isDark ? '#333333' : '#E6DDD0',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: isDark ? '#000' : '#1E1E2E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  dateModalTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 18, color: colors.textPrimary, marginBottom: 6, paddingHorizontal: 4 },
  dateModalActions: { flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' },
  dateModalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? '#333333' : '#D8D6D0',
    backgroundColor: colors.catTileEmptyBg,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateModalCancelText: { fontWeight: '700', fontSize: 13, color: colors.textPrimary },
  dateModalApplyBtn: { flex: 1, borderRadius: 12, backgroundColor: colors.primary, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  dateModalApplyText: { fontWeight: '700', fontSize: 13, color: '#FFFFFF' },
  calendarComponent: { backgroundColor: colors.white, borderRadius: 12 },
  dateModalBody: { marginTop: 10, marginBottom: 2 },
});