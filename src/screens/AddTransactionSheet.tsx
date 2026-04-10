import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Keyboard,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { TouchableOpacity, ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
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

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    bottomSheetRef.current?.close();
  }, []);

  const handleNumTap = (key: string) => {
    if (key === 'back') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (key === '.' && !amount.includes('.')) {
      setAmount((prev) => prev + key);
    } else if (key !== '.' && amount.replace('.', '').length < 7) {
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

      dismiss();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const today = new Date();
  const dateLabel = `📅 Today, ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
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
          <TouchableOpacity activeOpacity={0.7} style={styles.datePill}>
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
            {!amountHasValue && (
              <Text style={styles.amountSub}>Tap a number to enter amount</Text>
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

          <TouchableOpacity onPress={dismiss} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

// ─── DYNAMIC STYLES ───────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, height: '100%' },
    sheetBackground: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      backgroundColor: isDark ? '#333333' : '#D8D6D0',
      borderRadius: 2,
      marginTop: 10,
      marginBottom: 16,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 60 : 40,
    },
    datePill: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      borderRadius: 20,
      paddingVertical: 5,
      paddingHorizontal: 12,
      marginBottom: 14,
    },
    datePillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    sheetTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    sheetSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    typeToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 18,
      width: '100%',
    },
    typeBtn: {
      minHeight: 52,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeBtnText: { fontFamily: 'Nunito_700Bold', fontSize: 14 },
    amountDisplay: {
      backgroundColor: colors.catTileEmptyBg,
      borderWidth: 2,
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
      marginBottom: 18,
    },
    amountRow: { flexDirection: 'row', alignItems: 'flex-start' },
    amountCurr: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 22,
      color: colors.textSecondary,
      marginTop: 12,
      marginRight: 3,
    },
    amountVal: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 52,
      color: colors.textPrimary,
      letterSpacing: -2,
      lineHeight: 58,
    },
    amountSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    numpad: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
      justifyContent: 'space-between',
    },
    numKey: {
      height: 52,
      backgroundColor: colors.white,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0.5,
      borderColor: isDark ? '#333333' : '#e0dfd7',
      shadowColor: isDark ? '#000' : '#1E1E2E',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 1,
    },
    numKeyDel: {
      backgroundColor: isDark ? 'rgba(192,57,42,0.15)' : '#fde8e0',
      borderColor: isDark ? colors.expenseRed : '#f0997b',
      borderWidth: 1,
    },
    numKeyText: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 20,
      color: colors.textPrimary,
    },
    numKeyTextDel: { color: isDark ? colors.expenseRed : '#c0391a' },
    section: { marginBottom: 18 },
    fieldLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    aiLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.lavenderDark,
      textTransform: 'none',
      letterSpacing: 0,
    },
    logoWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.catTileEmptyBg,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: '#FFFFFF',
    },
    acctText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    lastUsedText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.primary,
      marginTop: 1,
    },
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    catPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
    },
    catPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    aiFieldWrap: { marginBottom: 24 },
    orDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginVertical: 12,
    },
    orLine: {
      flex: 1,
      height: 1,
      backgroundColor: isDark ? '#333333' : 'rgba(30,30,46,0.08)',
    },
    orText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      color: colors.textSecondary,
      letterSpacing: 0.5,
    },
    aiField: {
      backgroundColor: isDark ? 'rgba(201,184,245,0.1)' : colors.lavenderLight,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(201,184,245,0.3)' : colors.lavender,
      borderRadius: 12,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    aiFieldIcon: {
      width: 10,
      height: 10,
      borderRadius: 3,
      backgroundColor: isDark ? colors.textSecondary : '#B8B4D8',
    },
    aiFieldIconMapped: { backgroundColor: colors.primary },
    aiFieldText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
    },
    aiFieldTextHasText: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    aiConfirm: {
      backgroundColor: isDark ? 'rgba(91,140,110,0.15)' : colors.primaryLight,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(91,140,110,0.3)' : 'rgba(91,140,110,0.3)',
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 7,
      alignSelf: 'flex-start',
    },
    aiConfirmDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    aiConfirmText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: colors.primaryDark,
    },
    aiNudge: {
      backgroundColor: isDark ? 'rgba(232,133,106,0.15)' : '#FBF0EC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(232,133,106,0.3)' : 'rgba(232,133,106,0.4)',
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 7,
      alignSelf: 'flex-start',
    },
    aiNudgeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.coral,
    },
    aiNudgeText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.coralDark,
    },
    saveBtnWrap: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
      elevation: 4,
      marginBottom: 12,
    },
    saveBtn: {
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.2)',
    },
    saveBtnText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: '#FFFFFF',
    },
    cancelBtn: { paddingVertical: 8, alignItems: 'center' },
    cancelBtnText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
  });
