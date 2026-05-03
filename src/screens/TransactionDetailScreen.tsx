import React, { useState, useEffect, useCallback, useMemo } from 'react';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Skeleton } from '@/components/Skeleton';
import {
  deleteTransaction,
  updateTransaction,
} from '@/services/localMutations';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import type AccountModel from '@/db/models/Account';
import { useAccounts } from '@/hooks/useAccounts';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import { INCOME_CATEGORIES } from '@/constants/categoryMappings';
import { useCategories } from '@/hooks/useCategories';
import type { Transaction } from '@/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { radius, spacing } from '@/constants/theme';

type DetailRouteProp = RouteProp<RootStackParamList, 'TransactionDetail'>;

interface TransactionWithAccount extends Transaction {
  account_name: string;
  account_brand_colour: string;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ─── Numpad ───────────────────────────────────────────────────────────────────

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function NumpadModal({
  visible,
  initialValue,
  accentColor,
  onConfirm,
  onClose,
  colors,
  isDark,
}: {
  visible: boolean;
  initialValue: string;
  accentColor: string;
  onConfirm: (val: string) => void;
  onClose: () => void;
  colors: any;
  isDark: boolean;
}) {
  const [raw, setRaw] = useState(initialValue);

  useEffect(() => {
    if (visible) setRaw(initialValue);
  }, [visible, initialValue]);

  const handleKey = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === '⌫') {
      setRaw((v) => (v.length > 1 ? v.slice(0, -1) : '0'));
      return;
    }
    if (key === '.') {
      if (raw.includes('.')) return;
      setRaw((v) => (v === '0' ? '0.' : v + '.'));
      return;
    }
    setRaw((v) => {
      if (v === '0') return key;
      const parts = v.split('.');
      if (parts[1] !== undefined && parts[1].length >= 2) return v;
      return v + key;
    });
  };

  const parsed = parseFloat(raw) || 0;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(30,30,46,0.45)', justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <View style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              paddingTop: 12,
              paddingBottom: 36,
              paddingHorizontal: spacing.screenPadding,
            }}>
              <View style={{ width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                Amount
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 22, color: accentColor, marginRight: 3 }}>₱</Text>
                <Text style={{ fontFamily: 'DMMono_500Medium', fontSize: 44, color: accentColor, letterSpacing: -1.5 }}>
                  {raw}
                </Text>
              </View>

              {/* Numpad grid — 3 cols */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {NUMPAD_KEYS.map((k) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => handleKey(k)}
                    activeOpacity={0.6}
                    style={{
                      width: '31%',
                      paddingVertical: 16,
                      alignItems: 'center',
                      backgroundColor: k === '⌫'
                        ? (isDark ? 'rgba(192,80,58,0.15)' : 'rgba(192,80,58,0.08)')
                        : colors.white,
                      borderRadius: radius.card,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2e' : 'rgba(30,30,46,0.06)',
                    }}
                  >
                    <Text style={{
                      fontFamily: 'DMMono_500Medium',
                      fontSize: 20,
                      color: k === '⌫' ? colors.expenseRed : colors.textPrimary,
                    }}>
                      {k}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onConfirm(String(parsed));
                }}
                activeOpacity={0.85}
                style={{
                  backgroundColor: accentColor,
                  borderRadius: radius.button,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Date Stepper ─────────────────────────────────────────────────────────────

function Stepper({
  label,
  display,
  onIncrement,
  onDecrement,
  accentColor,
  textColor,
  labelColor,
}: {
  label: string;
  display: string;
  onIncrement: () => void;
  onDecrement: () => void;
  accentColor: string;
  textColor: string;
  labelColor: string;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 10, color: labelColor, fontFamily: 'Inter_400Regular', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <TouchableOpacity onPress={onIncrement} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Ionicons name="chevron-up" size={16} color={accentColor} />
      </TouchableOpacity>
      <Text style={{ fontFamily: 'DMMono_500Medium', fontSize: 17, color: textColor, marginVertical: 2, minWidth: 40, textAlign: 'center' }}>
        {display}
      </Text>
      <TouchableOpacity onPress={onDecrement} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Ionicons name="chevron-down" size={16} color={accentColor} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<DetailRouteProp>();
  const transactionId = route.params?.id;

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const [tx, setTx] = useState<TransactionWithAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const heroOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.95);
  const heroAnim = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ scale: heroScale.value }],
  }));

  // UI state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReceiptVisible, setIsReceiptVisible] = useState(false);

  // Edit state
  const [editedName, setEditedName] = useState('');
  const [editedNote, setEditedNote] = useState('');
  const [editedAccountId, setEditedAccountId] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [editedDate, setEditedDate] = useState(new Date());
  const [editedAmount, setEditedAmount] = useState('0');
  const [editedType, setEditedType] = useState<'expense' | 'income'>('expense');

  // Date picker draft
  const [draftMonth, setDraftMonth] = useState(0);
  const [draftDay, setDraftDay] = useState(1);
  const [draftYear, setDraftYear] = useState(new Date().getFullYear());
  const [draftHour, setDraftHour] = useState(8);
  const [draftMinute, setDraftMinute] = useState(0);
  const [draftAmPm, setDraftAmPm] = useState<'AM' | 'PM'>('AM');

  // Modal visibility
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showAmountModal, setShowAmountModal] = useState(false);

  const resolveCategoryStyle = useCallback(
    (key: string) => {
      switch (key.toLowerCase()) {
        case 'food':       return { bg: colors.catFoodBg,      text: colors.catFoodText };
        case 'transport':  return { bg: colors.catTransportBg,  text: colors.catTransportText };
        case 'shopping':   return { bg: colors.catShoppingBg,   text: colors.catShoppingText };
        case 'bills':      return { bg: colors.catBillsBg,      text: colors.catBillsText };
        case 'health':     return { bg: colors.catHealthBg,     text: colors.catHealthText };
        case 'salary':     return { bg: colors.catHealthBg,     text: colors.catHealthText };
        case 'allowance':  return { bg: colors.catTransportBg,  text: colors.catTransportText };
        case 'freelance':  return { bg: colors.catBillsBg,      text: colors.catBillsText };
        case 'business':   return { bg: colors.catFoodBg,       text: colors.catFoodText };
        case 'gifts':      return { bg: colors.catShoppingBg,   text: colors.catShoppingText };
        case 'investment': return { bg: 'rgba(15,118,110,0.10)', text: '#1a7a6e' };
        case 'transfer':   return { bg: 'rgba(15,118,110,0.12)', text: '#0F766E' };
        case 'adjustment': return { bg: 'rgba(92,85,80,0.14)',   text: '#5C5550' };
        default:           return { bg: colors.catTileEmptyBg,  text: colors.textSecondary };
      }
    },
    [colors]
  );

  const initEditState = (row: TransactionWithAccount) => {
    setEditedName(row.display_name ?? row.merchant_name ?? '');
    setEditedNote(row.transaction_note ?? '');
    setEditedAccountId(row.account_id);
    setEditedCategory((row.category ?? 'food').toLowerCase());
    setEditedAmount(String(row.amount));
    setEditedType((row.type as 'expense' | 'income') ?? 'expense');
    const d = row.transaction_datetime
      ? new Date(row.transaction_datetime)
      : new Date(row.date + 'T00:00:00');
    const h = d.getHours();
    setEditedDate(d);
    setDraftMonth(d.getMonth());
    setDraftDay(d.getDate());
    setDraftYear(d.getFullYear());
    const amPm = h >= 12 ? 'PM' : 'AM';
    let hour = h;
    if (h > 12) hour = h - 12;
    else if (h === 0) hour = 12;
    setDraftAmPm(amPm);
    setDraftHour(hour);
    setDraftMinute(d.getMinutes());
  };

  const fetchTx = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const record = await database.get<TransactionModel>('transactions').find(transactionId);
      let accountName = '';
      let accountColour = colors.textSecondary;
      if (record.accountId) {
        try {
          const acc = await database.get<AccountModel>('accounts').find(record.accountId);
          accountName = acc.name;
          accountColour = acc.brandColour ?? colors.textSecondary;
        } catch { /* not found */ }
      }
      const row: TransactionWithAccount = {
        id: record.id,
        user_id: record.userId,
        account_id: record.accountId,
        amount: record.amount,
        type: record.type as Transaction['type'],
        category: record.category ?? null,
        display_name: record.displayName ?? null,
        merchant_name: record.merchantName ?? null,
        transaction_note: record.transactionNote ?? null,
        receipt_url: record.receiptUrl ?? null,
        account_deleted: record.accountDeleted,
        date: record.date,
        transaction_datetime: record.transactionDatetime ?? null,
        merchant_confidence: record.merchantConfidence ?? null,
        amount_confidence: record.amountConfidence ?? null,
        date_confidence: record.dateConfidence ?? null,
        signal_source: (record.signalSource ?? null) as Transaction['signal_source'],
        created_at: record.serverCreatedAt ?? new Date(record.updatedAt).toISOString(),
        account_name: accountName,
        account_brand_colour: accountColour,
      };
      setTx(row);
      initEditState(row);
    } catch { /* not found */ }
    setLoading(false);
  }, [transactionId, colors]);

  useEffect(() => { fetchTx(); }, [fetchTx]);

  useEffect(() => {
    if (!loading && tx) {
      heroOpacity.value = withTiming(1, { duration: 300 });
      heroScale.value = withSpring(1, { damping: 16, stiffness: 200 });
    }
  }, [loading, tx]);

  const buildDateFromDraft = (): Date => {
    let h24 = draftHour;
    if (draftAmPm === 'PM' && draftHour !== 12) h24 = draftHour + 12;
    if (draftAmPm === 'AM' && draftHour === 12) h24 = 0;
    return new Date(draftYear, draftMonth, draftDay, h24, draftMinute, 0);
  };

  const confirmDate = () => {
    setEditedDate(buildDateFromDraft());
    setShowDateModal(false);
  };

  const openDateModal = () => {
    const d = editedDate;
    const h = d.getHours();
    setDraftMonth(d.getMonth());
    setDraftDay(d.getDate());
    setDraftYear(d.getFullYear());
    const amPm = h >= 12 ? 'PM' : 'AM';
    let hour = h;
    if (h > 12) hour = h - 12;
    else if (h === 0) hour = 12;
    setDraftAmPm(amPm);
    setDraftHour(hour);
    setDraftMinute(d.getMinutes());
    setShowDateModal(true);
  };

  const handleSave = async () => {
    if (!tx) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);
    const parsedAmount = parseFloat(editedAmount) || 0;
    await updateTransaction(tx.id, {
      displayName: editedName || null,
      transactionNote: editedNote || null,
      accountId: editedAccountId,
      category: editedCategory,
      date: editedDate.toISOString(),
      amount: parsedAmount,
      type: editedType,
    });
    const newAcctInfo = accounts.find((a) => a.id === editedAccountId);
    setTx({
      ...tx,
      display_name: editedName,
      transaction_note: editedNote,
      account_id: editedAccountId,
      account_name: newAcctInfo?.name ?? tx.account_name,
      account_brand_colour: newAcctInfo?.brand_colour ?? tx.account_brand_colour,
      category: editedCategory,
      date: editedDate.toISOString(),
      amount: parsedAmount,
      type: editedType,
    });
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (tx) initEditState(tx);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!tx) return;
    setIsDeleting(true);
    await deleteTransaction(tx.id);
    setIsDeleting(false);
    setIsDeleteConfirmVisible(false);
    navigation.goBack();
  };

  // Must be before early returns — hooks cannot appear after conditional returns
  const activeCategories = useMemo(() => {
    if (editedType === 'income') {
      return INCOME_CATEGORIES.map((c) => ({ key: c.key, name: c.name, bg: undefined, text: undefined }));
    }
    return categories.map((c) => ({
      key: c.emoji ?? c.name.toLowerCase(),
      name: c.name,
      bg: c.tile_bg_colour ?? undefined,
      text: c.text_colour ?? undefined,
    }));
  }, [editedType, categories]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.loadingTopBar}>
            <Skeleton width={56} height={36} borderRadius={10} />
            <Skeleton width={120} height={18} style={{ marginLeft: 16, flex: 1 }} />
            <Skeleton width={56} height={18} />
          </View>
          <View style={styles.loadingHero}>
            <Skeleton width={80} height={80} borderRadius={22} style={{ marginBottom: 16 }} />
            <Skeleton width={230} height={18} style={{ marginBottom: 10 }} />
            <Skeleton width={180} height={12} />
          </View>
          <View style={styles.loadingListWrap}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={[styles.loadingRow, i === 4 && { borderBottomWidth: 0 }]}>
                <Skeleton width={92} height={14} />
                <Skeleton width={[120, 150, 100, 130, 80][i]} height={14} />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!tx) {
    return (
      <SafeAreaView style={styles.notFoundContainer}>
        <Text style={styles.notFoundText}>Transaction not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={styles.notFoundBtn}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────────
  const activeCategoryKey = (isEditing ? editedCategory : (tx.category ?? 'default')).toLowerCase();
  const { bg: heroBg, text: heroColor } = resolveCategoryStyle(activeCategoryKey);

  const activeType = isEditing ? editedType : (tx.type as 'expense' | 'income');
  const activeAmount = isEditing ? (parseFloat(editedAmount) || 0) : tx.amount;

  const displayTitle =
    (isEditing ? editedName : tx.display_name?.trim() || tx.merchant_name?.trim() || '') ||
    activeCategoryKey.charAt(0).toUpperCase() + activeCategoryKey.slice(1);

  const formattedAmount = activeAmount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const displayAccountName = isEditing
    ? (accounts.find((a) => a.id === editedAccountId)?.name ?? tx.account_name)
    : tx.account_name;

  const hasTime = isEditing || !!tx.transaction_datetime;
  const displayDate = isEditing
    ? editedDate
    : tx.transaction_datetime
      ? new Date(tx.transaction_datetime)
      : new Date(tx.date + 'T00:00:00');
  const formattedDate = hasTime
    ? displayDate.toLocaleDateString('en-PH', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : displayDate.toLocaleDateString('en-PH', {
        month: 'long', day: 'numeric', year: 'numeric',
      });

  const daysInMonth = new Date(draftYear, draftMonth + 1, 0).getDate();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: heroBg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── HEADER ─── */}
        <View style={styles.header}>
          {isEditing ? (
            <TouchableOpacity onPress={handleCancelEdit} style={{ minWidth: 60 }}>
              <Text style={[styles.headerBtnText, { color: heroColor }]}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backBtnWrap, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)' }]}
            >
              <Ionicons name="arrow-back" size={20} color={heroColor} />
            </TouchableOpacity>
          )}

          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {isEditing ? 'Edit Transaction' : 'Transaction'}
          </Text>

          {isEditing ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={{ minWidth: 60, alignItems: 'flex-end' }}
            >
              <Text style={[styles.headerBtnText, { color: heroColor, opacity: isSaving ? 0.5 : 1 }]}>
                {isSaving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ minWidth: 60 }} />
          )}
        </View>

        {/* ─── HERO ─── */}
        <RAnim.View style={[styles.heroSection, heroAnim]}>
          {/* Category icon — decorative only */}
          <View style={[styles.heroIconBox, { backgroundColor: colors.white }]}>
            <CategoryIcon categoryKey={activeCategoryKey} color={heroColor} size={36} wrapperSize={56} />
          </View>

          {/* Type toggle — only in edit mode */}
          {isEditing && (
            <View style={[styles.typeToggle, { backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.55)' }]}>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditedType('expense'); setEditedCategory('food'); }}
                style={[styles.typeToggleBtn, editedType === 'expense' && { backgroundColor: colors.expenseRed }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeToggleBtnText, { color: editedType === 'expense' ? '#fff' : heroColor }]}>Expense</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditedType('income'); setEditedCategory('salary'); }}
                style={[styles.typeToggleBtn, editedType === 'income' && { backgroundColor: colors.incomeGreen }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeToggleBtnText, { color: editedType === 'income' ? '#fff' : heroColor }]}>Income</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Amount — tappable in edit mode */}
          <TouchableOpacity
            onPress={() => isEditing && setShowAmountModal(true)}
            activeOpacity={isEditing ? 0.7 : 1}
            style={styles.heroAmountWrap}
          >
            <Text style={styles.heroAmountWrap}>
              <Text style={[styles.heroCurrency, { color: heroColor }]}>
                {activeType === 'expense' ? '−₱' : '+₱'}
              </Text>
              <Text style={[styles.heroAmount, { color: heroColor }]}>
                {formattedAmount}
              </Text>
            </Text>
            {isEditing && (
              <Text style={[styles.heroAmountHint, { color: `${heroColor}90` }]}>
                Tap to change
              </Text>
            )}
          </TouchableOpacity>

          {/* Name */}
          {isEditing ? (
            <TextInput
              value={editedName}
              onChangeText={setEditedName}
              style={[styles.heroTitleInput, { color: colors.textPrimary, borderBottomColor: heroColor }]}
              placeholder="Merchant name"
              placeholderTextColor={`${heroColor}70`}
              selectionColor={heroColor}
            />
          ) : (
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{displayTitle}</Text>
          )}

          <Text style={styles.heroDate}>{formattedDate}</Text>
        </RAnim.View>

        {/* ─── DETAILS CARD ─── */}
        <View style={styles.detailsCard}>
          {/* Account */}
          <TouchableOpacity
            style={styles.detailRow}
            onPress={() => { if (isEditing) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAccountModal(true); } }}
            activeOpacity={isEditing ? 0.6 : 1}
          >
            <Text style={styles.detailLabel}>Account</Text>
            <View style={styles.detailValueWrap}>
              <Text style={styles.detailValue} numberOfLines={1}>{displayAccountName || 'None'}</Text>
              {isEditing && <Ionicons name="pencil-outline" size={15} color={heroColor} style={{ opacity: 0.7 }} />}
            </View>
          </TouchableOpacity>

          {/* Date & Time */}
          <TouchableOpacity
            style={styles.detailRow}
            onPress={() => { if (isEditing) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDateModal(); } }}
            activeOpacity={isEditing ? 0.6 : 1}
          >
            <Text style={styles.detailLabel}>Date & time</Text>
            <View style={styles.detailValueWrap}>
              <Text style={styles.detailValue} numberOfLines={1}>{formattedDate}</Text>
              {isEditing && <Ionicons name="pencil-outline" size={15} color={heroColor} style={{ opacity: 0.7 }} />}
            </View>
          </TouchableOpacity>

          {/* Category */}
          <TouchableOpacity
            style={styles.detailRow}
            onPress={() => { if (isEditing) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCategoryModal(true); } }}
            activeOpacity={isEditing ? 0.6 : 1}
          >
            <Text style={styles.detailLabel}>Category</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.categoryPill, { backgroundColor: heroBg, borderColor: heroColor }]}>
                <CategoryIcon categoryKey={activeCategoryKey} color={heroColor} size={12} wrapperSize={20} />
                <Text style={[styles.categoryPillText, { color: heroColor }]}>
                  {activeCategoryKey.charAt(0).toUpperCase() + activeCategoryKey.slice(1)}
                </Text>
              </View>
              {isEditing && <Ionicons name="pencil-outline" size={15} color={heroColor} style={{ opacity: 0.7 }} />}
            </View>
          </TouchableOpacity>

          {/* Type — read-only row (always visible) */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <View style={[
              styles.typeBadge,
              { backgroundColor: activeType === 'expense'
                  ? (isDark ? 'rgba(192,80,58,0.18)' : 'rgba(192,80,58,0.09)')
                  : (isDark ? 'rgba(63,107,82,0.25)' : 'rgba(63,107,82,0.10)') },
            ]}>
              <Text style={[styles.typeBadgeText, { color: activeType === 'expense' ? colors.expenseRed : colors.incomeGreen }]}>
                {activeType === 'expense' ? 'Expense' : 'Income'}
              </Text>
            </View>
          </View>

          {/* Note */}
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>Note</Text>
            {isEditing ? (
              <TextInput
                value={editedNote}
                onChangeText={setEditedNote}
                style={[styles.noteInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
                placeholder="Add a note…"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="done"
                selectionColor={heroColor}
              />
            ) : (
              <Text style={[
                styles.detailValue,
                {
                  flex: 1,
                  color: tx.transaction_note ? colors.textPrimary : colors.textSecondary,
                  fontStyle: tx.transaction_note ? 'normal' : 'italic',
                },
              ]}>
                {tx.transaction_note || 'No note'}
              </Text>
            )}
          </View>
        </View>

        {/* ─── ACTIONS (view mode) ─── */}
        {!isEditing && (
          <View style={styles.actionsWrap}>
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={styles.editBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.editBtnText}>Edit transaction</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                setIsDeleteConfirmVisible(true);
              }}
              style={styles.deleteBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>Delete transaction</Text>
            </TouchableOpacity>
            {tx.receipt_url && (
              <TouchableOpacity
                onPress={() => setIsReceiptVisible(true)}
                style={styles.receiptBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="image-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.receiptBtnText}>View Receipt</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── MODALS ─── */}

      {/* Amount numpad */}
      <NumpadModal
        visible={showAmountModal}
        initialValue={editedAmount}
        accentColor={heroColor}
        onConfirm={(val) => { setEditedAmount(val); setShowAmountModal(false); }}
        onClose={() => setShowAmountModal(false)}
        colors={colors}
        isDark={isDark}
      />

      {/* Account picker */}
      <Modal visible={showAccountModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowAccountModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Select Account</Text>
                {accounts.map((acct) => {
                  const isSelected = acct.id === editedAccountId;
                  const logo = ACCOUNT_LOGOS[acct.name];
                  const avatarChar = ACCOUNT_AVATAR_OVERRIDE[acct.name] ?? acct.letter_avatar ?? acct.name.charAt(0);
                  return (
                    <TouchableOpacity
                      key={acct.id}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditedAccountId(acct.id); setShowAccountModal(false); }}
                      style={[
                        styles.modalItemRow,
                        {
                          backgroundColor: isSelected ? colors.primaryLight : colors.white,
                          borderColor: isSelected ? colors.primary : colors.cardBorderTransparent,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.modalItemAvatar, { backgroundColor: `${acct.brand_colour}20` }]}>
                        {logo ? (
                          <Image source={logo} style={{ width: 36, height: 36 }} contentFit="contain" transition={150} />
                        ) : (
                          <Text style={[styles.modalItemAvatarText, { color: acct.brand_colour }]}>{avatarChar}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemTitle}>{acct.name}</Text>
                        <Text style={styles.modalItemSub}>₱{acct.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
                      </View>
                      {isSelected && <Text style={styles.modalItemCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Category picker */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowCategoryModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Select Category</Text>
                <View style={styles.catGrid}>
                  {activeCategories.map((cat) => {
                    const key = cat.key;
                    const isSelected = editedCategory.toLowerCase() === key;
                    const fallback = resolveCategoryStyle(key);
                    const bg = cat.bg ?? fallback.bg;
                    const text = cat.text ?? fallback.text;
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditedCategory(key); setShowCategoryModal(false); }}
                        style={[
                          styles.catPill,
                          {
                            backgroundColor: isSelected ? bg : colors.white,
                            borderColor: isSelected ? text : colors.cardBorderTransparent,
                            borderWidth: isSelected ? 2 : 1,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <CategoryIcon categoryKey={key} color={isSelected ? text : colors.textSecondary} size={16} wrapperSize={26} />
                        <Text style={[styles.catPillText, { color: isSelected ? text : colors.textSecondary }]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Date picker */}
      <Modal visible={showDateModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowDateModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Date & Time</Text>

                <View style={styles.pickerCard}>
                  <Text style={styles.pickerLabel}>Date</Text>
                  <View style={{ flexDirection: 'row' }}>
                    <Stepper label="Month" display={MONTHS_SHORT[draftMonth]} onIncrement={() => setDraftMonth((m) => (m + 1) % 12)} onDecrement={() => setDraftMonth((m) => (m + 11) % 12)} accentColor={heroColor} textColor={colors.textPrimary} labelColor={colors.textSecondary} />
                    <Stepper label="Day" display={String(draftDay)} onIncrement={() => setDraftDay((d) => (d < daysInMonth ? d + 1 : 1))} onDecrement={() => setDraftDay((d) => (d > 1 ? d - 1 : daysInMonth))} accentColor={heroColor} textColor={colors.textPrimary} labelColor={colors.textSecondary} />
                    <Stepper label="Year" display={String(draftYear)} onIncrement={() => setDraftYear((y) => y + 1)} onDecrement={() => setDraftYear((y) => y - 1)} accentColor={heroColor} textColor={colors.textPrimary} labelColor={colors.textSecondary} />
                  </View>
                </View>

                <View style={styles.pickerCard}>
                  <Text style={styles.pickerLabel}>Time</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Stepper label="Hour" display={String(draftHour)} onIncrement={() => setDraftHour((h) => (h < 12 ? h + 1 : 1))} onDecrement={() => setDraftHour((h) => (h > 1 ? h - 1 : 12))} accentColor={heroColor} textColor={colors.textPrimary} labelColor={colors.textSecondary} />
                    <Text style={[styles.colon, { color: colors.textPrimary }]}>:</Text>
                    <Stepper label="Min" display={String(draftMinute).padStart(2, '0')} onIncrement={() => setDraftMinute((m) => (m + 1) % 60)} onDecrement={() => setDraftMinute((m) => (m + 59) % 60)} accentColor={heroColor} textColor={colors.textPrimary} labelColor={colors.textSecondary} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[styles.pickerLabel, { marginBottom: 4 }]}>AM/PM</Text>
                      <TouchableOpacity
                        onPress={() => setDraftAmPm((ap) => (ap === 'AM' ? 'PM' : 'AM'))}
                        style={[styles.amPmBtn, { backgroundColor: heroColor }]}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.amPmText}>{draftAmPm}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={confirmDate}
                  style={[styles.confirmDateBtn, { backgroundColor: heroColor }]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmDateText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={isDeleteConfirmVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => !isDeleting && setIsDeleteConfirmVisible(false)}>
          <View style={styles.modalFadeOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.deleteCard}>
                <Text style={styles.deleteTitle}>Delete transaction?</Text>
                <Text style={styles.deleteSub}>
                  This will permanently remove this transaction and restore the account balance.
                </Text>
                <TouchableOpacity
                  onPress={handleDelete}
                  disabled={isDeleting}
                  style={[styles.deleteConfirmBtn, { opacity: isDeleting ? 0.6 : 1 }]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteConfirmText}>{isDeleting ? 'Deleting…' : 'Delete'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsDeleteConfirmVisible(false)} style={styles.deleteCancelBtn} activeOpacity={0.7}>
                  <Text style={styles.deleteCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Receipt viewer */}
      <Modal visible={isReceiptVisible} transparent animationType="fade">
        <View style={styles.receiptOverlay}>
          <TouchableOpacity style={styles.receiptCloseBtn} onPress={() => setIsReceiptVisible(false)} activeOpacity={0.8}>
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          <Image source={{ uri: tx.receipt_url! }} style={styles.receiptImg} contentFit="contain" transition={200} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, backgroundColor: colors.background },
    loadingTopBar: {
      paddingHorizontal: spacing.screenPadding, paddingTop: 12, paddingBottom: 8,
      flexDirection: 'row', alignItems: 'center',
    },
    loadingHero: {
      alignItems: 'center', paddingTop: 16, paddingBottom: 32, paddingHorizontal: 24,
    },
    loadingListWrap: {
      marginHorizontal: spacing.screenPadding, backgroundColor: colors.white,
      borderRadius: radius.cardLg, overflow: 'hidden',
    },
    loadingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: isDark ? '#333333' : 'rgba(30,30,46,0.07)',
      minHeight: 52,
    },

    notFoundContainer: {
      flex: 1, backgroundColor: colors.background,
      justifyContent: 'center', alignItems: 'center',
    },
    notFoundText: { fontFamily: 'Inter_400Regular', color: colors.textSecondary },
    notFoundBtn: { color: colors.primary, fontFamily: 'Inter_600SemiBold' },

    // Header
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.screenPadding, paddingTop: 12, paddingBottom: 8,
    },
    headerBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    backBtnWrap: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: {
      flex: 1, textAlign: 'center',
      fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
    },

    // Hero
    heroSection: {
      alignItems: 'center', paddingTop: 16, paddingBottom: 32, paddingHorizontal: 24,
    },
    heroIconBox: {
      width: 80, height: 80, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    },

    // Type toggle (edit mode only)
    typeToggle: {
      flexDirection: 'row', borderRadius: radius.pill,
      padding: 3, marginBottom: 12, gap: 2,
    },
    typeToggleBtn: {
      paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.pill,
    },
    typeToggleBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },

    heroAmountWrap: { marginBottom: 4, alignItems: 'center' },
    heroAmountHint: {
      fontFamily: 'Inter_400Regular', fontSize: 11,
      marginTop: 2, letterSpacing: 0.3,
    },
    heroCurrency: { fontFamily: 'Inter_600SemiBold', fontSize: 22 },
    heroAmount: {
      fontFamily: 'DMMono_500Medium', fontSize: 42,
      fontWeight: '700', letterSpacing: -2,
    },
    heroTitleInput: {
      fontFamily: 'Nunito_700Bold', fontSize: 18,
      textAlign: 'center', borderBottomWidth: 1.5,
      paddingBottom: 4, paddingHorizontal: 8,
      minWidth: 200, marginBottom: 4,
    },
    heroTitle: {
      fontFamily: 'Nunito_700Bold', fontSize: 18,
      marginBottom: 4, textAlign: 'center',
      color: colors.textPrimary,
    },
    heroDate: {
      fontFamily: 'Inter_400Regular', fontSize: 12,
      color: colors.textSecondary, textAlign: 'center',
    },

    // Details card
    detailsCard: {
      marginHorizontal: spacing.screenPadding,
      backgroundColor: colors.white,
      borderRadius: radius.cardLg,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : 'transparent',
    },
    detailRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: isDark ? '#333333' : 'rgba(30,30,46,0.07)',
      minHeight: 52,
    },
    detailLabel: {
      fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.textSecondary,
    },
    detailValueWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      flex: 1, justifyContent: 'flex-end',
    },
    detailValue: {
      fontFamily: 'Inter_600SemiBold', fontSize: 14,
      color: colors.textPrimary, textAlign: 'right',
      flex: 0, marginLeft: 16, flexShrink: 1,
    },
    categoryPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderRadius: radius.card,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    categoryPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    typeBadge: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
    },
    typeBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    noteInput: {
      fontFamily: 'Inter_600SemiBold', fontSize: 14,
      textAlign: 'right', flex: 1, marginLeft: 16,
      borderBottomWidth: 1, paddingBottom: 2,
    },

    // Actions
    actionsWrap: { paddingHorizontal: spacing.screenPadding, marginTop: 20, gap: 12 },
    editBtn: {
      backgroundColor: colors.lavenderLight, borderRadius: radius.button,
      paddingVertical: 16, alignItems: 'center',
      borderWidth: 1, borderColor: colors.lavender,
    },
    editBtnText: {
      fontFamily: 'Nunito_700Bold', fontSize: 16, color: colors.lavenderDark,
    },
    deleteBtn: { alignItems: 'center', paddingVertical: 12 },
    deleteBtnText: {
      fontFamily: 'Inter_400Regular', fontSize: 13,
      color: colors.coralDark, textDecorationLine: 'underline',
    },
    receiptBtn: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 6, paddingVertical: 12,
    },
    receiptBtnText: {
      fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.textSecondary,
    },

    // Bottom sheet modals
    modalOverlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(30,30,46,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
      padding: spacing.screenPadding, paddingBottom: 40,
    },
    modalHandle: {
      width: 36, height: 4, backgroundColor: colors.border,
      borderRadius: 2, alignSelf: 'center', marginBottom: 20,
    },
    modalTitle: {
      fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
      color: colors.textPrimary, marginBottom: 16,
    },
    modalItemRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 16,
      borderRadius: radius.card, marginBottom: 8, borderWidth: 1,
    },
    modalItemAvatar: {
      width: 40, height: 40, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    modalItemAvatarText: { fontFamily: 'Nunito_800ExtraBold', fontSize: 16 },
    modalItemTitle: { fontFamily: 'Nunito_700Bold', fontSize: 15, color: colors.textPrimary },
    modalItemSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.textSecondary },
    modalItemCheck: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.primary },

    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    catPill: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.card,
    },
    catPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },

    // Date picker
    pickerCard: {
      backgroundColor: colors.white, borderRadius: radius.card,
      padding: 16, marginBottom: 10,
      borderWidth: 1, borderColor: isDark ? '#333333' : 'transparent',
    },
    pickerLabel: {
      fontFamily: 'Inter_700Bold', fontSize: 10, color: colors.textSecondary,
      letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
    },
    colon: { fontFamily: 'DMMono_500Medium', fontSize: 22, marginTop: 14 },
    amPmBtn: {
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
      minWidth: 52, alignItems: 'center',
    },
    amPmText: { fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' },
    confirmDateBtn: { borderRadius: radius.button, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
    confirmDateText: { fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' },

    // Delete confirm (centered card)
    modalFadeOverlay: {
      flex: 1, backgroundColor: 'rgba(30,30,46,0.5)',
      justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
    },
    deleteCard: {
      backgroundColor: colors.white, borderRadius: radius.cardLg,
      padding: 24, width: '100%',
      borderWidth: 1, borderColor: isDark ? '#333333' : 'transparent',
    },
    deleteTitle: {
      fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
      color: colors.textPrimary, marginBottom: 8,
    },
    deleteSub: {
      fontFamily: 'Inter_400Regular', fontSize: 14,
      color: colors.textSecondary, marginBottom: 24, lineHeight: 20,
    },
    deleteConfirmBtn: {
      backgroundColor: colors.expenseRed, borderRadius: radius.card,
      paddingVertical: 14, alignItems: 'center', marginBottom: 10,
    },
    deleteConfirmText: { fontFamily: 'Nunito_700Bold', fontSize: 15, color: '#FFFFFF' },
    deleteCancelBtn: { paddingVertical: 12, alignItems: 'center' },
    deleteCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textSecondary },

    // Receipt
    receiptOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
      justifyContent: 'center', alignItems: 'center',
    },
    receiptCloseBtn: { position: 'absolute', top: 60, right: 24, zIndex: 10, padding: 8 },
    receiptImg: { width: '100%', height: '80%' },
  });
