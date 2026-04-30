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
  Modal,
  Pressable,
  StyleSheet,
  Keyboard,
  Vibration,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import {
  TouchableOpacity,
  ScrollView as GHScrollView,
} from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { INCOME_CATEGORIES } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ACCOUNT_LOGOS } from '@/constants/accountLogos';
import {
  createDebouncedAnalyzer,
  detectAccount,
  buildAmountState,
  buildDisplayName,
  type AIAnalysisResult,
  type Category,
} from '../services/aiCategoryMap';
import { suggestCategory } from '../services/IntelligenceEngine';
import { useAuth } from '../contexts/AuthContext';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { setLastSaved } from '@/services/lastSavedStore';
import { createTransaction } from '@/services/localMutations';
import { getLocalDateString } from '@/utils/date';
import type { Transaction } from '@/types';

type TxType = 'exp' | 'inc';
type Props = { route: RouteProp<RootStackParamList, 'AddTransaction'> };

// ─── Calculator helper ──────────────────────────────────────────────────────
function evaluateExpr(a: string, op: string, b: string): string {
  const A = parseFloat(a) || 0;
  const B = parseFloat(b) || 0;
  let result: number;
  switch (op) {
    case '+':
      result = A + B;
      break;
    case '-':
      result = A - B;
      break;
    case '×':
      result = A * B;
      break;
    case '÷':
      result = B !== 0 ? A / B : A;
      break;
    default:
      result = A;
  }
  const rounded = Math.max(0, Math.round(result * 100) / 100);
  return String(rounded);
}

