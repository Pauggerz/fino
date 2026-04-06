import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Dimensions,
  ScrollView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../constants/theme';
import {
  CATEGORY_TILE_BG,
  CATEGORY_COLOR,
  INCOME_CATEGORIES,
} from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import { transitions } from '../constants/transitions';
import {
  createDebouncedAnalyzer,
  type AIAnalysisResult,
} from '../services/aiCategoryMap';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { supabase } from '@/services/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { setLastSaved } from '@/services/lastSavedStore';

// 👇 ADDED THIS IMPORT 👇
import { useSync } from '@/contexts/SyncContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type TxType = 'exp' | 'inc';

type Props = {
  route: RouteProp<RootStackParamList, 'AddTransaction'>;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddTransactionSheet({ route }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const initialMode = route.params?.mode ?? 'expense';

  // 👇 Get our offline sync function 👇
  const { addOfflineTransaction } = useSync();

  // ── Real data from Supabase ──
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

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  useEffect(() => {
    if (type === 'inc') {
      setCategory(INCOME_CATEGORIES[0].name);
    } else if (categories.length > 0) {
      setCategory(categories[0].name);
    }
  }, [type]); 

  useEffect(() => {
    if (categories.length > 0 && !category && type === 'exp') {
      setCategory(categories[0].name);
    }
  }, [categories, category, type]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const analyzer = useRef(createDebouncedAnalyzer()).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: transitions.SHEET_OPEN.duration,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
    return () => analyzer.cancel();
  }, [slideAnim, analyzer]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: transitions.SHEET_DISMISS_SAVE.duration,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => navigation.goBack());
  };

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

  // 👇 UPDATED SAVE LOGIC 👇
  const isSaveDisabled = !amount || amount === '0' || amount === '.' || isSaving;

  const handleSave = async () => {
    if (isSaveDisabled) return;
    const selectedAccount = accounts.find((a) => a.id === accountId);
    if (!selectedAccount) return;

    setIsSaving(true);
    const parsedAmount = parseFloat(amount);
    const txType = type === 'exp' ? 'expense' : 'income';

    try {
      // 1. Build the transaction payload
      const txPayload = {
        user_id: selectedAccount.user_id,
        account_id: accountId,
        amount: parsedAmount,
        type: txType,
        category: category || null,
        display_name: aiText || category || null,
        transaction_note: aiText || null,
        signal_source: signalSource === 'ai_description' ? 'description' : 'manual',
        date: new Date().toISOString(),
        account_deleted: false,
      };

      // 2. Fire and forget the sync context!
      // We removed the 'await' here. If the network hangs, it won't block the UI.
      // The transaction saves to the local Async queue instantly, and the UI moves on.
      addOfflineTransaction(txPayload).catch((err) => {
        console.log('Background sync error (safe to ignore):', err);
      });

      // 3. Attempt to update balance optimistically if online (fails silently if offline)
      const delta = txType === 'expense' ? -parsedAmount : parsedAmount;
      const updateBalance = async () => {
        try {
          await supabase
            .from('accounts')
            .update({ balance: selectedAccount.balance + delta })
            .eq('id', accountId);
        } catch (e) {
          // Fail silently if offline
        }
      };
      updateBalance();

      // 4. Setup Toast and Dismiss immediately
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

  const today = new Date();
  const dateLabel = `📅 Today, ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const amountHasValue = amount.length > 0 && amount !== '0';
  const displayAmount = amount || '0';

  let saveLabel = 'Save income';
  if (isSaving) {
    saveLabel = 'Saving…';
  } else if (type === 'exp') {
    saveLabel = 'Save expense';
  }

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={dismiss}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}
      >
        <Animated.View
          style={[
            styles.sheetPanel,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.sheetHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
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
                  type === 'exp'
                    ? { backgroundColor: '#fde8e0', borderColor: '#e87c5a' }
                    : {
                        backgroundColor: colors.background,
                        borderColor: 'rgba(30,30,46,0.08)',
                      },
                ]}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    {
                      color: type === 'exp' ? '#c0391a' : colors.textSecondary,
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
                  type === 'inc'
                    ? { backgroundColor: '#e8f5ee', borderColor: '#2d6a4f' }
                    : {
                        backgroundColor: colors.background,
                        borderColor: 'rgba(30,30,46,0.08)',
                      },
                ]}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    {
                      color: type === 'inc' ? '#27500A' : colors.textSecondary,
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
                { borderColor: amountHasValue ? colors.primary : '#e0dfd7' },
              ]}
            >
              <View style={styles.amountRow}>
                <Text style={styles.amountCurr}>₱</Text>
                <Text style={styles.amountVal}>{displayAmount}</Text>
              </View>
              {!amountHasValue && (
                <Text style={styles.amountSub}>
                  Tap a number to enter amount
                </Text>
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
                    style={[styles.numKey, isDel && styles.numKeyDel]}
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
                        borderColor: isSel ? '#5B8C6E' : 'rgba(30,30,46,0.12)',
                        backgroundColor: isSel ? '#EBF2EE' : '#FFFFFF',
                        minWidth: 90,
                      }}
                    >
                      {logo ? (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: '#F7F5F2',
                            borderWidth: 1,
                            borderColor: 'rgba(30,30,46,0.08)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          <Image
                            source={logo}
                            style={{ width: 22, height: 22 }}
                            resizeMode="contain"
                          />
                        </View>
                      ) : (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: acc.brand_colour ?? '#888780',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Inter_700Bold',
                              fontSize: 13,
                              color: '#FFFFFF',
                            }}
                          >
                            {avatarLetter}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: 'Inter_600SemiBold',
                            fontSize: 13,
                            color: isSel ? '#2d6a4f' : '#1E1E2E',
                          }}
                          numberOfLines={1}
                        >
                          {acc.name}
                        </Text>
                        {isLastUsed && (
                          <Text
                            style={{
                              fontFamily: 'Inter_400Regular',
                              fontSize: 10,
                              color: '#5B8C6E',
                              marginTop: 1,
                            }}
                          >
                            last used
                          </Text>
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
                {type === 'inc'
                  ? INCOME_CATEGORIES.map((cat) => {
                      const isSel = category === cat.name;
                      const catColor =
                        CATEGORY_COLOR[cat.key] ?? colors.textSecondary;
                      const catBg =
                        CATEGORY_TILE_BG[cat.key] ?? colors.background;
                      return (
                        <TouchableOpacity
                          key={cat.key}
                          onPress={() => handleCategoryManualSelect(cat.name)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 12,
                            borderWidth: isSel ? 2 : 1,
                            borderColor: isSel
                              ? catColor
                              : 'rgba(30,30,46,0.12)',
                            backgroundColor: isSel ? catBg : '#FFFFFF',
                          }}
                        >
                          <CategoryIcon
                            categoryKey={cat.key}
                            color={isSel ? catColor : '#8A8A9A'}
                            size={14}
                            wrapperSize={22}
                          />
                          <Text
                            style={{
                              fontFamily: 'Inter_600SemiBold',
                              fontSize: 13,
                              color: isSel ? catColor : '#8A8A9A',
                            }}
                          >
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  : categories.map((cat) => {
                      const isSel = category === cat.name;
                      const catKey = (cat.emoji ?? '').toLowerCase();
                      const catColor =
                        CATEGORY_COLOR[catKey] ?? colors.textSecondary;
                      const catBg =
                        CATEGORY_TILE_BG[catKey] ?? colors.background;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          onPress={() => handleCategoryManualSelect(cat.name)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 12,
                            borderWidth: isSel ? 2 : 1,
                            borderColor: isSel
                              ? catColor
                              : 'rgba(30,30,46,0.12)',
                            backgroundColor: isSel ? catBg : '#FFFFFF',
                          }}
                        >
                          <CategoryIcon
                            categoryKey={catKey}
                            color={isSel ? catColor : '#8A8A9A'}
                            size={14}
                            wrapperSize={22}
                          />
                          <Text
                            style={{
                              fontFamily: 'Inter_600SemiBold',
                              fontSize: 13,
                              color: isSel ? catColor : '#8A8A9A',
                            }}
                          >
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
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
                <TextInput
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
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,30,46,0.4)',
  },
  kavWrapper: {
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.92,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D8D6D0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  datePill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e0dfd7',
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
    gap: 8,
    marginBottom: 18,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  typeBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
  },
  amountDisplay: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  amountCurr: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    color: '#888780',
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
    width: '31%',
    height: 52,
    backgroundColor: colors.white,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#e0dfd7',
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  numKeyDel: {
    backgroundColor: '#fde8e0',
    borderColor: '#f0997b',
    borderWidth: 1,
  },
  numKeyText: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 20,
    color: colors.textPrimary,
  },
  numKeyTextDel: {
    color: '#c0391a',
  },
  section: {
    marginBottom: 18,
  },
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
  acctOpts: {
    flexDirection: 'row',
    gap: 8,
  },
  acctOpt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,46,0.08)',
    overflow: 'hidden',
  },
  acctOptSel: {
    backgroundColor: '#e8f5ee',
    borderColor: '#2d6a4f',
  },
  acctAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctAvatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.white,
  },
  acctOptName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  acctOptLast: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: colors.textSecondary,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  catPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(30,30,46,0.08)',
    backgroundColor: colors.background,
  },
  catPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  aiFieldWrap: {
    marginBottom: 24,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(30,30,46,0.08)',
  },
  orText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  aiField: {
    backgroundColor: colors.lavenderLight,
    borderWidth: 1.5,
    borderColor: colors.lavender,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiFieldIcon: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#B8B4D8',
  },
  aiFieldIconMapped: {
    backgroundColor: colors.primary,
  },
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
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(91,140,110,0.3)',
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
    backgroundColor: '#FBF0EC',
    borderWidth: 1,
    borderColor: 'rgba(232,133,106,0.4)',
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
    color: colors.white,
  },
  cancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});