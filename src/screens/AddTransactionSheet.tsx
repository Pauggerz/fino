import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
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

  // ── Real data from Supabase ──
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const [type, setType] = useState<TxType>(
    initialMode === 'income' ? 'inc' : 'exp'
  );
  const [amount, setAmount] = useState<string>('');
  // accountId is a Supabase UUID; default to the first account when loaded
  const [accountId, setAccountId] = useState<string>('');
  // category is the DB category name (e.g. 'Food')
  const [category, setCategory] = useState<string>('');
  const [aiText, setAiText] = useState<string>('');
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiInputFocused, setAiInputFocused] = useState(false);
  const [signalSource, setSignalSource] = useState<'manual' | 'ai_description'>('manual');
  const [isSaving, setIsSaving] = useState(false);

  // Set defaults once accounts/categories load
  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  useEffect(() => {
    if (categories.length > 0 && !category) setCategory(categories[0].name);
  }, [categories, category]);

  // Sheet slide animation
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // Debounced AI analyzer (stable ref across renders)
  const analyzer = useRef(createDebouncedAnalyzer()).current;

  // ── Slide in on mount ──
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: transitions.SHEET_OPEN.duration, // 340 ms
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
    return () => analyzer.cancel();
  }, [slideAnim, analyzer]);

  // ── Unified dismiss (runs exit animation then pops) ──
  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: transitions.SHEET_DISMISS_SAVE.duration, // 280 ms
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => navigation.goBack());
  };

  // ── Numpad ──
  const handleNumTap = (key: string) => {
    if (key === 'back') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (key === '.' && !amount.includes('.')) {
      setAmount((prev) => prev + key);
    } else if (key !== '.' && amount.replace('.', '').length < 7) {
      setAmount((prev) => prev + key);
    }
  };

  // ── AI description input ──
  const handleAiTextChange = (text: string) => {
    setAiText(text);
    setAiResult(null);
    if (text.trim()) {
      analyzer.analyze(text, (result) => {
        setAiResult(result);
        if (result.suggestedCategory) {
          const matched = categories.find(
            (c) => c.name.toLowerCase() === result.suggestedCategory,
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

  // ── Save → Supabase ──
  const isSaveDisabled = !amount || amount === '0' || amount === '.' || isSaving;

  const handleSave = async () => {
    if (isSaveDisabled) return;
    const selectedAccount = accounts.find((a) => a.id === accountId);
    if (!selectedAccount) return;

    setIsSaving(true);
    const parsedAmount = parseFloat(amount);
    const txType = type === 'exp' ? 'expense' : 'income';

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert({
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
      })
      .select()
      .single();

    if (!error && inserted) {
      // Update account balance
      const delta = txType === 'expense' ? -parsedAmount : parsedAmount;
      await supabase
        .from('accounts')
        .update({ balance: selectedAccount.balance + delta })
        .eq('id', accountId);

      // Store for HomeScreen undo toast
      setLastSaved({
        id: inserted.id,
        accountId,
        previousBalance: selectedAccount.balance,
        amount: parsedAmount,
        type: txType,
        accountName: selectedAccount.name,
        categoryName: category || 'Other',
      });

      dismiss();
    }

    setIsSaving(false);
  };

  // ── Date label ──
  const today = new Date();
  const dateLabel = `📅 Today, ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  // ── Amount display ──
  const amountHasValue = amount.length > 0 && amount !== '0';
  const displayAmount = amount || '0';

  // ── Derived save label ──
  const saveLabel = isSaving ? 'Saving…' : type === 'exp' ? 'Save expense' : 'Save income';

  return (
    <View style={styles.container}>
      {/* Dimmed backdrop */}
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
          {/* Handle */}
          <View style={styles.sheetHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Date pill ── */}
            <TouchableOpacity activeOpacity={0.7} style={styles.datePill}>
              <Text style={styles.datePillText}>{dateLabel}</Text>
            </TouchableOpacity>

            {/* ── Title ── */}
            <Text style={styles.sheetTitle}>Add transaction</Text>
            <Text style={styles.sheetSub}>Log expense or income</Text>

            {/* ── Type toggle ── */}
            <View style={styles.typeToggle}>
              {/* Expense */}
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

              {/* Income */}
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

            {/* ── Amount display ── */}
            <View
              style={[
                styles.amountDisplay,
                { borderColor: amountHasValue ? colors.primary : '#e0dfd7' },
              ]}
            >
              {/* Peso sign — superscripted per spec */}
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

            {/* ── Custom numpad ── */}
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

            {/* ── Account selector ── */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>FROM ACCOUNT</Text>
              <View style={styles.acctOpts}>
                {accounts.map((acc, index) => {
                  const isSel = accountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      onPress={() => setAccountId(acc.id)}
                      style={[styles.acctOpt, isSel && styles.acctOptSel]}
                    >
                      <View
                        style={[
                          styles.acctAvatar,
                          { backgroundColor: acc.brand_colour },
                        ]}
                      >
                        <Text style={styles.acctAvatarLetter}>
                          {acc.letter_avatar}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.acctOptName,
                          isSel && { color: colors.primary },
                        ]}
                      >
                        {acc.name}
                      </Text>
                      {index === 0 && isSel && (
                        <Text style={styles.acctOptLast}>last used</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Category pills ── */}
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>
                CATEGORY <Text style={styles.aiLabel}>✦ AI suggested</Text>
              </Text>
              <View style={styles.pillsRow}>
                {categories.map((cat) => {
                  const isSel = category === cat.name;
                  const bg = cat.tile_bg_colour ?? colors.background;
                  const border = cat.text_colour ?? 'rgba(30,30,46,0.08)';
                  const text = cat.text_colour ?? colors.textSecondary;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => handleCategoryManualSelect(cat.name)}
                      style={[
                        styles.catPill,
                        isSel ? { backgroundColor: bg, borderColor: border } : {},
                      ]}
                    >
                      <Text
                        style={[
                          styles.catPillText,
                          isSel && { color: text },
                        ]}
                      >
                        {cat.emoji ?? '📦'} {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── AI description field ── */}
            <View style={styles.aiFieldWrap}>
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or describe</Text>
                <View style={styles.orLine} />
              </View>

              {/* Real TextInput — debounce triggers aiCategoryMap */}
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

              {/* ai-confirm chip — green dot + mapped label */}
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

              {/* ai-nudge chip — coral dot + prompt */}
              {!!aiText && !!aiResult && !aiResult.suggestedCategory && (
                <View style={styles.aiNudge}>
                  <View style={styles.aiNudgeDot} />
                  <Text style={styles.aiNudgeText}>
                    Not sure about that one — pick a category?
                  </Text>
                </View>
              )}
            </View>

            {/* ── Save button ── */}
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

            {/* ── Cancel — plain text, underlined, no container ── */}
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

  // ── Date pill ──
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

  // ── Title ──
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

  // ── Type toggle ──
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

  // ── Amount display ──
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
  // Peso sign: Inter 600, 22px, #888780, superscripted via marginTop
  amountCurr: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    color: '#888780',
    marginTop: 12, // pushes it down to align with top of large number = superscript look
    marginRight: 3,
  },
  // Amount value: DM Mono 500 (700 not available in DM Mono), 52px per spec
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

  // ── Numpad ──
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
    // spec: 0.5px border, #e0dfd7
    borderWidth: 0.5,
    borderColor: '#e0dfd7',
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  // Delete key: spec says coral bg/text/border
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

  // ── Section ──
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

  // ── Account opts ──
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
  // Letter avatar chip
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

  // ── Category pills — borderRadius: 12 per spec ──
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

  // ── AI description field ──
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
  // spec: background colors.lavenderLight (#F0ECFD), NEVER colors.background
  aiField: {
    backgroundColor: colors.lavenderLight,
    borderWidth: 1.5,
    borderColor: colors.lavender, // #C9B8F5 at rest; switches to colors.primary on focus
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
  // ai-confirm chip: green dot + "keyword" → Category ✓
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
  // ai-nudge chip: coral dot + "Not sure…" prompt
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

  // ── Save button ──
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

  // ── Cancel — plain underlined text, no button container ──
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