export default function AddTransactionSheet({ route }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Numpad key width calculation
  // paddingHorizontal:20 × 2 = 40, opCol=54, gap=8, inner numGrid gaps=7×2=14
  // paddingHorizontal:20×2=40, opCol=54, gap=8, numGrid inner gaps=7×2=14
  const numGridWidth = windowWidth - 40 - 54 - 8;
  const numKeyWidth = Math.floor((numGridWidth - 14) / 3) - 1; // -1 safety margin

  // Refs
  const bottomSheetRef = useRef<BottomSheet>(null);
  const allowCloseRef = useRef(false);
  const hasOpenedRef = useRef(false);
  const amountLimitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const discardShakeX = useRef(new Animated.Value(0)).current;
  const analyzer = useRef(createDebouncedAnalyzer()).current;
  const aiTextRef = useRef('');

  // Data Hooks
  const { user } = useAuth();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { categories, loading: categoriesLoading } = useCategories();

  // Skeleton pulse animation
  const skeletonOpacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonOpacity, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [skeletonOpacity]);

  // ─── State ────────────────────────────────────────────────────────────────
  const initialMode = route.params?.mode ?? 'expense';
  const [type, setType] = useState<TxType>(
    initialMode === 'income' ? 'inc' : 'exp'
  );

  // Amount / calculator state
  const [amount, setAmount] = useState<string>(''); // active input (2nd operand or result)
  const [firstOperand, setFirstOperand] = useState<string>(''); // saved 1st operand
  const [operator, setOperator] = useState<string | null>(null);
  const [justEvaled, setJustEvaled] = useState(false);
  // True while the amount field still reflects an auto-filled value from the
  // AI description parser. Reset as soon as the user touches the numpad.
  const [amountAutoFilled, setAmountAutoFilled] = useState(false);

  // Other state
  const [accountId, setAccountId] = useState<string>('');
  // True while the active account was auto-selected by the AI description
  // parser. Reset the moment the user manually taps an account chip.
  const [accountAutoSet, setAccountAutoSet] = useState(false);
  // Surface form (e.g. "gcash", "bpi") that the AI matched against an
  // account — used so the display-name builder can strip it from the items list.
  const [aiAccountSurface, setAiAccountSurface] = useState<string | null>(null);
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
    getLocalDateString(new Date())
  );
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [recentAccountIds, setRecentAccountIds] = useState<string[]>([]);
  const [recentCategoryNames, setRecentCategoryNames] = useState<string[]>([]);

  const hasUnsavedInput =
    amount.trim().length > 0 ||
    firstOperand.trim().length > 0 ||
    aiText.trim().length > 0;

  // ─── Derived ──────────────────────────────────────────────────────────────
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const allCategories = useMemo(
    () => (type === 'inc' ? INCOME_CATEGORIES : categories),
    [type, categories]
  );

  const sortedAccounts = useMemo(() => {
    if (!recentAccountIds.length) return accounts;
    return [...accounts].sort((a, b) => {
      const ai = recentAccountIds.indexOf(a.id);
      const bi = recentAccountIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [accounts, recentAccountIds]);

  const sortedCategories = useMemo(() => {
    if (!recentCategoryNames.length) return allCategories;
    return [...allCategories].sort((a: any, b: any) => {
      const ai = recentCategoryNames.indexOf(a.name);
      const bi = recentCategoryNames.indexOf(b.name);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [allCategories, recentCategoryNames]);

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

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('@fino/recent_accounts').then((v) => {
      if (v) setRecentAccountIds(JSON.parse(v));
    });
    AsyncStorage.getItem('@fino/recent_categories').then((v) => {
      if (v) setRecentCategoryNames(JSON.parse(v));
    });
  }, []);

  useEffect(
    () => () => {
      analyzer.cancel();
      if (amountLimitToastTimerRef.current)
        clearTimeout(amountLimitToastTimerRef.current);
    },
    [analyzer]
  );

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      const prefillId = route.params?.prefill?.account;
      const initial =
        prefillId && accounts.some((a) => a.id === prefillId)
          ? prefillId
          : accounts[0].id;
      setAccountId(initial);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    if (type === 'inc') {
      setCategory(INCOME_CATEGORIES[0].name);
    } else if (categories.length > 0) {
      setCategory(categories[0].name);
    }
  }, [type, categories]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
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
      if (index >= 0) {
        hasOpenedRef.current = true;
        return;
      }
      if (index === -1) {
        if (!hasOpenedRef.current) return; // initial mount animation — not yet visible
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

  const showLimitToast = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowAmountLimitToast(true);
    if (amountLimitToastTimerRef.current)
      clearTimeout(amountLimitToastTimerRef.current);
    amountLimitToastTimerRef.current = setTimeout(
      () => setShowAmountLimitToast(false),
      1100
    );
  }, []);

  const handleNumTap = useCallback(
    (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      // Any manual keypad press means the user is taking over the amount.
      setAmountAutoFilled(false);

      // ── Clear ──
      if (key === 'C') {
        setAmount('');
        setFirstOperand('');
        setOperator(null);
        setJustEvaled(false);
        return;
      }

      // ── Backspace ──
      // Walks back through calculator state: trim active digits first, then
      // remove the pending operator, then trim the saved first operand.
      if (key === 'back') {
        if (amount.length > 0) {
          setAmount((prev) => prev.slice(0, -1));
        } else if (operator !== null) {
          setOperator(null);
        } else if (firstOperand.length > 0) {
          setFirstOperand((prev) => prev.slice(0, -1));
        }
        setJustEvaled(false);
        return;
      }

      // ── Operators ──
      if (['+', '-', '×', '÷'].includes(key)) {
        const current = amount || firstOperand;
        if (!current) return;
        if (operator !== null && amount) {
          // Chain: evaluate pending, then set new operator
          const res = evaluateExpr(firstOperand, operator, amount);
          setFirstOperand(res);
          setAmount('');
        } else if (amount) {
          setFirstOperand(amount);
          setAmount('');
        }
        // else just replace the operator (nothing changes except operator key)
        setOperator(key);
        setJustEvaled(false);
        return;
      }

      // ── Equals ──
      if (key === '=') {
        if (!operator || !firstOperand || !amount) return;
        const res = evaluateExpr(firstOperand, operator, amount);
        setAmount(res);
        setFirstOperand('');
        setOperator(null);
        setJustEvaled(true);
        return;
      }

      // ── Digits & dot ──
      if (justEvaled && operator === null) {
        // Start fresh after =
        if (key === '.') {
          setAmount('0.');
        } else {
          setAmount(key);
        }
        setJustEvaled(false);
        return;
      }

      if (key === '.') {
        if (amount.includes('.')) return;
        setAmount((prev) => `${prev || '0'}.`);
        return;
      }

      // 7-digit limit
      if (amount.replace('.', '').length >= 10) {
        showLimitToast();
        return;
      }

      setAmount((prev) => prev + key);
    },
    [amount, firstOperand, operator, justEvaled, showLimitToast]
  );

  const handleAiTextChange = (text: string) => {
    setAiText(text);
    setAiResult(null);
    const trimmed = text.trim();
    aiTextRef.current = trimmed;
    if (!trimmed) {
      analyzer.cancel();
      setSignalSource('manual');
      setAiAccountSurface(null);
      // Clear any auto-filled amount once the description is empty.
      if (amountAutoFilled) {
        setAmount('');
        setFirstOperand('');
        setOperator(null);
        setJustEvaled(false);
        setAmountAutoFilled(false);
      }
      return;
    }

    // Snapshot the latest typed text so an out-of-order async result can be
    // discarded if the user has since edited the field.
    const tokenText = trimmed;

    // 1) Immediate keyword analyzer — fast UI feedback.
    analyzer.analyze(text, (result) => {
      if (tokenText !== aiTextRef.current) return;
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
      // Auto-fill amount from extracted numbers in the description. Multiple
      // numbers (e.g. "20 for rice and 10 for chicken") populate the
      // calculator with a pending "+" so the user sees `20 + 10` and can
      // press = to total — same shape as a manual keypad entry. Only
      // overwrite when the user hasn't manually entered an amount yet
      // (or the existing amount was itself auto-filled).
      const safeToFill =
        amountAutoFilled ||
        (!amount && !firstOperand && operator === null);
      if (result.extractedAmounts.length > 0) {
        if (safeToFill) {
          const calc = buildAmountState(result.extractedAmounts);
          if (calc) {
            setAmount(calc.amount);
            setFirstOperand(calc.firstOperand);
            setOperator(calc.operator);
            setJustEvaled(false);
            setAmountAutoFilled(true);
          }
        }
      } else if (amountAutoFilled) {
        // Description no longer has any numbers — clear the auto-fill so
        // the value field stops showing a stale amount.
        setAmount('');
        setFirstOperand('');
        setOperator(null);
        setJustEvaled(false);
        setAmountAutoFilled(false);
      }
      // Auto-select an account when the description mentions one ("via gcash",
      // "from BPI", etc.). Honour any manual chip tap by leaving accountAutoSet
      // false there.
      const acctHit = detectAccount(
        tokenText,
        accounts.map((a) => ({ id: a.id, name: a.name }))
      );
      if (acctHit && (accountAutoSet || !accountId || accountId === accounts[0]?.id)) {
        if (acctHit.accountId !== accountId) {
          setAccountId(acctHit.accountId);
        }
        setAccountAutoSet(true);
        setAiAccountSurface(acctHit.matchedKeyword);
      } else if (!acctHit) {
        setAiAccountSurface(null);
      }
    });

    // 2) IntelligenceEngine — checks user's transaction history offline.
    //    A historical match beats the static keyword dictionary because it
    //    captures merchants the user actually buys from.
    if (user?.id) {
      const catNames = categories.map((c) => c.name);
      suggestCategory(user.id, tokenText, catNames)
        .then((sug) => {
          if (tokenText !== aiTextRef.current) return;
          if (
            sug.source === 'history' &&
            sug.category &&
            (sug.confidence === 'high' || sug.confidence === 'medium')
          ) {
            setCategory(sug.category);
            setSignalSource('ai_description');
          }
        })
        .catch(() => {
          /* silent — keyword fallback already applied */
        });
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      );
      Alert.alert(
        'No account selected',
        'Please select an account before saving.'
      );
      return;
    }
    // Auto-evaluate any pending operator so the saved amount is the SUM
    // (e.g. "20 + 10" → 30) without forcing the user to press = first.
    const parsedAmount =
      firstOperand && operator
        ? parseFloat(evaluateExpr(firstOperand, operator, amount || '0'))
        : parseFloat(amount || firstOperand || '0');

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      );
      Alert.alert(
        'Invalid amount',
        'Please enter an amount greater than zero.'
      );
      return;
    }
    if (!category) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      );
      Alert.alert(
        'No category selected',
        'Please select a category before saving.'
      );
      return;
    }

    if (parsedAmount > 9_999_999) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      );
      Alert.alert(
        'Amount too large',
        'Please enter an amount under ₱9,999,999.'
      );
      return;
    }

    setIsSaving(true);
    const txType: Transaction['type'] = type === 'exp' ? 'expense' : 'income';

    // Build a structured display name from the description + selected category.
    // Expenses use the category-aware formatter; income transactions stay with
    // the user's note (or fall back to category) so "Salary - Payday" reads OK.
    const lowerCat = category.toLowerCase();
    const STRUCTURED_CATS: Category[] = [
      'food',
      'transport',
      'shopping',
      'bills',
      'health',
    ];
    const matchedCat = STRUCTURED_CATS.find((c) => c === lowerCat);
    const structuredName =
      txType === 'expense' && matchedCat
        ? buildDisplayName(aiText, matchedCat, {
            accountSurface: aiAccountSurface,
          })
        : '';
    const finalDisplayName =
      structuredName || aiText || category || 'Other';

    try {
      const txId = await createTransaction({
        userId: acc.user_id,
        accountId,
        amount: parsedAmount,
        type: txType,
        category: category || null,
        displayName: finalDisplayName,
        transactionNote: aiText || null,
        signalSource:
          signalSource === 'ai_description' ? 'description' : 'manual',
        date: selectedDate.toISOString(),
      });

      setLastSaved({
        id: txId,
        accountId,
        previousBalance: acc.balance,
        amount: parsedAmount,
        type: txType,
        accountName: acc.name,
        categoryName: category || 'Other',
      });

      const newRecentAccounts = [
        accountId,
        ...recentAccountIds.filter((id) => id !== accountId),
      ].slice(0, 10);
      setRecentAccountIds(newRecentAccounts);
      AsyncStorage.setItem(
        '@fino/recent_accounts',
        JSON.stringify(newRecentAccounts)
      );

      const newRecentCategories = [
        category,
        ...recentCategoryNames.filter((n) => n !== category),
      ].slice(0, 20);
      setRecentCategoryNames(newRecentCategories);
      AsyncStorage.setItem(
        '@fino/recent_categories',
        JSON.stringify(newRecentCategories)
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
      allowCloseRef.current = true;
      Keyboard.dismiss();
      bottomSheetRef.current?.close();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const displayValue =
    amount || (firstOperand && !operator ? firstOperand : '') || '0';
  const amountColor = type === 'exp' ? colors.expenseRed : colors.primary;
  const amountBorderColor =
    type === 'exp' ? 'rgba(192,80,58,0.18)' : 'rgba(91,140,110,0.18)';

  // Live preview of the pending sum so the user sees the running total
  // (e.g. "= ₱30.00") without having to press = first.
  const pendingTotal =
    firstOperand && operator
      ? parseFloat(evaluateExpr(firstOperand, operator, amount || '0'))
      : null;
  const hasAmountInput = amount.length > 0 || firstOperand.length > 0;

  return (
    <View style={styles.container}>
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        enableDynamicSizing
        maxDynamicContentSize={windowHeight * 0.94}
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
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.newHeader}>
            <TouchableOpacity style={styles.dismissBtn} onPress={requestClose}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Transaction</Text>
            <TouchableOpacity
              style={styles.newDatePill}
              onPress={() => setShowDatePickerModal(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={colors.primary}
              />
              <Text style={styles.newDatePillText}>
                {selectedDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Type Toggle (segmented) ──────────────────────────────── */}
          <View style={styles.segmentTrack}>
            {(['exp', 'inc'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.segmentBtn,
                  type === t &&
                    (t === 'exp'
                      ? styles.segmentExpActive
                      : styles.segmentIncActive),
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    type === t &&
                      (t === 'exp' ? styles.textExp : styles.textInc),
                  ]}
                >
                  {t === 'exp' ? '↓ Expense' : '↑ Income'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Amount Box ──────────────────────────────────────────────── */}
          <View style={[styles.amountBox, { borderColor: amountBorderColor }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.amountBoxLabel}>AMOUNT</Text>
              <View style={styles.amountRow}>
                <Text style={[styles.amountCurr, { color: amountColor }]}>
                  ₱
                </Text>
                <Text
                  style={[styles.amountResult, { color: amountColor }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {displayValue}
                </Text>
              </View>
            </View>
            {operator ? (
              <View style={styles.amountExprWrap}>
                <Text style={styles.amountExprLabel}>PENDING</Text>
                <Text style={styles.amountExpr}>
                  {firstOperand} {operator}
                </Text>
                {pendingTotal !== null &&
                Number.isFinite(pendingTotal) &&
                amount.length > 0 ? (
                  <Text
                    style={[styles.amountExpr, { color: amountColor }]}
                  >
                    = ₱{pendingTotal.toFixed(2)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {showAmountLimitToast && (
            <View style={styles.amountLimitToast}>
              <Text style={styles.amountLimitToastText}>
                Max 10 digits reached
              </Text>
            </View>
          )}

          {/* ── Numpad ──────────────────────────────────────────────────── */}
          <View style={styles.numpadWrap}>
            {/* Operator column — C / − / + / = aligned with 4 number rows */}
            <View style={styles.opCol}>
              <TouchableOpacity
                style={styles.clearKey}
                onPress={() => handleNumTap('C')}
              >
                <Text style={styles.clearKeyText}>C</Text>
              </TouchableOpacity>
              {(['-', '+'] as const).map((op) => (
                <TouchableOpacity
                  key={op}
                  style={[styles.opKey, operator === op && styles.opKeyActive]}
                  onPress={() => handleNumTap(op)}
                >
                  <Text
                    style={[
                      styles.opKeyText,
                      operator === op && styles.opKeyTextActive,
                    ]}
                  >
                    {op}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.equalsKey}
                onPress={() => handleNumTap('=')}
              >
                <LinearGradient
                  colors={['#4a7a5e', '#5B8C6E']}
                  style={styles.equalsKeyGradient}
                >
                  <Text style={styles.equalsKeyText}>=</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Number grid — calculator order: 7-8-9 / 4-5-6 / 1-2-3 / . 0 ⌫ */}
            <View style={styles.numGrid}>
              {(
                [
                  '7',
                  '8',
                  '9',
                  '4',
                  '5',
                  '6',
                  '1',
                  '2',
                  '3',
                  '.',
                  '0',
                  'back',
                ] as const
              ).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.numKey,
                    { width: numKeyWidth },
                    key === 'back' && styles.numKeyDel,
                    key === '.' && styles.numKeyDot,
                  ]}
                  onPress={() => handleNumTap(key)}
                  onLongPress={
                    key === 'back' ? () => handleNumTap('C') : undefined
                  }
                >
                  <Text
                    style={[
                      styles.numKeyText,
                      key === 'back' && styles.numKeyTextDel,
                      key === '.' && styles.numKeyTextDot,
                    ]}
                  >
                    {key === 'back' ? '⌫' : key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Account Chips ────────────────────────────────────────────── */}
          <View style={styles.chipSection}>
            <Text style={styles.chipSectionLabel}>ACCOUNT</Text>
            <GHScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipWrap}
            >
              {accountsLoading && accounts.length === 0
                ? [80, 100, 72, 90, 84].map((w, i) => (
                    <Animated.View
                      key={i}
                      style={[
                        styles.skeletonChip,
                        { width: w, opacity: skeletonOpacity },
                      ]}
                    />
                  ))
                : sortedAccounts.map((acc) => {
                    const isSel = accountId === acc.id;
                    const isAutoSelected = isSel && accountAutoSet;
                    const logo = ACCOUNT_LOGOS[acc.name];
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[
                          styles.acctChip,
                          isSel && styles.acctChipActive,
                        ]}
                        onPress={() => {
                          setAccountId(acc.id);
                          setAccountAutoSet(false);
                        }}
                      >
                        <View
                          style={[
                            styles.chipIconWrap,
                            {
                              backgroundColor:
                                acc.brand_colour ?? colors.primaryLight,
                            },
                          ]}
                        >
                          {logo ? (
                            <Image
                              source={logo}
                              style={styles.acctChipLogo}
                              contentFit="contain"
                            />
                          ) : (
                            <Text style={styles.acctChipAvatar}>
                              {acc.letter_avatar ?? '?'}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.acctChipName,
                            isSel && styles.acctChipNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {acc.name}
                        </Text>
                        {isAutoSelected && (
                          <Text style={styles.acctChipAiMark}>✦</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
            </GHScrollView>
          </View>

          {/* ── Category Chips ───────────────────────────────────────────── */}
          <View style={styles.chipSection}>
            <Text style={styles.chipSectionLabel}>CATEGORY</Text>
            <GHScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipWrap}
            >
              {categoriesLoading && categories.length === 0
                ? [88, 68, 96, 76, 104, 72].map((w, i) => (
                    <Animated.View
                      key={i}
                      style={[
                        styles.skeletonChip,
                        { width: w, opacity: skeletonOpacity },
                      ]}
                    />
                  ))
                : sortedCategories.map((cat: any) => {
                    const catKey =
                      type === 'inc'
                        ? cat.key
                        : (cat.emoji ?? '').toLowerCase();
                    const isSel = category === cat.name;
                    const isAutoSelected =
                      isSel && signalSource === 'ai_description';
                    const cs = resolveCategoryStyle(catKey);
                    return (
                      <TouchableOpacity
                        key={cat.id || cat.key}
                        style={[
                          styles.catChip,
                          isSel && {
                            backgroundColor: cs.bg,
                            borderColor: `${cs.text}55`,
                          },
                        ]}
                        onPress={() => {
                          setCategory(cat.name);
                          setSignalSource('manual');
                        }}
                      >
                        <View
                          style={[
                            styles.chipIconWrap,
                            { backgroundColor: cs.bg },
                          ]}
                        >
                          <CategoryIcon
                            categoryKey={catKey}
                            color={isSel ? cs.text : colors.textSecondary}
                            size={12}
                          />
                        </View>
                        <Text
                          style={[
                            styles.catChipText,
                            isSel && {
                              color: cs.text,
                              fontFamily: 'Inter_700Bold',
                            },
                          ]}
                        >
                          {cat.name}
                        </Text>
                        {isAutoSelected && (
                          <Text
                            style={[styles.catChipAiMark, { color: cs.text }]}
                          >
                            ✦
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
            </GHScrollView>
          </View>

          {/* ── AI Description Field ────────────────────────────────────── */}
          <View
            style={[styles.noteRow, aiInputFocused && styles.noteRowFocused]}
          >
            <Text style={styles.noteSparkle}>✦</Text>
            <BottomSheetTextInput
              style={styles.noteInput}
              value={aiText}
              onChangeText={handleAiTextChange}
              onFocus={() => setAiInputFocused(true)}
              onBlur={() => setAiInputFocused(false)}
              placeholder="Describe… AI will suggest a category"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
            />
            {aiResult?.suggestedCategory ? (
              <View style={styles.noteAiBadge}>
                <Text style={styles.noteAiBadgeText}>
                  ✦ {aiResult.suggestedCategory}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Save Button ─────────────────────────────────────────────── */}
          <TouchableOpacity
            disabled={!hasAmountInput || isSaving}
            onPress={handleSave}
            style={styles.saveBtnWrap}
          >
            <LinearGradient
              colors={['#4a7a5e', '#5B8C6E']}
              style={[
                styles.saveBtn,
                (!hasAmountInput || isSaving) && { opacity: 0.45 },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isSaving
                  ? 'Saving…'
                  : type === 'exp'
                    ? 'Save Expense'
                    : 'Save Income'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* ── Discard Prompt ────────────────────────────────────────────────── */}
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

      {/* ── Date Picker Modal ─────────────────────────────────────────────── */}
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
              maxDate={getLocalDateString(new Date())}
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

      {/* picker modals removed — replaced by inline chip rows */}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
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
    sheetContent: {
      paddingBottom: 16,
    },

    // ── Header
    newHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    dismissBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.catTileEmptyBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: colors.textPrimary,
    },
    newDatePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.catTileEmptyBg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    newDatePillText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },

    // ── Type Toggle (segmented)
    segmentTrack: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 10,
      height: 42,
      borderRadius: 12,
      backgroundColor: isDark ? '#1E1E1E' : '#F0EEE9',
      padding: 3,
      gap: 3,
    },
    segmentBtn: {
      flex: 1,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentExpActive: {
      backgroundColor: isDark ? 'rgba(192,57,42,0.22)' : '#FDE8E0',
    },
    segmentIncActive: {
      backgroundColor: isDark ? 'rgba(45,106,79,0.22)' : '#DFF0E8',
    },
    segmentText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: colors.textSecondary,
    },
    textExp: { color: colors.expenseRed },
    textInc: { color: colors.incomeGreen ?? colors.primary },

    // ── Amount Box
    amountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.catTileEmptyBg,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginHorizontal: 20,
      marginBottom: 8,
      borderWidth: 2,
    },
    amountBoxLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.6,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    amountCurr: {
      fontSize: 20,
      fontFamily: 'Inter_600SemiBold',
      marginTop: 2,
    },
    amountResult: {
      fontSize: 36,
      fontFamily: 'DMMono_500Medium',
      letterSpacing: -1,
    },
    amountExprWrap: {
      alignItems: 'flex-end',
      paddingLeft: 8,
    },
    amountExprLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 0.5,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    amountExpr: {
      fontFamily: 'DMMono_500Medium',
      fontSize: 13,
      color: colors.textSecondary,
    },
    amountLimitToast: {
      marginHorizontal: 20,
      marginBottom: 4,
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(192,57,42,0.15)' : 'rgba(192,57,42,0.08)',
      alignSelf: 'flex-start',
    },
    amountLimitToastText: {
      fontSize: 11,
      color: colors.coral ?? colors.expenseRed,
      fontFamily: 'Inter_600SemiBold',
    },

    // ── Numpad
    // 4 op keys match 4 number rows exactly
    numpadWrap: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 8,
      marginTop: 6,
      alignItems: 'flex-start',
    },
    opCol: {
      width: 54,
      height: 205, // 4 × 46px keys + 3 × 7px gaps = exact numGrid height
      gap: 7,
    },
    opKey: {
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E8E6E0',
    },
    opKeyClear: {
      /* unused — C moved to calcActionRow */ height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(192,80,58,0.2)' : 'rgba(192,80,58,0.1)',
    },
    opKeyClearText: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      color: colors.expenseRed,
    },
    opKeyActive: {
      backgroundColor: isDark ? 'rgba(91,140,110,0.2)' : 'rgba(91,140,110,0.1)',
      borderColor: colors.primary,
    },
    opKeyText: {
      fontSize: 20,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    opKeyTextActive: {
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
    },
    opKeyEq: {
      /* unused */ borderRadius: 12,
      overflow: 'hidden',
    },
    opKeyEqGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    opKeyEqText: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: '#FFF',
    },

    // ── C + = action row (below numpad)
    calcActionRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    clearKey: {
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(192,80,58,0.18)' : 'rgba(192,80,58,0.09)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(192,80,58,0.3)' : 'rgba(192,80,58,0.18)',
    },
    clearKeyText: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: colors.expenseRed,
    },
    equalsKey: {
      height: 46,
      borderRadius: 12,
      overflow: 'hidden',
    },
    equalsKeyGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    equalsKeyText: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: '#FFF',
    },

    numGrid: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    numKey: {
      height: 46,
      backgroundColor: colors.white ?? colors.background,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#EEECE8',
    },
    numKeyDel: {
      backgroundColor: isDark ? 'rgba(192,57,42,0.12)' : 'rgba(192,57,42,0.07)',
      borderColor: 'transparent',
    },
    numKeyDot: {
      borderColor: 'transparent',
    },
    numKeyText: {
      fontSize: 20,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    numKeyTextDel: { color: colors.expenseRed },
    numKeyTextDot: { color: colors.textSecondary },

    // ── Chip Rows (account & category)
    chipSection: {
      marginBottom: 8,
    },
    skeletonChip: {
      height: 34,
      borderRadius: 10,
      backgroundColor: isDark ? '#2A2A2A' : '#E8E6E0',
    },
    chipSectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      paddingHorizontal: 20,
      marginBottom: 5,
    },
    chipWrap: {
      paddingHorizontal: 20,
      gap: 7,
    },
    acctChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      borderRadius: 999,
      paddingHorizontal: 10,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: 1.5,
      borderColor: isDark ? '#333' : '#E8E6E0',
    },
    acctChipActive: {
      backgroundColor: isDark
        ? 'rgba(91,140,110,0.18)'
        : 'rgba(91,140,110,0.1)',
      borderColor: colors.primary,
    },
    acctChipLogo: { width: 16, height: 16 },
    acctChipAvatar: { color: '#FFF', fontSize: 9, fontFamily: 'Inter_700Bold' },
    acctChipName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textPrimary,
      maxWidth: 100,
    },
    acctChipNameActive: {
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
    },
    acctChipAiMark: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: colors.primary,
      marginLeft: 2,
    },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 34,
      borderRadius: 999,
      paddingHorizontal: 10,
      backgroundColor: isDark ? '#2A2A2A' : '#F5F4F0',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    catChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    catChipAiMark: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      marginLeft: 2,
    },
    chipIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },

    // ── AI Note Field
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 10,
      backgroundColor: colors.white ?? colors.background,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: isDark ? '#333' : '#EEECE8',
      paddingHorizontal: 12,
      height: 44,
    },
    noteRowFocused: {
      borderColor: colors.primary,
    },
    noteSparkle: {
      fontSize: 14,
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
    },
    noteInput: {
      flex: 1,
      fontSize: 13,
      color: colors.textPrimary,
      fontFamily: 'Inter_400Regular',
    },
    noteAiBadge: {
      backgroundColor: isDark ? 'rgba(91,140,110,0.2)' : 'rgba(91,140,110,0.1)',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    noteAiBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },

    // ── Save Button
    saveBtnWrap: { marginHorizontal: 20 },
    saveBtn: {
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Nunito_700Bold' },

    // ── Discard Prompt
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
      backgroundColor: colors.white ?? colors.background,
      padding: 20,
      borderRadius: 20,
    },
    discardTitle: {
      fontSize: 18,
      fontFamily: 'Nunito_800ExtraBold',
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
      borderColor: isDark ? '#333' : '#EEE',
      alignItems: 'center',
    },
    discardKeepText: { fontFamily: 'Inter_700Bold', color: colors.textPrimary },
    discardDropBtn: {
      flex: 1,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.expenseRed,
      alignItems: 'center',
    },
    discardDropText: { color: '#FFF', fontFamily: 'Inter_700Bold' },

    // ── Date Modal
    dateModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: 20,
    },
    dateModalBackdrop: { ...StyleSheet.absoluteFillObject },
    dateModalCard: {
      backgroundColor: colors.white ?? colors.background,
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
