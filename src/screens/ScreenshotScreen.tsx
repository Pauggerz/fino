import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { supabase } from '../services/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Account } from '@/types';
import {
  ACCOUNT_LOGOS,
  ACCOUNT_AVATAR_OVERRIDE,
} from '@/constants/accountLogos';
import { CategoryIcon } from '@/components/CategoryIcon';
import { FinoIntelIcon } from '@/components/icons/FinoIntelIcon';
import {
  createDebouncedAnalyzer,
  parseReceipt,
  resolveReceipt,
  type AIAnalysisResult,
} from '@/intelligence';
import type { FieldStatus, ParsedField, ParsedReceipt } from '@/intelligence';
import { suggestCategory } from '../services/IntelligenceEngine';

type EditableField = 'merchant' | 'amount';

function CameraIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 15.2c1.77 0 3.2-1.43 3.2-3.2S13.77 8.8 12 8.8 8.8 10.23 8.8 12s1.43 3.2 3.2 3.2zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
      />
    </Svg>
  );
}

function UploadIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"
      />
    </Svg>
  );
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
function Stepper({
  label,
  display,
  onIncrement,
  onDecrement,
  colors,
}: {
  label: string;
  display: string;
  onIncrement: () => void;
  onDecrement: () => void;
  colors: any;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text
        style={{
          fontSize: 10,
          color: colors.textSecondary,
          fontFamily: 'Inter_400Regular',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <TouchableOpacity
        onPress={onIncrement}
        style={{ paddingVertical: 6, paddingHorizontal: 12 }}
      >
        <Text style={{ fontSize: 15, color: colors.primary, lineHeight: 18 }}>
          ▲
        </Text>
      </TouchableOpacity>
      <Text
        style={{
          fontFamily: 'DMMonoMedium',
          fontSize: 16,
          color: colors.textPrimary,
          marginVertical: 2,
          minWidth: 38,
          textAlign: 'center',
        }}
      >
        {display}
      </Text>
      <TouchableOpacity
        onPress={onDecrement}
        style={{ paddingVertical: 6, paddingHorizontal: 12 }}
      >
        <Text style={{ fontSize: 15, color: colors.primary, lineHeight: 18 }}>
          ▼
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ScreenshotScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [lastUsedAccountId, setLastUsedAccountId] = useState<string | null>(
    null
  );
  const [recentCategoryNames, setRecentCategoryNames] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('@fino/recent_accounts').then((v) => {
      if (v) {
        const ids: string[] = JSON.parse(v);
        if (ids.length > 0) setLastUsedAccountId(ids[0]);
      }
    });
    AsyncStorage.getItem('@fino/recent_categories').then((v) => {
      if (v) setRecentCategoryNames(JSON.parse(v));
    });
  }, []);

  // Auto-process an image shared from another app (e-wallet share sheet).
  // RootNavigator passes the file path as `sharedImageUri` when the user
  // taps "Fino" from the OS share sheet — skip the manual upload step.
  useEffect(() => {
    const sharedUri: string | undefined = route.params?.sharedImageUri;
    if (sharedUri) {
      setSelectedImage(sharedUri);
      processReceipt(sharedUri);
    }
  }, [route.params?.sharedImageUri]);

  // Auto-launch the camera or gallery picker once when the screen is opened
  // from the FAB. The user picked the source upstream, so we shouldn't make
  // them tap a second time. Skipped when the screen was opened via the OS
  // share sheet (sharedImageUri is already populated).
  const autoLaunchedRef = useRef(false);
  useEffect(() => {
    if (autoLaunchedRef.current) return;
    if (route.params?.sharedImageUri) return;
    if (!route.params?.initialSource) return;
    autoLaunchedRef.current = true;
    if (route.params.initialSource === 'camera') {
      handleCamera();
    } else {
      handleUpload();
    }
  }, [route.params?.initialSource, route.params?.sharedImageUri]);

  const initialSource: 'camera' | 'upload' =
    route.params?.initialSource ?? 'upload';
  const [selectedSource, setSelectedSource] = useState<'camera' | 'upload'>(
    initialSource
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);
  // Holds the *user category name* (e.g. "Food", "Groceries"). Empty string
  // until the receipt parse or the user picks one. Matches AddTransactionSheet.
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [descriptionText, setDescriptionText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ── AI description state (mirrors AddTransactionSheet) ────────────────────
  const [aiInputFocused, setAiInputFocused] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [signalSource, setSignalSource] = useState<
    'manual' | 'ai_description' | 'merchant'
  >('manual');
  const analyzerRef = useRef(createDebouncedAnalyzer());
  const aiTextRef = useRef('');

  useEffect(() => {
    const a = analyzerRef.current;
    return () => a.cancel();
  }, []);

  // Text/amount edit modal
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Date picker modal
  const [showDateModal, setShowDateModal] = useState(false);
  const [draftMonth, setDraftMonth] = useState(new Date().getMonth());
  const [draftDay, setDraftDay] = useState(new Date().getDate());
  const [draftYear, setDraftYear] = useState(new Date().getFullYear());

  // Account picker modal
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Wallet-based account selection
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [fixedFields, setFixedFields] = useState<string[]>([]);

  const daysInMonth = new Date(draftYear, draftMonth + 1, 0).getDate();

  const hasUnresolvedCheck = parsedData
    ? Object.values(parsedData).some((f) => f.status === 'check')
    : false;

  const handleCamera = async () => {
    setSelectedSource('camera');
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (!result.granted) {
      Alert.alert(
        'Permission required',
        'Camera access is needed to take a photo.'
      );
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!picked.canceled && picked.assets[0]) {
      setSelectedImage(picked.assets[0].uri);
      processReceipt(picked.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    setSelectedSource('upload');
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!result.granted) {
      Alert.alert(
        'Permission required',
        'Gallery access is needed to pick a screenshot.'
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.8,
    });
    if (!picked.canceled && picked.assets[0]) {
      setSelectedImage(picked.assets[0].uri);
      processReceipt(picked.assets[0].uri);
    }
  };

  const processReceipt = async (uri: string) => {
    setIsParsing(true);
    setParsedData(null);

    try {
      const raw = await parseReceipt(uri);
      const { parsed, matchedAccount, category } = resolveReceipt(raw, {
        accounts,
        categories,
        lastUsedAccountId,
      });

      // Preselect a category chip the user actually has; only a real OCR match
      // flips the signal to 'merchant' (a plain first-category fallback doesn't).
      if (category) {
        setSelectedCategory(category.name);
        if (category.signal === 'merchant') setSignalSource('merchant');
      }

      setParsedData(parsed);

      // Auto-select the account the detected wallet/account name matched.
      if (matchedAccount) {
        const full = accounts.find((a) => a.id === matchedAccount.id);
        if (full) setSelectedAccount(full);
      }
    } catch (err: any) {
      Alert.alert('OCR Error', err.message || 'Failed to parse receipt.');
    } finally {
      setIsParsing(false);
    }
  };

  const acceptField = (field: keyof ParsedReceipt) => {
    if (
      !parsedData ||
      !parsedData[field] ||
      parsedData[field]!.status !== 'check'
    )
      return;
    setParsedData((prev) =>
      prev ? { ...prev, [field]: { ...prev[field], status: 'fixed' } } : null
    );
  };

  const openTextEdit = (field: EditableField) => {
    if (!parsedData) return;
    setEditingField(field);
    setEditDraft(String(parsedData[field].value ?? ''));
    setShowEditModal(true);
  };

  const openDateEdit = () => {
    if (!parsedData) return;
    const d = parsedData.date.value
      ? new Date(String(parsedData.date.value))
      : new Date();
    const valid = !Number.isNaN(d.getTime());
    setDraftMonth(valid ? d.getMonth() : new Date().getMonth());
    setDraftDay(valid ? d.getDate() : new Date().getDate());
    setDraftYear(valid ? d.getFullYear() : new Date().getFullYear());
    setShowDateModal(true);
  };

  const saveTextEdit = () => {
    if (!parsedData || !editingField) return;
    setParsedData((prev) =>
      prev
        ? {
            ...prev,
            [editingField]: {
              ...prev[editingField],
              value:
                editingField === 'amount'
                  ? parseFloat(editDraft) || 0
                  : editDraft,
              status: 'fixed',
            },
          }
        : null
    );
    setShowEditModal(false);
    setEditingField(null);
  };

  const saveDateEdit = () => {
    if (!parsedData) return;
    const newDate = new Date(draftYear, draftMonth, draftDay, 12, 0, 0);
    setParsedData((prev) =>
      prev
        ? {
            ...prev,
            date: {
              ...prev.date,
              value: newDate.toISOString(),
              status: 'fixed',
            },
          }
        : null
    );
    setShowDateModal(false);
  };

  const saveAccountEdit = (accountId: string) => {
    setParsedData((prev) =>
      prev
        ? {
            ...prev,
            account: { ...prev.account, value: accountId, status: 'fixed' },
          }
        : null
    );
    setShowAccountModal(false);
  };

  const handleConfirmSave = async () => {
    if (!parsedData || hasUnresolvedCheck || isSaving) return;
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      const rawDate = parsedData.date.value
        ? new Date(String(parsedData.date.value))
        : new Date();
      const isoDate = Number.isNaN(rawDate.getTime())
        ? new Date().toISOString()
        : rawDate.toISOString();

      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        account_id:
          selectedAccount?.id ??
          parsedData.account.value ??
          (lastUsedAccountId && accounts.some((a) => a.id === lastUsedAccountId)
            ? lastUsedAccountId
            : accounts[0]?.id),
        merchant_name: parsedData.merchant.value,
        amount: Number(parsedData.amount.value),
        date: isoDate,
        type: 'expense',
        category: selectedCategory,
        signal_source:
          signalSource === 'ai_description' ? 'description' : 'merchant',
        merchant_confidence: parsedData.merchant.confidence,
        amount_confidence: parsedData.amount.confidence,
        date_confidence: parsedData.date.confidence,
        receipt_url: selectedImage,
      });

      // Persist the picked category so the next visit shows it first.
      if (selectedCategory) {
        const newRecent = [
          selectedCategory,
          ...recentCategoryNames.filter((n) => n !== selectedCategory),
        ].slice(0, 20);
        setRecentCategoryNames(newRecent);
        AsyncStorage.setItem(
          '@fino/recent_categories',
          JSON.stringify(newRecent)
        );
      }

      if (error) throw error;

      // Update account balance
      const accountId =
        selectedAccount?.id ?? String(parsedData.account.value ?? '');
      if (accountId) {
        const { data: acct } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', accountId)
          .single();
        if (acct) {
          await supabase
            .from('accounts')
            .update({ balance: acct.balance - Number(parsedData.amount.value) })
            .eq('id', accountId);
        }
      }

      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Sort user categories by most-recently used (same logic as
  // AddTransactionSheet.sortedCategories).
  const sortedCategories = useMemo(() => {
    if (!recentCategoryNames.length) return categories;
    return [...categories].sort((a, b) => {
      const ai = recentCategoryNames.indexOf(a.name);
      const bi = recentCategoryNames.indexOf(b.name);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [categories, recentCategoryNames]);

  // When the receipt parse OR the AI description picks a category, hoist
  // that chip to position 0 so the user sees the suggestion first. Manual
  // taps don't reorder. Mirrors AddTransactionSheet.displayedCategories.
  const displayedCategories = useMemo(() => {
    if (signalSource === 'manual' || !selectedCategory) return sortedCategories;
    const idx = sortedCategories.findIndex((c) => c.name === selectedCategory);
    if (idx <= 0) return sortedCategories;
    const next = [...sortedCategories];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    return next;
  }, [sortedCategories, signalSource, selectedCategory]);

  const handleAiTextChange = (text: string) => {
    setDescriptionText(text);
    setAiResult(null);
    const trimmed = text.trim();
    aiTextRef.current = trimmed;
    if (!trimmed) {
      analyzerRef.current.cancel();
      // Don't clear the merchant-derived category — fall back to it.
      setSignalSource((prev) =>
        prev === 'ai_description' ? 'merchant' : prev
      );
      return;
    }

    const tokenText = trimmed;
    const userCategoryNames = categories.map((c) => c.name);
    analyzerRef.current.analyze(text, userCategoryNames, (result) => {
      if (tokenText !== aiTextRef.current) return;
      setAiResult(result);
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
        setSelectedCategory(pickedName);
        setSignalSource('ai_description');
      }
    });

    // History-aware suggestion via IntelligenceEngine — same call shape as
    // AddTransactionSheet. A historical match beats the static keyword dict.
    if (user?.id) {
      const catNames = categories.map((c) => c.name);
      suggestCategory(user.id, tokenText, catNames, 'expense')
        .then((sug) => {
          if (tokenText !== aiTextRef.current) return;
          if (
            sug.source === 'history' &&
            sug.category &&
            (sug.confidence === 'high' || sug.confidence === 'medium')
          ) {
            setSelectedCategory(sug.category);
            setSignalSource('ai_description');
          }
        })
        .catch(() => {
          /* silent — keyword fallback already applied */
        });
    }
  };

  const resolveCategoryStyle = (key: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      food: { bg: colors.catFoodBg, text: colors.catFoodText },
      transport: { bg: colors.catTransportBg, text: colors.catTransportText },
      shopping: { bg: colors.catShoppingBg, text: colors.catShoppingText },
      bills: { bg: colors.catBillsBg, text: colors.catBillsText },
      health: { bg: colors.catHealthBg, text: colors.catHealthText },
    };
    return (
      map[key.toLowerCase()] || {
        bg: colors.catTileEmptyBg,
        text: colors.textSecondary,
      }
    );
  };

  const getDateDisplay = (field: ParsedField): string => {
    if (!field.value) return '–';
    const d = new Date(String(field.value));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return String(field.value);
  };

  const renderParsedRow = (
    label: string,
    field: keyof ParsedReceipt,
    displayValue: string,
    onSingleTap: () => void,
    onLongPress: () => void
  ) => {
    if (!parsedData) return null;
    const { status } = parsedData[field] ?? {
      status: 'confirmed' as FieldStatus,
    };
    const isDone = status === 'confirmed' || status === 'fixed';

    return (
      <View style={styles.parsedRow}>
        <Text style={styles.parsedRowLabel}>{label}</Text>
        <TouchableOpacity
          onPress={onSingleTap}
          onLongPress={onLongPress}
          delayLongPress={500}
          style={[
            styles.parsedPill,
            isDone ? styles.parsedPillOk : styles.parsedPillWarn,
          ]}
        >
          <Text
            style={[
              styles.parsedPillText,
              isDone ? styles.parsedPillTextOk : styles.parsedPillTextWarn,
            ]}
          >
            {displayValue}
          </Text>
          {!isDone && <Text style={styles.parsedFixLabel}>Fix ↑</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header (mirrors AddTransactionSheet: dismiss · title · date pill) ── */}
        <View style={styles.newHeader}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.dismissBtn}
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectedSource === 'camera' ? 'Scan Receipt' : 'Upload Receipt'}
          </Text>
          <TouchableOpacity
            style={styles.newDatePill}
            onPress={openDateEdit}
            disabled={!parsedData}
          >
            <Ionicons
              name="calendar-outline"
              size={13}
              color={parsedData ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.newDatePillText,
                !parsedData && { color: colors.textSecondary },
              ]}
            >
              {parsedData
                ? getDateDisplay(parsedData.date).replace(/, \d{4}/, '')
                : 'Date'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.srcToggle}>
          {[
            {
              key: 'camera' as const,
              label: 'Camera',
              Icon: CameraIcon,
              onPress: handleCamera,
            },
            {
              key: 'upload' as const,
              label: 'Upload',
              Icon: UploadIcon,
              onPress: handleUpload,
            },
          ].map(({ key, label, Icon, onPress }) => {
            const isActive = selectedSource === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={onPress}
                style={[styles.srcBtn, isActive && styles.srcBtnActive]}
              >
                <Icon
                  color={isActive ? '#FFFFFF' : colors.textSecondary}
                  size={20}
                />
                <Text
                  style={[
                    styles.srcBtnText,
                    isActive && styles.srcBtnTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.receiptCard}>
          {selectedImage ? (
            <Image
              source={{ uri: selectedImage }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <TouchableOpacity
              onPress={
                selectedSource === 'camera' ? handleCamera : handleUpload
              }
              style={styles.receiptEmpty}
            >
              <Svg width={40} height={40} viewBox="0 0 24 24">
                <Path
                  fill={colors.textSecondary}
                  d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2H4v20h2l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22h2V2h-2l-1.5 1.5zM21 20h-1l-1.5-1.5L17 20l-1.5-1.5L14 20l-1.5-1.5L11 20l-1.5-1.5L8 20l-1.5-1.5L5 20H4V4h1l1.5 1.5L8 4l1.5 1.5L11 4l1.5 1.5L14 4l1.5 1.5L17 4l1.5 1.5L20 4h1v16zM7 12h10v2H7zm0 4h7v2H7zm0-8h10v2H7z"
                />
              </Svg>
              <Text style={styles.receiptEmptyTitle}>
                {selectedSource === 'camera'
                  ? 'Tap to take a photo'
                  : 'Tap to select a receipt'}
              </Text>
              <Text style={styles.receiptEmptyHint}>
                {selectedSource === 'camera'
                  ? 'Point at the receipt'
                  : 'GCash · Maya · BDO · BPI'}
              </Text>
            </TouchableOpacity>
          )}

          {selectedImage && (
            <View style={styles.receiptBadge}>
              <Text style={styles.receiptBadgeText}>⤢ expand</Text>
            </View>
          )}
        </View>

        {isParsing && (
          <View style={styles.parsingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.parsingTitle}>Parsing receipt…</Text>
            <Text style={styles.parsingHint}>Usually under 3 seconds</Text>
          </View>
        )}

        {parsedData && !isParsing && (
          <View style={styles.parsedCard}>
            <View style={styles.parsedHead}>
              <Text style={styles.parsedHeadLabel}>Parsed fields</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                  <Text style={styles.legendText}>Confirmed</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.catShoppingText },
                    ]}
                  />
                  <Text style={styles.legendText}>Check</Text>
                </View>
              </View>
            </View>

            {/* Merchant */}
            {renderParsedRow(
              'Merchant',
              'merchant',
              String(parsedData.merchant.value ?? '–'),
              () => acceptField('merchant'),
              () => openTextEdit('merchant')
            )}

            {/* Amount */}
            {renderParsedRow(
              'Amount',
              'amount',
              parsedData.amount.value != null
                ? `₱${Number(parsedData.amount.value).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '–',
              () => acceptField('amount'),
              () => openTextEdit('amount')
            )}

            {/* Date */}
            {renderParsedRow(
              'Date',
              'date',
              getDateDisplay(parsedData.date),
              () => acceptField('date'),
              () => openDateEdit()
            )}

            {/* Wallet / Account row — matches parsedRow chrome */}
            <View style={[styles.parsedRow, styles.parsedRowDivider]}>
              <Text style={styles.parsedRowLabel}>Account</Text>
              <TouchableOpacity
                onPress={() => setShowAccountPicker(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                {(() => {
                  const acctName =
                    selectedAccount?.name ??
                    String(
                      parsedData.wallet?.value ?? accounts[0]?.name ?? '–'
                    );
                  const logo = ACCOUNT_LOGOS[acctName];
                  const brandColour =
                    selectedAccount?.brand_colour ??
                    accounts.find((a) => a.name === acctName)?.brand_colour ??
                    colors.textSecondary;
                  const letter =
                    selectedAccount?.letter_avatar ?? acctName.charAt(0);
                  const walletConf = parsedData.wallet?.confidence ?? 0;
                  const isConfident =
                    fixedFields.includes('wallet') ||
                    !!selectedAccount ||
                    walletConf >= 0.85;
                  return (
                    <>
                      {logo ? (
                        <View style={styles.acctAvatarLogo}>
                          <Image
                            source={logo}
                            style={{ width: 20, height: 20 }}
                            contentFit="contain"
                            transition={150}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.acctAvatarLetter,
                            { backgroundColor: brandColour },
                          ]}
                        >
                          <Text style={styles.acctAvatarLetterText}>
                            {letter}
                          </Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.parsedPill,
                          isConfident
                            ? styles.parsedPillOk
                            : styles.parsedPillWarn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.parsedPillText,
                            isConfident
                              ? { color: colors.textPrimary }
                              : styles.parsedPillTextWarn,
                          ]}
                        >
                          {acctName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: isConfident
                              ? colors.primary
                              : colors.catShoppingText,
                          }}
                        >
                          ›
                        </Text>
                      </View>
                    </>
                  );
                })()}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {parsedData && !isParsing && hasUnresolvedCheck && (
          <Text style={styles.confirmHint}>
            Tap to confirm · Long press to edit
          </Text>
        )}

        {parsedData && !isParsing && (
          <>
            {/* ── Category section — mirrors AddTransactionSheet's chipSection ── */}
            <View style={styles.chipSectionLabelWrap}>
              <Text style={styles.chipSectionLabel}>Category</Text>
              {(signalSource === 'merchant' ||
                signalSource === 'ai_description') &&
              selectedCategory ? (
                <View style={styles.sectionSrcTag}>
                  <Ionicons name="sparkles" size={10} color={colors.primary} />
                  <Text style={styles.sectionSrcTagText}>
                    {signalSource === 'merchant'
                      ? 'from receipt'
                      : 'AI suggestion'}
                  </Text>
                </View>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipWrap}
            >
              {displayedCategories.length === 0 ? (
                <Text style={styles.chipEmptyHint}>
                  No expense categories yet
                </Text>
              ) : (
                displayedCategories.map((cat, i) => {
                  const catKey = (cat.emoji ?? '').toLowerCase();
                  const isSel = selectedCategory === cat.name;
                  const isRecent =
                    i === 0 &&
                    signalSource === 'manual' &&
                    recentCategoryNames.length > 0 &&
                    recentCategoryNames[0] === cat.name;
                  const fallback = resolveCategoryStyle(catKey);
                  const cs = {
                    bg: cat.tile_bg_colour ?? fallback.bg,
                    text: cat.text_colour ?? fallback.text,
                  };
                  return (
                    <Reanimated.View
                      key={cat.id}
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
                          setSelectedCategory(isSel ? '' : cat.name);
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
                })
              )}
            </ScrollView>

            {/* ── AI Description Field — mirrors AddTransactionSheet.aiField* ── */}
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
                  <TextInput
                    style={[
                      styles.aiFieldInput,
                      aiInputFocused && styles.aiFieldInputFocused,
                    ]}
                    value={descriptionText}
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
                        {aiResult.resolvedCategory ??
                          aiResult.suggestedCategory}
                      </Text>
                    </Reanimated.View>
                  ) : null}
                </View>
              </LinearGradient>
            </View>

            {descriptionText.trim().length > 0 &&
            aiResult &&
            !aiResult.matchedKeyword &&
            signalSource === 'manual' ? (
              <Text style={styles.aiFallbackHint}>
                Fino doesn&apos;t recognize this yet. Pick a category to teach
                it for next time.
              </Text>
            ) : null}
          </>
        )}

        {parsedData && !isParsing && (
          <View style={styles.saveWrap}>
            <TouchableOpacity
              onPress={handleConfirmSave}
              disabled={hasUnresolvedCheck || isSaving}
              style={[
                styles.saveBtn,
                hasUnresolvedCheck && styles.saveBtnDisabled,
                isSaving && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Saving…' : 'Confirm & save'}
              </Text>
            </TouchableOpacity>
            {hasUnresolvedCheck && (
              <Text style={styles.saveBtnHint}>
                Resolve highlighted fields first
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showEditModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowEditModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  Edit {editingField === 'amount' ? 'Amount' : 'Merchant'}
                </Text>
                <TextInput
                  value={editDraft}
                  onChangeText={setEditDraft}
                  autoFocus
                  keyboardType={
                    editingField === 'amount' ? 'decimal-pad' : 'default'
                  }
                  style={styles.modalInput}
                  placeholder={
                    editingField === 'amount' ? '0.00' : 'Merchant name'
                  }
                  placeholderTextColor={colors.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={saveTextEdit}
                />
                <TouchableOpacity
                  onPress={saveTextEdit}
                  style={styles.modalPrimaryBtn}
                >
                  <Text style={styles.modalPrimaryBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showDateModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowDateModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Edit Date</Text>

                <View style={styles.stepperCard}>
                  <View style={{ flexDirection: 'row' }}>
                    <Stepper
                      colors={colors}
                      label="Month"
                      display={MONTHS_SHORT[draftMonth]}
                      onIncrement={() => setDraftMonth((m) => (m + 1) % 12)}
                      onDecrement={() => setDraftMonth((m) => (m + 11) % 12)}
                    />
                    <Stepper
                      colors={colors}
                      label="Day"
                      display={String(draftDay)}
                      onIncrement={() =>
                        setDraftDay((d) => (d < daysInMonth ? d + 1 : 1))
                      }
                      onDecrement={() =>
                        setDraftDay((d) => (d > 1 ? d - 1 : daysInMonth))
                      }
                    />
                    <Stepper
                      colors={colors}
                      label="Year"
                      display={String(draftYear)}
                      onIncrement={() => setDraftYear((y) => y + 1)}
                      onDecrement={() => setDraftYear((y) => y - 1)}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={saveDateEdit}
                  style={styles.modalPrimaryBtn}
                >
                  <Text style={styles.modalPrimaryBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showAccountModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowAccountModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Select Account</Text>
                {accounts.map((acct) => {
                  const isSelected = parsedData?.account.value === acct.id;
                  const logo = ACCOUNT_LOGOS[acct.name];
                  const avatarChar =
                    ACCOUNT_AVATAR_OVERRIDE[acct.name] ??
                    acct.letter_avatar ??
                    acct.name.charAt(0);
                  return (
                    <TouchableOpacity
                      key={acct.id}
                      onPress={() => saveAccountEdit(acct.id)}
                      style={[
                        styles.acctRow,
                        isSelected && styles.acctRowSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.acctRowAvatar,
                          { backgroundColor: `${acct.brand_colour}20` },
                        ]}
                      >
                        {logo ? (
                          <Image
                            source={logo}
                            style={{ width: 36, height: 36 }}
                            contentFit="contain"
                            transition={150}
                          />
                        ) : (
                          <Text
                            style={[
                              styles.acctRowAvatarLetter,
                              { color: acct.brand_colour },
                            ]}
                          >
                            {avatarChar}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.acctRowName}>{acct.name}</Text>
                      {isSelected && <Text style={styles.acctRowCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Wallet account picker modal */}
      <Modal
        visible={showAccountPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountPicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setShowAccountPicker(false)}
        />
        <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { fontFamily: 'Nunito_700Bold' }]}>
            Select account
          </Text>
          {accounts.map((account) => {
            const isSelected = selectedAccount?.id === account.id;
            const logo = ACCOUNT_LOGOS[account.name];
            const avatarLetter =
              ACCOUNT_AVATAR_OVERRIDE[account.name] ?? account.letter_avatar;
            return (
              <TouchableOpacity
                key={account.id}
                onPress={() => {
                  setSelectedAccount(account);
                  setShowAccountPicker(false);
                  if (!fixedFields.includes('wallet')) {
                    setFixedFields((prev) => [...prev, 'wallet']);
                  }
                }}
                style={[styles.acctRow, isSelected && styles.acctRowSelected]}
              >
                {logo ? (
                  <View style={styles.acctPickerLogoWrap}>
                    <Image
                      source={logo}
                      style={{ width: 26, height: 26 }}
                      contentFit="contain"
                      transition={150}
                    />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.acctPickerLetterWrap,
                      {
                        backgroundColor:
                          account.brand_colour ?? colors.textSecondary,
                      },
                    ]}
                  >
                    <Text style={styles.acctPickerLetterText}>
                      {avatarLetter}
                    </Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.acctRowName,
                    isSelected && { color: colors.primary },
                  ]}
                >
                  {account.name}
                </Text>
                {isSelected && <Text style={styles.acctRowCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    // ── Header (mirrors AddTransactionSheet) ──
    newHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
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
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.primaryLight,
    },
    newDatePillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: colors.primary,
    },

    // ── Source toggle ──
    srcToggle: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: colors.white,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    srcBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: 'transparent',
    },
    srcBtnActive: { backgroundColor: colors.primary },
    srcBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: colors.textSecondary,
    },
    srcBtnTextActive: { color: '#FFFFFF' },

    // ── Receipt preview ──
    receiptCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      height: 180,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSubdued,
      position: 'relative',
    },
    receiptEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    receiptEmptyTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.textSecondary,
    },
    receiptEmptyHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
      opacity: 0.7,
    },
    receiptBadge: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    receiptBadgeText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: '#FFFFFF',
    },

    // ── Parsing state ──
    parsingCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: colors.white,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    parsingTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: colors.primary,
    },
    parsingHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
    },

    // ── Parsed fields card ──
    parsedCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: colors.white,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    parsedHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    parsedHeadLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.textSecondary,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: colors.textSecondary,
    },
    parsedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    parsedRowDivider: {
      borderBottomWidth: 0,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    parsedRowLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
    },
    parsedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    parsedPillOk: {
      backgroundColor: colors.catHealthBg,
      borderColor: isDark ? 'rgba(90,176,122,0.4)' : 'rgba(45,106,79,0.25)',
    },
    parsedPillWarn: {
      backgroundColor: colors.catShoppingBg,
      borderColor: isDark ? 'rgba(216,114,133,0.5)' : 'rgba(192,80,58,0.35)',
    },
    parsedPillText: {
      fontFamily: 'DMMonoMedium',
      fontSize: 13,
    },
    parsedPillTextOk: { color: colors.catHealthText },
    parsedPillTextWarn: { color: colors.catShoppingText },
    parsedFixLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.catShoppingText,
    },

    // ── Account avatar inside parsed card ──
    acctAvatarLogo: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    acctAvatarLetter: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acctAvatarLetterText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: '#FFFFFF',
    },

    confirmHint: {
      marginHorizontal: 20,
      marginBottom: 12,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },

    // ── Category section (mirrors AddTransactionSheet) ──
    chipSectionLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      marginTop: 4,
      marginBottom: 5,
    },
    chipSectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    sectionSrcTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    sectionSrcTagText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: colors.primary,
    },
    chipWrap: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 7,
    },
    chipEmptyHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      paddingVertical: 8,
      paddingHorizontal: 4,
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

    // ── AI description (gradient pill, mirrors AddTransactionSheet) ──
    aiFieldWrap: {
      marginHorizontal: 20,
      marginTop: 6,
      marginBottom: 10,
      position: 'relative',
    },
    aiFieldGradient: {
      borderRadius: 999,
      padding: 1.5,
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
    aiFieldIcon: { width: 18 },
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
      borderColor: isDark ? 'rgba(91,140,110,0.5)' : 'rgba(91,140,110,0.35)',
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

    // ── Save button ──
    saveWrap: { marginHorizontal: 20, marginTop: 4 },
    saveBtn: {
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    saveBtnDisabled: {
      backgroundColor: isDark
        ? 'rgba(93,184,126,0.35)'
        : 'rgba(91,140,110,0.4)',
    },
    saveBtnText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: '#FFFFFF',
    },
    saveBtnHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.catShoppingText,
      textAlign: 'center',
      marginTop: 8,
    },

    // ── Modals ──
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 40,
    },
    modalHandle: {
      width: 36,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 20,
    },
    modalTitle: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 18,
      color: colors.textPrimary,
      marginBottom: 16,
    },
    modalInput: {
      backgroundColor: colors.white,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: 'DMMonoMedium',
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 16,
    },
    modalPrimaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
    },
    modalPrimaryBtnText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 16,
      color: '#FFFFFF',
    },
    stepperCard: {
      backgroundColor: colors.white,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },

    // ── Account rows in modals ──
    acctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      marginBottom: 8,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
    },
    acctRowSelected: {
      backgroundColor: colors.primaryLight,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    acctRowAvatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    acctRowAvatarLetter: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 16,
    },
    acctRowName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: colors.textPrimary,
      flex: 1,
    },
    acctRowCheck: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: colors.primary,
    },
    acctPickerLogoWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    acctPickerLetterWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acctPickerLetterText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: '#FFFFFF',
    },
  });
