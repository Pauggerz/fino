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
  BottomSheetFooter,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  LinearTransition,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { INCOME_CATEGORIES } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import { FinoIntelIcon } from '@/components/icons/FinoIntelIcon';
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
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Numpad key width calculation
  // paddingHorizontal:20 × 2 = 40, opCol=54, gap=8, inner numGrid gaps=7×2=14
  // paddingHorizontal:20×2=40, opCol=54, gap=8, numGrid inner gaps=7×2=14
  const numGridWidth = windowWidth - 40 - 54 - 8;
  const numKeyWidth = Math.floor((numGridWidth - 14) / 3) - 1; // -1 safety margin

  // Refs
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<any>(null);
  const allowCloseRef = useRef(false);
  const hasOpenedRef = useRef(false);
  const amountLimitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const discardShakeX = useRef(new Animated.Value(0)).current;
  const analyzer = useRef(createDebouncedAnalyzer()).current;
  const aiTextRef = useRef('');

  // ─── Collapse animations ────────────────────────────────────────────────
  // When the AI input is focused, retract the calculator keys to make room
  // for the keyboard. The amount display stays visible above.
  const numpadProgress = useSharedValue(1); // 1 = fully visible, 0 = collapsed
  const numpadAnimatedStyle = useAnimatedStyle(() => ({
    opacity: numpadProgress.value,
    maxHeight: numpadProgress.value * 240, // > numpad height (213) so no clip
    transform: [{ scaleY: 0.6 + numpadProgress.value * 0.4 }],
    overflow: 'hidden',
  }));

  // Same idea for the Expense/Income segmented toggle — it retracts when the
  // AI input is focused so the description field has more room to breathe.
  const segmentProgress = useSharedValue(1);
  const segmentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: segmentProgress.value,
    maxHeight: segmentProgress.value * 60, // > toggle height (42 + margins)
    marginBottom: segmentProgress.value * 10,
    overflow: 'hidden',
  }));

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
  // Same-style modal as the discard prompt, surfaced when validation fails
  // on Save (e.g. missing account or category). Uses the discard card UI
  // and shake animation for visual consistency.
  const [validationPrompt, setValidationPrompt] = useState<{
    title: string;
    body: string;
  } | null>(null);
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

  // When the AI auto-selects a category, promote it to the front so the
  // chip slides into position 0. Reanimated's LinearTransition wrapper on
  // each chip handles the actual move animation (transform-only, native
  // thread). Manual taps don't reorder — only AI does.
  const displayedCategories = useMemo(() => {
    if (signalSource !== 'ai_description' || !category) return sortedCategories;
    const idx = sortedCategories.findIndex((c: any) => c.name === category);
    if (idx <= 0) return sortedCategories;
    const next = [...sortedCategories];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    return next;
  }, [sortedCategories, signalSource, category]);

  const displayedAccounts = useMemo(() => {
    if (!accountAutoSet || !accountId) return sortedAccounts;
    const idx = sortedAccounts.findIndex((a) => a.id === accountId);
    if (idx <= 0) return sortedAccounts;
    const next = [...sortedAccounts];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    return next;
  }, [sortedAccounts, accountAutoSet, accountId]);

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

  // Drive the numpad + segment toggle collapse from AI input focus state.
  useEffect(() => {
    const opts = {
      duration: 240,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    };
    numpadProgress.value = withTiming(aiInputFocused ? 0 : 1, opts);
    segmentProgress.value = withTiming(aiInputFocused ? 0 : 1, opts);
  }, [aiInputFocused, numpadProgress, segmentProgress]);

  // When the keyboard hides — even if the input keeps focus (e.g. user
  // dismissed via the back button) — snap the sheet back to its resting
  // 92% so we don't leave an awkward gap above the now-empty footer area.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      bottomSheetRef.current?.snapToIndex(0);
    });
    return () => sub.remove();
  }, []);

  // First-mount-only initialisation. After the user explicitly unselects a
  // chip, we leave it cleared instead of auto-snapping back to the default.
  const didInitAccountRef = useRef(false);
  const didInitCategoryRef = useRef(false);

  useEffect(() => {
    if (didInitAccountRef.current) return;
    if (accounts.length === 0) return;
    const prefillId = route.params?.prefill?.account;
    const initial =
      prefillId && accounts.some((a) => a.id === prefillId)
        ? prefillId
        : accounts[0].id;
    setAccountId(initial);
    didInitAccountRef.current = true;
  }, [accounts]);

  useEffect(() => {
    if (didInitCategoryRef.current) return;
    if (type === 'inc') {
      setCategory(INCOME_CATEGORIES[0].name);
      didInitCategoryRef.current = true;
    } else if (categories.length > 0) {
      setCategory(categories[0].name);
      didInitCategoryRef.current = true;
    }
  }, [type, categories]);

  // When the user toggles between Expense/Income, still pick a sane default
  // (income and expense use different category sets), but only if the user
  // hasn't manually cleared their selection in the meantime.
  const prevTypeRef = useRef(type);
  useEffect(() => {
    if (prevTypeRef.current === type) return;
    prevTypeRef.current = type;
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
    //    Pass the user's active category names so the analyzer's bubble-up
    //    resolver can pick the most-specific match (e.g. "starbucks" →
    //    "Coffee" if the user has that custom category, otherwise "Food").
    const userCategoryNames = categories.map((c) => c.name);
    analyzer.analyze(text, userCategoryNames, (result) => {
      if (tokenText !== aiTextRef.current) return;
      setAiResult(result);
      // Bubble-up result wins — already in the user's exact category-name
      // form. Fall back to master-name match for safety (e.g. legacy paths
      // where activeCategoryNames was empty).
      let pickedName: string | null = null;
      if (result.resolvedCategory) {
        const matched = categories.find(
          (c) => c.name.toLowerCase() === result.resolvedCategory!.toLowerCase()
        );
        if (matched) pickedName = matched.name;
      }
      if (!pickedName && result.suggestedCategory) {
        const matched = categories.find(
          (c) => c.name.toLowerCase() === result.suggestedCategory
        );
        if (matched) pickedName = matched.name;
      }
      if (pickedName) {
        setCategory(pickedName);
        setSignalSource('ai_description');
      }
      // Auto-fill amount from extracted numbers in the description. Multiple
      // numbers (e.g. "20 for rice and 10 for chicken") populate the
      // calculator with a pending "+" so the user sees `20 + 10` and can
      // press = to total — same shape as a manual keypad entry. Only
      // overwrite when the user hasn't manually entered an amount yet
      // (or the existing amount was itself auto-filled).
      const safeToFill =
        amountAutoFilled || (!amount && !firstOperand && operator === null);
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
      if (
        acctHit &&
        (accountAutoSet || !accountId || accountId === accounts[0]?.id)
      ) {
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
      triggerBlockedFeedback();
      setValidationPrompt({
        title: 'Select an account',
        body: 'Please pick an account before saving this transaction.',
      });
      return;
    }
    // Auto-evaluate any pending operator so the saved amount is the SUM
    // (e.g. "20 + 10" → 30) without forcing the user to press = first.
    const parsedAmount =
      firstOperand && operator
        ? parseFloat(evaluateExpr(firstOperand, operator, amount || '0'))
        : parseFloat(amount || firstOperand || '0');

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      triggerBlockedFeedback();
      setValidationPrompt({
        title: 'Enter an amount',
        body: 'Please type an amount greater than zero before saving.',
      });
      return;
    }
    if (!category) {
      triggerBlockedFeedback();
      setValidationPrompt({
        title: 'Select a category',
        body: 'Please pick a category before saving this transaction.',
      });
      return;
    }

    if (parsedAmount > 9_999_999) {
      triggerBlockedFeedback();
      setValidationPrompt({
        title: 'Amount too large',
        body: 'Please enter an amount under ₱9,999,999.',
      });
      return;
    }

    setIsSaving(true);
    const txType: Transaction['type'] = type === 'exp' ? 'expense' : 'income';

    // Build a structured display name from the description + selected category.
    // Expenses use the category-aware formatter; income transactions stay with
    // the user's note (or fall back to category) so "Salary - Payday" reads OK.
    const masterCat = aiResult?.suggestedCategory ?? null;
    const structuredName =
      txType === 'expense' && masterCat
        ? buildDisplayName(aiText, masterCat, {
            accountSurface: aiAccountSurface,
            label: category || undefined,
          })
        : '';
    const finalDisplayName = structuredName || aiText || category || 'Other';

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

  // Footer is rendered via gorhom's <BottomSheetFooter>, which floats above
  // the scroll content and automatically lifts above the keyboard.
  const renderFooter = useCallback(
    (props: any) => (
      <BottomSheetFooter {...props} bottomInset={insets.bottom}>
        <View style={styles.stickyFooter} pointerEvents="box-none">
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
        </View>
      </BottomSheetFooter>
    ),
    [hasAmountInput, isSaving, type, insets.bottom, styles, handleSave]
  );

  return (
    <View style={styles.container}>
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        // Fixed snap point keeps the sheet at a tall height so collapsing the
        // numpad doesn't shrink the sheet — the AI input simply moves up
        // within the fixed sheet area when the numpad retracts.
        snapPoints={['92%', '100%']}
        topInset={insets.top}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustPan"
        onChange={handleSheetChanges}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            onPress={requestClose}
          />
        )}
        footerComponent={renderFooter}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView
          ref={scrollViewRef}
          style={styles.sheetScroll}
          contentContainerStyle={[
            styles.sheetContent,
            // Reserve room for the floating footer so the AI input clears it.
            { paddingBottom: 88 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
        >
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
          {/* Collapses while the AI input is focused so the description
              field has more vertical room. */}
          <Reanimated.View
            style={segmentAnimatedStyle}
            pointerEvents={aiInputFocused ? 'none' : 'auto'}
          >
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
          </Reanimated.View>

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
                  <Text style={[styles.amountExpr, { color: amountColor }]}>
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
          {/* Collapses while the AI input is focused — amount display above
              stays visible. Pure transform/opacity animation, native thread. */}
          <Reanimated.View
            style={[styles.numpadWrap, numpadAnimatedStyle]}
            pointerEvents={aiInputFocused ? 'none' : 'auto'}
          >
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
          </Reanimated.View>

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
                : displayedAccounts.map((acc, i) => {
                    const isSel = accountId === acc.id;
                    const isRecent =
                      i === 0 &&
                      recentAccountIds.length > 0 &&
                      recentAccountIds[0] === acc.id;
                    const logo = ACCOUNT_LOGOS[acc.name];
                    // Tint the selected chip with the account's own brand
                    // colour so custom accounts surface their own shade
                    // instead of the global primary green.
                    const brand = acc.brand_colour ?? colors.primary;
                    return (
                      <Reanimated.View
                        key={acc.id}
                        layout={LinearTransition.springify()
                          .damping(18)
                          .stiffness(180)
                          .mass(0.6)}
                      >
                        <TouchableOpacity
                          style={[
                            styles.acctChip,
                            isSel && styles.acctChipActive,
                            isSel && { borderColor: brand },
                          ]}
                          onPress={() => {
                            setAccountId(isSel ? '' : acc.id);
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
                          {isRecent && <View style={styles.chipRecentDot} />}
                        </TouchableOpacity>
                      </Reanimated.View>
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
                : displayedCategories.map((cat: any, i: number) => {
                    const catKey =
                      type === 'inc'
                        ? cat.key
                        : (cat.emoji ?? '').toLowerCase();
                    const isSel = category === cat.name;
                    const isRecent =
                      i === 0 &&
                      signalSource !== 'ai_description' &&
                      recentCategoryNames.length > 0 &&
                      recentCategoryNames[0] === cat.name;
                    // Prefer the user-defined colours saved on the category
                    // record (custom categories created in Settings) and fall
                    // back to the static keyword map for the default set.
                    const fallback = resolveCategoryStyle(catKey);
                    const cs = {
                      bg: cat.tile_bg_colour ?? fallback.bg,
                      text: cat.text_colour ?? fallback.text,
                    };
                    return (
                      <Reanimated.View
                        key={cat.id || cat.key}
                        layout={LinearTransition.springify()
                          .damping(18)
                          .stiffness(180)
                          .mass(0.6)}
                      >
                        <TouchableOpacity
                          style={[
                            styles.catChip,
                            isSel && {
                              backgroundColor: cs.bg,
                              borderColor: `${cs.text}55`,
                            },
                          ]}
                          onPress={() => {
                            setCategory(isSel ? '' : cat.name);
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
                          {isRecent && <View style={styles.chipRecentDot} />}
                        </TouchableOpacity>
                      </Reanimated.View>
                    );
                  })}
            </GHScrollView>
          </View>

          {/* ── AI Description Field ────────────────────────────────────── */}
          <View style={styles.aiFieldWrap}>
            <LinearGradient
              colors={
                aiInputFocused
                  ? [colors.primary, colors.lavender]
                  : [colors.border, colors.border]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.aiFieldGradient,
                aiInputFocused && styles.aiFieldGradientFocused,
              ]}
            >
              <View
                style={[
                  styles.aiFieldInner,
                  aiInputFocused && styles.aiFieldInnerFocused,
                ]}
              >
                <View style={styles.aiFieldIcon}>
                  <FinoIntelIcon size={16} color={colors.primary} />
                </View>
                <BottomSheetTextInput
                  style={[
                    styles.aiFieldInput,
                    aiInputFocused && styles.aiFieldInputFocused,
                  ]}
                  value={aiText}
                  onChangeText={handleAiTextChange}
                  onFocus={() => setAiInputFocused(true)}
                  onBlur={() => setAiInputFocused(false)}
                  placeholder="Describe transaction…"
                  placeholderTextColor={colors.textSecondary}
                  returnKeyType="done"
                  multiline
                />
                {aiResult?.suggestedCategory ? (
                  <Reanimated.View
                    entering={FadeIn.duration(180)}
                    exiting={FadeOut.duration(140)}
                    style={styles.aiSuggestionTag}
                  >
                    <Ionicons
                      name="sparkles"
                      size={10}
                      color={colors.primary}
                    />
                    <Text style={styles.aiSuggestionTagText}>
                      {aiResult.resolvedCategory ?? aiResult.suggestedCategory}
                    </Text>
                  </Reanimated.View>
                ) : null}
              </View>
            </LinearGradient>
          </View>

          {/* Fallback hint — fires when the user typed something but the
              taxonomy didn't recognise it. Stays subtle and disappears once
              they pick a category manually (signalSource flips to anything
              non-manual). */}
          {aiText.trim().length > 0 &&
          aiResult &&
          !aiResult.matchedKeyword &&
          signalSource === 'manual' ? (
            <Text style={styles.aiFallbackHint}>
              Fino doesn’t recognize this yet. Pick a category to teach it for
              next time.
            </Text>
          ) : null}

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

      {/* ── Validation Prompt (same look + shake as Discard) ──────────────── */}
      {validationPrompt && (
        <View style={styles.discardOverlay}>
          <Pressable
            style={styles.discardOverlayTap}
            onPress={() => setValidationPrompt(null)}
          />
          <Animated.View
            style={[
              styles.discardCard,
              { transform: [{ translateX: discardShakeX }] },
            ]}
          >
            <Text style={styles.discardTitle}>{validationPrompt.title}</Text>
            <Text style={styles.discardBody}>{validationPrompt.body}</Text>
            <View style={styles.discardActions}>
              <Pressable
                style={styles.discardDropBtn}
                onPress={() => setValidationPrompt(null)}
              >
                <Text style={styles.discardDropText}>Got it</Text>
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
                backgroundColor: colors.white,
                calendarBackground: colors.white,
                textSectionTitleColor: colors.textSecondary,
                selectedDayBackgroundColor: colors.primary,
                selectedDayTextColor: '#FFFFFF',
                todayTextColor: colors.primary,
                dayTextColor: colors.textPrimary,
                textDisabledColor: isDark ? '#44444A' : '#d0cec9',
                arrowColor: colors.textPrimary,
                monthTextColor: colors.textPrimary,
                dotColor: colors.primary,
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
      backgroundColor: colors.border,
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
      height: 42,
      borderRadius: 12,
      backgroundColor: isDark ? colors.surfaceSubdued : '#F0EEE9',
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
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
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
      backgroundColor: colors.white,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
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
      marginBottom: 14, // extra room so the Recent dot doesn't clip
    },
    skeletonChip: {
      height: 34,
      borderRadius: 10,
      backgroundColor: isDark ? colors.surfaceSubdued : '#E8E6E0',
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
      backgroundColor: colors.white,
      borderWidth: 1.5,
      borderColor: colors.border,
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
    chipRecentDot: {
      position: 'absolute',
      bottom: -7,
      left: '50%',
      marginLeft: -2.5,
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.primary,
    },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 34,
      borderRadius: 999,
      paddingHorizontal: 10,
      backgroundColor: isDark ? colors.surfaceSubdued : '#F5F4F0',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    catChipText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
    },
    chipIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },

    // ── AI Description Field (pill, gradient border on focus, floating tag)
    aiFieldWrap: {
      marginHorizontal: 20,
      marginTop: 6,
      marginBottom: 10,
      position: 'relative',
    },
    aiFieldGradient: {
      borderRadius: 999,
      padding: 1.5, // creates the "border" via gradient padding
    },
    aiFieldGradientFocused: {
      borderRadius: 22,
    },
    aiFieldInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 47,
      borderRadius: 999,
      paddingHorizontal: 14,
      backgroundColor: colors.white,
    },
    aiFieldInnerFocused: {
      minHeight: 84,
      borderRadius: 22,
      paddingVertical: 10,
      alignItems: 'flex-start',
    },
    aiFieldIcon: {
      width: 18,
    },
    aiFieldInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      fontFamily: 'Inter_500Medium',
    },
    aiFieldInputFocused: {
      minHeight: 64,
      textAlignVertical: 'top',
      paddingTop: 2,
    },
    aiSuggestionTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: isDark
        ? 'rgba(91,140,110,0.22)'
        : 'rgba(91,140,110,0.12)',
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(91,140,110,0.5)'
        : 'rgba(91,140,110,0.35)',
    },
    aiSuggestionTagText: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    aiFallbackHint: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: colors.textSecondary,
      marginTop: 6,
      marginHorizontal: 24,
      lineHeight: 15,
    },

    // ── Save Button (now a sticky footer)
    sheetFlex: { flex: 1 },
    sheetScroll: { flex: 1 },
    stickyFooter: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.05)',
    },
    saveBtnWrap: {},
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
      borderColor: colors.border,
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
