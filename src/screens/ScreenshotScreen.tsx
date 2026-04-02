import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../services/supabase';
import { useNavigation } from '@react-navigation/native';
import { useAccounts } from '@/hooks/useAccounts';
import { ACCOUNT_LOGOS, ACCOUNT_AVATAR_OVERRIDE } from '@/constants/accountLogos';
import { CATEGORY_COLOR, CATEGORY_TILE_BG } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import { colors } from '@/constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type FieldStatus = 'confirmed' | 'check' | 'fixed';

interface ParsedField {
  value: string | number | null;
  confidence: number;
  status: FieldStatus;
}

interface ParsedReceipt {
  account: ParsedField;   // value = account UUID
  merchant: ParsedField;
  amount: ParsedField;
  date: ParsedField;
}

type EditableField = 'merchant' | 'amount';

// ─── SVG Icons (Material Design paths) ───────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORIES = ['food', 'transport', 'shopping', 'bills', 'health'] as const;

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({
  label, display, onIncrement, onDecrement,
}: {
  label: string;
  display: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{
        fontSize: 10, color: '#8A8A9A', fontFamily: 'Inter_400Regular',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
      }}>
        {label}
      </Text>
      <TouchableOpacity onPress={onIncrement} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 15, color: colors.primary, lineHeight: 18 }}>▲</Text>
      </TouchableOpacity>
      <Text style={{
        fontFamily: 'DMMonoMedium', fontSize: 16,
        color: '#1E1E2E', marginVertical: 2, minWidth: 38, textAlign: 'center',
      }}>
        {display}
      </Text>
      <TouchableOpacity onPress={onDecrement} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 15, color: colors.primary, lineHeight: 18 }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScreenshotScreen() {
  const navigation = useNavigation<any>();
  const { accounts } = useAccounts();

  const [selectedSource, setSelectedSource] = useState<'camera' | 'upload'>('upload');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('food');
  const [descriptionText, setDescriptionText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  const daysInMonth = new Date(draftYear, draftMonth + 1, 0).getDate();

  const hasUnresolvedCheck = parsedData
    ? Object.values(parsedData).some(f => f.status === 'check')
    : false;

  const toStatus = (confidence: number): FieldStatus =>
    confidence >= 0.85 ? 'confirmed' : 'check';

  // ── Camera ──
  const handleCamera = async () => {
    setSelectedSource('camera');
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (!result.granted) {
      Alert.alert('Permission required', 'Camera access is needed to take a photo.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!picked.canceled && picked.assets[0]) {
      setSelectedImage(picked.assets[0].uri);
      processReceipt(picked.assets[0].uri);
    }
  };

  // ── Upload from library ──
  const handleUpload = async () => {
    setSelectedSource('upload');
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!result.granted) {
      Alert.alert('Permission required', 'Gallery access is needed to pick a screenshot.');
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

  // ── OCR processing ──
  const processReceipt = async (uri: string) => {
    setIsParsing(true);
    setParsedData(null);

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });
      if (error) throw new Error(error.message);

      // Match detected account name → account UUID
      const detectedAccountName: string | null = data.account?.value ?? null;
      const detectedAccountConf: number = data.account?.confidence ?? 0;
      let matchedAccountId = accounts[0]?.id ?? '';
      let accountConf = detectedAccountConf > 0 ? detectedAccountConf : 0.4;

      if (detectedAccountName && accounts.length > 0) {
        const lower = detectedAccountName.toLowerCase();
        const match = accounts.find(a =>
          a.name.toLowerCase().includes(lower) || lower.includes(a.name.toLowerCase())
        );
        if (match) {
          matchedAccountId = match.id;
          accountConf = detectedAccountConf >= 0.85 ? detectedAccountConf : Math.max(detectedAccountConf, 0.4);
        }
      }

      const merchantConf: number = data.merchant?.confidence ?? data.merchant_confidence ?? 0;
      const amountConf: number = data.amount?.confidence ?? data.amount_confidence ?? 0;
      const dateConf: number = data.date?.confidence ?? data.date_confidence ?? 0;

      setParsedData({
        account: { value: matchedAccountId, confidence: accountConf, status: toStatus(accountConf) },
        merchant: {
          value: data.merchant?.value ?? data.merchant ?? '',
          confidence: merchantConf,
          status: toStatus(merchantConf),
        },
        amount: {
          value: data.amount?.value ?? data.amount ?? '',
          confidence: amountConf,
          status: toStatus(amountConf),
        },
        date: {
          value: data.date?.value ?? data.date ?? '',
          confidence: dateConf,
          status: toStatus(dateConf),
        },
      });
    } catch (err: any) {
      Alert.alert('OCR Error', err.message || 'Failed to parse receipt.');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Single tap on Check field → accept current value ──
  const acceptField = (field: keyof ParsedReceipt) => {
    if (!parsedData || parsedData[field].status !== 'check') return;
    setParsedData(prev => prev
      ? { ...prev, [field]: { ...prev[field], status: 'fixed' } }
      : null);
  };

  // ── Open text/numeric edit modal ──
  const openTextEdit = (field: EditableField) => {
    if (!parsedData) return;
    setEditingField(field);
    setEditDraft(String(parsedData[field].value ?? ''));
    setShowEditModal(true);
  };

  // ── Open date picker ──
  const openDateEdit = () => {
    if (!parsedData) return;
    const d = parsedData.date.value ? new Date(String(parsedData.date.value)) : new Date();
    const valid = !isNaN(d.getTime());
    setDraftMonth(valid ? d.getMonth() : new Date().getMonth());
    setDraftDay(valid ? d.getDate() : new Date().getDate());
    setDraftYear(valid ? d.getFullYear() : new Date().getFullYear());
    setShowDateModal(true);
  };

  // ── Save text/numeric edit ──
  const saveTextEdit = () => {
    if (!parsedData || !editingField) return;
    setParsedData(prev => prev ? {
      ...prev,
      [editingField]: {
        ...prev[editingField],
        value: editingField === 'amount' ? parseFloat(editDraft) || 0 : editDraft,
        status: 'fixed',
      },
    } : null);
    setShowEditModal(false);
    setEditingField(null);
  };

  // ── Save date edit ──
  const saveDateEdit = () => {
    if (!parsedData) return;
    const newDate = new Date(draftYear, draftMonth, draftDay, 12, 0, 0);
    setParsedData(prev => prev ? {
      ...prev,
      date: { ...prev.date, value: newDate.toISOString(), status: 'fixed' },
    } : null);
    setShowDateModal(false);
  };

  // ── Save account selection ──
  const saveAccountEdit = (accountId: string) => {
    setParsedData(prev => prev ? {
      ...prev,
      account: { ...prev.account, value: accountId, status: 'fixed' },
    } : null);
    setShowAccountModal(false);
  };

  // ── Confirm & save to Supabase ──
  const handleConfirmSave = async () => {
    if (!parsedData || hasUnresolvedCheck || isSaving) return;
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      const rawDate = parsedData.date.value ? new Date(String(parsedData.date.value)) : new Date();
      const isoDate = isNaN(rawDate.getTime()) ? new Date().toISOString() : rawDate.toISOString();

      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        account_id: parsedData.account.value,
        merchant_name: parsedData.merchant.value,
        amount: Number(parsedData.amount.value),
        date: isoDate,
        type: 'expense',
        category: selectedCategory,
        signal_source: 'merchant',
        merchant_confidence: parsedData.merchant.confidence,
        amount_confidence: parsedData.amount.confidence,
        date_confidence: parsedData.date.confidence,
        receipt_url: selectedImage,
      });

      if (error) throw error;

      // Update account balance
      const accountId = String(parsedData.account.value ?? '');
      if (accountId) {
        const { data: acct } = await supabase
          .from('accounts').select('balance').eq('id', accountId).single();
        if (acct) {
          await supabase.from('accounts')
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

  // ── Display helpers ──
  const getAccountName = (field: ParsedField): string => {
    if (!field.value) return '—';
    return accounts.find(a => a.id === field.value)?.name ?? '—';
  };

  const getDateDisplay = (field: ParsedField): string => {
    if (!field.value) return '—';
    const d = new Date(String(field.value));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return String(field.value);
  };

  // ── Render a parsed field row ──
  const renderParsedRow = (
    label: string,
    field: keyof ParsedReceipt,
    displayValue: string,
    onSingleTap: () => void,
    onLongPress: () => void,
  ) => {
    if (!parsedData) return null;
    const { status } = parsedData[field];
    const isDone = status === 'confirmed' || status === 'fixed';

    return (
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(30,30,46,0.07)',
      }}>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A9A' }}>
          {label}
        </Text>
        <TouchableOpacity
          onPress={onSingleTap}
          onLongPress={onLongPress}
          delayLongPress={500}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1.5,
            backgroundColor: isDone ? '#EFF8F2' : '#FBF0EC',
            borderColor: isDone ? '#A8D5B5' : '#C8A09A',
          }}
        >
          <Text style={{
            fontFamily: 'DMMonoMedium',
            fontSize: 13,
            color: isDone ? '#2d6a4f' : '#B85A30',
          }}>
            {displayValue}
          </Text>
          {!isDone && (
            <Text style={{
              fontFamily: 'Inter_700Bold',
              fontSize: 10,
              color: '#B85A30',
            }}>
              Fix ›
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── HEADER ── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: '#FFFFFF',
              borderWidth: 1, borderColor: 'rgba(30,30,46,0.1)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: '#1E1E2E', lineHeight: 24 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{
            flex: 1, textAlign: 'center',
            fontFamily: 'Nunito_800ExtraBold', fontSize: 18, color: '#1E1E2E',
            marginRight: 36,
          }}>
            Scan receipt
          </Text>
        </View>

        {/* ── SOURCE SELECTOR — Camera | Upload ── */}
        <View style={{
          flexDirection: 'row',
          marginHorizontal: 20,
          marginBottom: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          padding: 4,
          borderWidth: 1,
          borderColor: 'rgba(30,30,46,0.08)',
          gap: 4,
        }}>
          {([
            { key: 'camera' as const, label: 'Camera', Icon: CameraIcon, onPress: handleCamera },
            { key: 'upload' as const, label: 'Upload', Icon: UploadIcon, onPress: handleUpload },
          ]).map(({ key, label, Icon, onPress }) => {
            const isActive = selectedSource === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={onPress}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10,
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  backgroundColor: isActive ? colors.primary : 'transparent',
                }}
              >
                <Icon color={isActive ? '#FFFFFF' : '#8A8A9A'} size={20} />
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 11,
                  color: isActive ? '#FFFFFF' : '#8A8A9A',
                }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── RECEIPT PREVIEW ── */}
        <View style={{
          marginHorizontal: 20, marginBottom: 16,
          height: 180, borderRadius: 16, overflow: 'hidden',
          backgroundColor: '#E8E6E2', position: 'relative',
        }}>
          {selectedImage ? (
            <Image
              source={{ uri: selectedImage }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <TouchableOpacity
              onPress={handleUpload}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {/* Receipt icon */}
              <Svg width={40} height={40} viewBox="0 0 24 24">
                <Path
                  fill="#B4B2A9"
                  d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2H4v20h2l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22h2V2h-2l-1.5 1.5zM21 20h-1l-1.5-1.5L17 20l-1.5-1.5L14 20l-1.5-1.5L11 20l-1.5-1.5L8 20l-1.5-1.5L5 20H4V4h1l1.5 1.5L8 4l1.5 1.5L11 4l1.5 1.5L14 4l1.5 1.5L17 4l1.5 1.5L20 4h1v16zM7 12h10v2H7zm0 4h7v2H7zm0-8h10v2H7z"
                />
              </Svg>
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#8A8A9A',
              }}>
                Tap to select a receipt
              </Text>
              <Text style={{
                fontFamily: 'Inter_400Regular', fontSize: 11, color: '#B4B2A9',
              }}>
                GCash · Maya · BDO · BPI
              </Text>
            </TouchableOpacity>
          )}

          {selectedImage && (
            <View style={{
              position: 'absolute', bottom: 10, right: 10,
              backgroundColor: 'rgba(0,0,0,0.45)',
              borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#FFFFFF' }}>
                ⤢ expand
              </Text>
            </View>
          )}
        </View>

        {/* ── PARSING INDICATOR ── */}
        {isParsing && (
          <View style={{
            marginHorizontal: 20, marginBottom: 16,
            backgroundColor: '#FFFFFF', borderRadius: 16,
            padding: 24, alignItems: 'center', gap: 10,
            borderWidth: 1, borderColor: 'rgba(30,30,46,0.08)',
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: colors.primary }}>
              Parsing receipt…
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A9A' }}>
              Usually under 3 seconds
            </Text>
          </View>
        )}

        {/* ── PARSED FIELDS CARD ── */}
        {parsedData && !isParsing && (
          <View style={{
            marginHorizontal: 20, marginBottom: 16,
            backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
            borderWidth: 1, borderColor: 'rgba(30,30,46,0.08)',
          }}>

            {/* Card header + legend */}
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: 'rgba(30,30,46,0.07)',
            }}>
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 10, color: '#8A8A9A',
                letterSpacing: 0.6, textTransform: 'uppercase',
              }}>
                Parsed fields
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#5B8C6E' }} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#8A8A9A' }}>
                    Confirmed
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8856A' }} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#8A8A9A' }}>
                    Check
                  </Text>
                </View>
              </View>
            </View>

            {/* Account */}
            {renderParsedRow(
              'Account',
              'account',
              getAccountName(parsedData.account),
              () => setShowAccountModal(true),   // single tap → open picker (account always needs selection)
              () => setShowAccountModal(true),
            )}

            {/* Merchant */}
            {renderParsedRow(
              'Merchant',
              'merchant',
              String(parsedData.merchant.value ?? '—'),
              () => acceptField('merchant'),
              () => openTextEdit('merchant'),
            )}

            {/* Amount */}
            {renderParsedRow(
              'Amount',
              'amount',
              parsedData.amount.value != null
                ? `₱${Number(parsedData.amount.value).toLocaleString('en-PH', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}`
                : '—',
              () => acceptField('amount'),
              () => openTextEdit('amount'),
            )}

            {/* Date */}
            {renderParsedRow(
              'Date',
              'date',
              getDateDisplay(parsedData.date),
              () => acceptField('date'),
              () => openDateEdit(),
            )}

          </View>
        )}

        {/* ── HINT TEXT ── */}
        {parsedData && !isParsing && hasUnresolvedCheck && (
          <Text style={{
            marginHorizontal: 20, marginBottom: 12,
            fontFamily: 'Inter_400Regular', fontSize: 11,
            color: '#8A8A9A', textAlign: 'center', lineHeight: 16,
          }}>
            Tap to confirm · Long press to edit
          </Text>
        )}

        {/* ── CATEGORY SECTION ── */}
        {parsedData && !isParsing && (
          <View style={{ marginHorizontal: 20, marginBottom: 16 }}>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 10, color: '#8A8A9A',
                letterSpacing: 0.6, textTransform: 'uppercase',
              }}>
                Category
              </Text>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#4B2DA3' }}>
                ✦ from merchant
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map((key) => {
                  const isSelected = selectedCategory === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setSelectedCategory(key)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 14, paddingVertical: 9,
                        borderRadius: 12,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? CATEGORY_COLOR[key] : 'rgba(30,30,46,0.12)',
                        backgroundColor: isSelected ? CATEGORY_TILE_BG[key] : '#FFFFFF',
                      }}
                    >
                      <CategoryIcon
                        categoryKey={key}
                        color={isSelected ? CATEGORY_COLOR[key] : '#8A8A9A'}
                        size={14}
                        wrapperSize={22}
                      />
                      <Text style={{
                        fontFamily: 'Inter_600SemiBold', fontSize: 13,
                        color: isSelected ? CATEGORY_COLOR[key] : '#8A8A9A',
                      }}>
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* OR DESCRIBE divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(30,30,46,0.1)' }} />
              <Text style={{
                fontFamily: 'Inter_700Bold', fontSize: 9,
                color: '#8A8A9A', letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                or describe
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(30,30,46,0.1)' }} />
            </View>

            {/* AI description input */}
            <View style={{
              backgroundColor: '#F0ECFD', borderWidth: 1.5, borderColor: '#C9B8F5',
              borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Text style={{ fontSize: 14, color: '#4B2DA3' }}>✦</Text>
              <TextInput
                style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: '#1E1E2E' }}
                placeholder='e.g. "hamburger", "load", "tanghalian"'
                placeholderTextColor="#B4B2A9"
                value={descriptionText}
                onChangeText={setDescriptionText}
              />
            </View>

          </View>
        )}

        {/* ── CONFIRM & SAVE ── */}
        {parsedData && !isParsing && (
          <View style={{ marginHorizontal: 20 }}>
            <TouchableOpacity
              onPress={handleConfirmSave}
              disabled={hasUnresolvedCheck || isSaving}
              style={{
                borderRadius: 16, paddingVertical: 18, alignItems: 'center',
                backgroundColor: hasUnresolvedCheck ? '#B4D4C4' : colors.primary,
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                {isSaving ? 'Saving…' : 'Confirm & save'}
              </Text>
            </TouchableOpacity>
            {hasUnresolvedCheck && (
              <Text style={{
                fontFamily: 'Inter_400Regular', fontSize: 11, color: '#E8856A',
                textAlign: 'center', marginTop: 8,
              }}>
                Resolve highlighted fields first
              </Text>
            )}
          </View>
        )}

      </ScrollView>

      {/* ─── TEXT / AMOUNT EDIT MODAL ─── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowEditModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(30,30,46,0.45)', justifyContent: 'flex-end' }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: '#F7F5F2',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: 20, paddingBottom: 40,
              }}>
                <View style={{
                  width: 36, height: 4, backgroundColor: '#D8D6D0',
                  borderRadius: 2, alignSelf: 'center', marginBottom: 20,
                }} />
                <Text style={{
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18, color: '#1E1E2E', marginBottom: 16,
                }}>
                  Edit {editingField === 'amount' ? 'Amount' : 'Merchant'}
                </Text>
                <TextInput
                  value={editDraft}
                  onChangeText={setEditDraft}
                  autoFocus
                  keyboardType={editingField === 'amount' ? 'decimal-pad' : 'default'}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary,
                    paddingHorizontal: 16, paddingVertical: 14,
                    fontFamily: 'DMMonoMedium', fontSize: 17, color: '#1E1E2E',
                    marginBottom: 16,
                  }}
                  placeholder={editingField === 'amount' ? '0.00' : 'Merchant name'}
                  placeholderTextColor="#B4B2A9"
                  returnKeyType="done"
                  onSubmitEditing={saveTextEdit}
                />
                <TouchableOpacity
                  onPress={saveTextEdit}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                  }}
                >
                  <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── DATE PICKER MODAL ─── */}
      <Modal visible={showDateModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowDateModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(30,30,46,0.45)', justifyContent: 'flex-end' }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: '#F7F5F2',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: 20, paddingBottom: 40,
              }}>
                <View style={{
                  width: 36, height: 4, backgroundColor: '#D8D6D0',
                  borderRadius: 2, alignSelf: 'center', marginBottom: 20,
                }} />
                <Text style={{
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18, color: '#1E1E2E', marginBottom: 16,
                }}>
                  Edit Date
                </Text>

                <View style={{
                  backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16,
                }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Stepper
                      label="Month"
                      display={MONTHS_SHORT[draftMonth]}
                      onIncrement={() => setDraftMonth(m => (m + 1) % 12)}
                      onDecrement={() => setDraftMonth(m => (m + 11) % 12)}
                    />
                    <Stepper
                      label="Day"
                      display={String(draftDay)}
                      onIncrement={() => setDraftDay(d => d < daysInMonth ? d + 1 : 1)}
                      onDecrement={() => setDraftDay(d => d > 1 ? d - 1 : daysInMonth)}
                    />
                    <Stepper
                      label="Year"
                      display={String(draftYear)}
                      onIncrement={() => setDraftYear(y => y + 1)}
                      onDecrement={() => setDraftYear(y => y - 1)}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={saveDateEdit}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                  }}
                >
                  <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── ACCOUNT PICKER MODAL ─── */}
      <Modal visible={showAccountModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowAccountModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(30,30,46,0.45)', justifyContent: 'flex-end' }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: '#F7F5F2',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: 20, paddingBottom: 40,
              }}>
                <View style={{
                  width: 36, height: 4, backgroundColor: '#D8D6D0',
                  borderRadius: 2, alignSelf: 'center', marginBottom: 20,
                }} />
                <Text style={{
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18, color: '#1E1E2E', marginBottom: 16,
                }}>
                  Select Account
                </Text>
                {accounts.map((acct) => {
                  const isSelected = parsedData?.account.value === acct.id;
                  const logo = ACCOUNT_LOGOS[acct.name];
                  const avatarChar = ACCOUNT_AVATAR_OVERRIDE[acct.name] ?? acct.letter_avatar ?? acct.name.charAt(0);
                  return (
                    <TouchableOpacity
                      key={acct.id}
                      onPress={() => saveAccountEdit(acct.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 16,
                        borderRadius: 12, marginBottom: 8,
                        backgroundColor: isSelected ? '#EBF2EE' : '#FFFFFF',
                        borderWidth: isSelected ? 1.5 : 1,
                        borderColor: isSelected ? colors.primary : 'rgba(30,30,46,0.08)',
                      }}
                    >
                      <View style={{
                        width: 40, height: 40, borderRadius: 12,
                        backgroundColor: acct.brand_colour + '20',
                        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      }}>
                        {logo ? (
                          <Image source={logo} style={{ width: 36, height: 36 }} resizeMode="contain" />
                        ) : (
                          <Text style={{
                            fontFamily: 'Nunito_800ExtraBold', fontSize: 16, color: acct.brand_colour,
                          }}>
                            {avatarChar}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 15, color: '#1E1E2E', flex: 1 }}>
                        {acct.name}
                      </Text>
                      {isSelected && (
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.primary }}>
                          ✓
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </SafeAreaView>
  );
}
