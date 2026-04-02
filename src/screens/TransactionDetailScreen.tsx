import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../constants/theme';
import { CATEGORY_TILE_BG, CATEGORY_COLOR } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import { supabase } from '@/services/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { ACCOUNT_LOGOS, ACCOUNT_AVATAR_OVERRIDE } from '@/constants/accountLogos';
import type { Transaction } from '@/types';
import type { FeedStackParamList } from '../navigation/RootNavigator';

// ─── Types ───────────────────────────────────────────────────────────────────

type DetailRouteProp = RouteProp<FeedStackParamList, 'TransactionDetail'>;

interface TransactionWithAccount extends Transaction {
  account_name: string;
  account_brand_colour: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORIES = ['food', 'transport', 'shopping', 'bills', 'health'] as const;

// ─── Stepper Sub-component ───────────────────────────────────────────────────

function Stepper({
  label,
  display,
  onIncrement,
  onDecrement,
  accentColor,
}: {
  label: string;
  display: string;
  onIncrement: () => void;
  onDecrement: () => void;
  accentColor: string;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{
        fontSize: 10, color: '#8A8A9A',
        fontFamily: 'Inter_400Regular', marginBottom: 4,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </Text>
      <TouchableOpacity onPress={onIncrement} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 16, color: accentColor, lineHeight: 18 }}>▲</Text>
      </TouchableOpacity>
      <Text style={{
        fontFamily: 'DMMonoMedium', fontSize: 17,
        color: '#1E1E2E', marginVertical: 2, minWidth: 40, textAlign: 'center',
      }}>
        {display}
      </Text>
      <TouchableOpacity onPress={onDecrement} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 16, color: accentColor, lineHeight: 18 }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<DetailRouteProp>();
  const transactionId = route.params?.id;

  const { accounts } = useAccounts();

  const [tx, setTx] = useState<TransactionWithAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [isReceiptVisible, setIsReceiptVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit state
  const [editedName, setEditedName] = useState('');
  const [editedNote, setEditedNote] = useState('');
  const [editedAccountId, setEditedAccountId] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [editedDate, setEditedDate] = useState(new Date());

  // Date picker draft state
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

  // ── Initialise all edit state from a loaded transaction ──
  const initEditState = (row: TransactionWithAccount) => {
    setEditedName(row.display_name ?? row.merchant_name ?? '');
    setEditedNote(row.transaction_note ?? '');
    setEditedAccountId(row.account_id);
    setEditedCategory((row.category ?? 'food').toLowerCase());
    const d = new Date(row.date);
    const h = d.getHours();
    setEditedDate(d);
    setDraftMonth(d.getMonth());
    setDraftDay(d.getDate());
    setDraftYear(d.getFullYear());
    setDraftAmPm(h >= 12 ? 'PM' : 'AM');
    setDraftHour(h > 12 ? h - 12 : h === 0 ? 12 : h);
    setDraftMinute(d.getMinutes());
  };

  // ── Fetch transaction ──
  const fetchTx = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*, accounts(name, brand_colour)')
      .eq('id', transactionId)
      .single();

    if (!error && data) {
      const row: TransactionWithAccount = {
        ...data,
        accounts: undefined,
        account_name: (data.accounts as any)?.name ?? '',
        account_brand_colour: (data.accounts as any)?.brand_colour ?? '#888',
      };
      setTx(row);
      initEditState(row);
    }
    setLoading(false);
  }, [transactionId]);

  useEffect(() => { fetchTx(); }, [fetchTx]);

  // ── Build date from draft steppers ──
  const buildDateFromDraft = (): Date => {
    let h24 = draftHour;
    if (draftAmPm === 'PM' && draftHour !== 12) h24 = draftHour + 12;
    if (draftAmPm === 'AM' && draftHour === 12) h24 = 0;
    return new Date(draftYear, draftMonth, draftDay, h24, draftMinute, 0);
  };

  // ── Confirm date selection ──
  const confirmDate = () => {
    setEditedDate(buildDateFromDraft());
    setShowDateModal(false);
  };

  // ── Open date modal (sync draft from current editedDate) ──
  const openDateModal = () => {
    const d = editedDate;
    const h = d.getHours();
    setDraftMonth(d.getMonth());
    setDraftDay(d.getDate());
    setDraftYear(d.getFullYear());
    setDraftAmPm(h >= 12 ? 'PM' : 'AM');
    setDraftHour(h > 12 ? h - 12 : h === 0 ? 12 : h);
    setDraftMinute(d.getMinutes());
    setShowDateModal(true);
  };

  // ── Save edits ──
  const handleSave = async () => {
    if (!tx) return;
    setIsSaving(true);

    await supabase
      .from('transactions')
      .update({
        display_name: editedName || null,
        transaction_note: editedNote || null,
        account_id: editedAccountId,
        category: editedCategory,
        date: editedDate.toISOString(),
      })
      .eq('id', tx.id);

    // If account changed, adjust balances
    if (editedAccountId !== tx.account_id && !tx.account_deleted) {
      const { data: oldAcct } = await supabase
        .from('accounts').select('balance').eq('id', tx.account_id).single();
      if (oldAcct) {
        const restored = tx.type === 'expense'
          ? oldAcct.balance + tx.amount : oldAcct.balance - tx.amount;
        await supabase.from('accounts').update({ balance: restored }).eq('id', tx.account_id);
      }
      const { data: newAcct } = await supabase
        .from('accounts').select('balance').eq('id', editedAccountId).single();
      if (newAcct) {
        const applied = tx.type === 'expense'
          ? newAcct.balance - tx.amount : newAcct.balance + tx.amount;
        await supabase.from('accounts').update({ balance: applied }).eq('id', editedAccountId);
      }
    }

    const newAcctInfo = accounts.find(a => a.id === editedAccountId);
    setTx({
      ...tx,
      display_name: editedName,
      transaction_note: editedNote,
      account_id: editedAccountId,
      account_name: newAcctInfo?.name ?? tx.account_name,
      account_brand_colour: newAcctInfo?.brand_colour ?? tx.account_brand_colour,
      category: editedCategory,
      date: editedDate.toISOString(),
    });

    setIsSaving(false);
    setIsEditing(false);
  };

  // ── Cancel editing ──
  const handleCancelEdit = () => {
    if (tx) initEditState(tx);
    setIsEditing(false);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!tx) return;
    setIsDeleting(true);
    await supabase.from('transactions').delete().eq('id', tx.id);

    if (!tx.account_deleted) {
      const { data: acct } = await supabase
        .from('accounts').select('balance').eq('id', tx.account_id).single();
      if (acct) {
        const restored = tx.type === 'expense'
          ? acct.balance + tx.amount : acct.balance - tx.amount;
        await supabase.from('accounts').update({ balance: restored }).eq('id', tx.account_id);
      }
    }

    setIsDeleting(false);
    setIsDeleteConfirmVisible(false);
    navigation.goBack();
  };

  // ── Loading / not found ──
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F5F2', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!tx) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F5F2', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Inter_400Regular', color: colors.textSecondary }}>
          Transaction not found.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Derived display values ──
  const displayCategoryKey = (isEditing ? editedCategory : (tx.category ?? 'default')).toLowerCase();
  const heroBg = CATEGORY_TILE_BG[displayCategoryKey] ?? '#F7F5F2';
  const heroColor = CATEGORY_COLOR[displayCategoryKey] ?? '#888780';

  const displayTitle = isEditing
    ? editedName
    : (tx.display_name?.trim() || tx.merchant_name?.trim() || tx.transaction_note?.trim()
      || (displayCategoryKey.charAt(0).toUpperCase() + displayCategoryKey.slice(1)) || 'Unknown');

  const formattedAmount = tx.amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const displayAccountName = isEditing
    ? (accounts.find(a => a.id === editedAccountId)?.name ?? tx.account_name)
    : tx.account_name;

  const displayDate = isEditing ? editedDate : new Date(tx.date);
  const formattedDate = displayDate.toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const daysInMonth = new Date(draftYear, draftMonth + 1, 0).getDate();

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,30,46,0.07)',
    minHeight: 52,
  };

  const labelStyle = {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#8A8A9A',
  };

  const valueStyle = {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#1E1E2E',
    textAlign: 'right' as const,
    flex: 1,
    marginLeft: 16,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: heroBg }}>
      <ScrollView
        style={{ flex: 1 }}
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
          paddingBottom: 8,
        }}>
          {/* Left button */}
          {isEditing ? (
            <TouchableOpacity onPress={handleCancelEdit} style={{ minWidth: 60 }}>
              <Text style={{
                fontFamily: 'Inter_600SemiBold', fontSize: 15, color: heroColor,
              }}>
                Cancel
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.8)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20, color: heroColor, lineHeight: 24 }}>‹</Text>
            </TouchableOpacity>
          )}

          {/* Title */}
          <Text style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'Nunito_800ExtraBold',
            fontSize: 18,
            color: '#1E1E2E',
          }}>
            {isEditing ? 'Edit Transaction' : 'Transaction'}
          </Text>

          {/* Right button */}
          {isEditing ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={{ minWidth: 60, alignItems: 'flex-end' }}
            >
              <Text style={{
                fontFamily: 'Nunito_700Bold', fontSize: 15, color: heroColor,
                opacity: isSaving ? 0.5 : 1,
              }}>
                {isSaving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {/* ── HERO ── */}
        <View style={{
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 32,
          paddingHorizontal: 24,
        }}>
          <View style={{
            width: 80, height: 80, borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
          }}>
            <CategoryIcon
              categoryKey={displayCategoryKey}
              color={heroColor}
              size={36}
              wrapperSize={56}
            />
          </View>

          {/* Amount */}
          <Text style={{ marginBottom: 4 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 22, color: heroColor }}>
              {tx.type === 'expense' ? '−₱' : '+₱'}
            </Text>
            <Text style={{
              fontFamily: 'DMMonoMedium', fontSize: 42,
              fontWeight: '700', color: heroColor, letterSpacing: -2,
            }}>
              {formattedAmount}
            </Text>
          </Text>

          {/* Merchant name — editable in edit mode */}
          {isEditing ? (
            <TextInput
              value={editedName}
              onChangeText={setEditedName}
              style={{
                fontFamily: 'Nunito_700Bold', fontSize: 18,
                color: '#1E1E2E', textAlign: 'center',
                borderBottomWidth: 1.5, borderBottomColor: heroColor,
                paddingBottom: 4, paddingHorizontal: 8,
                minWidth: 200, marginBottom: 4,
              }}
              placeholder="Merchant name"
              placeholderTextColor="rgba(30,30,46,0.3)"
            />
          ) : (
            <Text style={{
              fontFamily: 'Nunito_700Bold', fontSize: 18,
              color: '#1E1E2E', marginBottom: 4, textAlign: 'center',
            }}>
              {displayTitle}
            </Text>
          )}

          <Text style={{
            fontFamily: 'Inter_400Regular', fontSize: 12,
            color: '#8A8A9A', textAlign: 'center',
          }}>
            {formattedDate}
          </Text>
        </View>

        {/* ── DETAIL CARD ── */}
        <View style={{
          marginHorizontal: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          overflow: 'hidden',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
        }}>

          {/* Account row */}
          <TouchableOpacity
            style={rowStyle}
            onPress={() => isEditing && setShowAccountModal(true)}
            activeOpacity={isEditing ? 0.6 : 1}
          >
            <Text style={labelStyle}>Account</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[valueStyle, { flex: 0 }]}>{displayAccountName || 'None'}</Text>
              {isEditing && (
                <Text style={{ fontSize: 18, color: heroColor, opacity: 0.7 }}>›</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Date & time row */}
          <TouchableOpacity
            style={rowStyle}
            onPress={() => isEditing && openDateModal()}
            activeOpacity={isEditing ? 0.6 : 1}
          >
            <Text style={labelStyle}>Date & time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
              <Text style={[valueStyle, { flex: 0 }]}>{formattedDate}</Text>
              {isEditing && (
                <Text style={{ fontSize: 18, color: heroColor, opacity: 0.7 }}>›</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Category row */}
          <TouchableOpacity
            style={rowStyle}
            onPress={() => isEditing && setShowCategoryModal(true)}
            activeOpacity={isEditing ? 0.6 : 1}
          >
            <Text style={labelStyle}>Category</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: heroBg, borderColor: heroColor,
                borderWidth: 1, borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 5,
              }}>
                <CategoryIcon categoryKey={displayCategoryKey} color={heroColor} size={12} wrapperSize={20} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: heroColor }}>
                  {displayCategoryKey.charAt(0).toUpperCase() + displayCategoryKey.slice(1)}
                </Text>
              </View>
              {isEditing && (
                <Text style={{ fontSize: 18, color: heroColor, opacity: 0.7 }}>›</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Note row */}
          <View style={[rowStyle, { borderBottomWidth: 0 }]}>
            <Text style={labelStyle}>Note</Text>
            {isEditing ? (
              <TextInput
                value={editedNote}
                onChangeText={setEditedNote}
                style={[valueStyle, {
                  flex: 1,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(30,30,46,0.2)',
                  paddingBottom: 2,
                }]}
                placeholder="Add a note…"
                placeholderTextColor="#B4B2A9"
                returnKeyType="done"
              />
            ) : (
              <Text style={[valueStyle, {
                color: tx.transaction_note ? '#1E1E2E' : '#B4B2A9',
                fontStyle: tx.transaction_note ? 'normal' : 'italic',
              }]}>
                {tx.transaction_note || 'No note'}
              </Text>
            )}
          </View>

        </View>

        {/* ── ACTIONS (view mode only) ── */}
        {!isEditing && (
          <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 12 }}>
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={{
                backgroundColor: '#F0ECFD',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#C9B8F5',
              }}
            >
              <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#4B2DA3' }}>
                Edit transaction
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsDeleteConfirmVisible(true)}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text style={{
                fontFamily: 'Inter_400Regular', fontSize: 13,
                color: '#C8A09A', textDecorationLine: 'underline',
              }}>
                Delete transaction
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

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
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
                  color: '#1E1E2E', marginBottom: 16,
                }}>
                  Select Account
                </Text>
                {accounts.map((acct) => {
                  const isSelected = acct.id === editedAccountId;
                  const logo = ACCOUNT_LOGOS[acct.name];
                  const avatarChar = ACCOUNT_AVATAR_OVERRIDE[acct.name] ?? acct.letter_avatar ?? acct.name.charAt(0);
                  return (
                    <TouchableOpacity
                      key={acct.id}
                      onPress={() => { setEditedAccountId(acct.id); setShowAccountModal(false); }}
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
                            fontFamily: 'Nunito_800ExtraBold',
                            fontSize: 16, color: acct.brand_colour,
                          }}>
                            {avatarChar}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontFamily: 'Nunito_700Bold', fontSize: 15, color: '#1E1E2E',
                        }}>
                          {acct.name}
                        </Text>
                        <Text style={{
                          fontFamily: 'Inter_400Regular', fontSize: 12, color: '#8A8A9A',
                        }}>
                          ₱{acct.balance.toLocaleString('en-PH', {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                          })}
                        </Text>
                      </View>
                      {isSelected && (
                        <Text style={{
                          fontFamily: 'Inter_600SemiBold',
                          fontSize: 16, color: colors.primary,
                        }}>
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

      {/* ─── CATEGORY PICKER MODAL ─── */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowCategoryModal(false)}>
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
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
                  color: '#1E1E2E', marginBottom: 16,
                }}>
                  Select Category
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {CATEGORIES.map((key) => {
                    const isSelected = editedCategory.toLowerCase() === key;
                    const bg = CATEGORY_TILE_BG[key];
                    const col = CATEGORY_COLOR[key];
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => { setEditedCategory(key); setShowCategoryModal(false); }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 16, paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: isSelected ? bg : '#FFFFFF',
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? col : 'rgba(30,30,46,0.12)',
                        }}
                      >
                        <CategoryIcon categoryKey={key} color={col} size={16} wrapperSize={26} />
                        <Text style={{
                          fontFamily: 'Inter_600SemiBold', fontSize: 14,
                          color: isSelected ? col : '#8A8A9A',
                        }}>
                          {key.charAt(0).toUpperCase() + key.slice(1)}
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

      {/* ─── DATE / TIME PICKER MODAL ─── */}
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
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
                  color: '#1E1E2E', marginBottom: 16,
                }}>
                  Date & Time
                </Text>

                {/* ── Date section ── */}
                <View style={{
                  backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 10,
                }}>
                  <Text style={{
                    fontFamily: 'Inter_700Bold', fontSize: 10, color: '#8A8A9A',
                    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
                  }}>
                    Date
                  </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <Stepper
                      label="Month"
                      display={MONTHS_SHORT[draftMonth]}
                      onIncrement={() => setDraftMonth(m => (m + 1) % 12)}
                      onDecrement={() => setDraftMonth(m => (m + 11) % 12)}
                      accentColor={heroColor}
                    />
                    <Stepper
                      label="Day"
                      display={String(draftDay)}
                      onIncrement={() => setDraftDay(d => d < daysInMonth ? d + 1 : 1)}
                      onDecrement={() => setDraftDay(d => d > 1 ? d - 1 : daysInMonth)}
                      accentColor={heroColor}
                    />
                    <Stepper
                      label="Year"
                      display={String(draftYear)}
                      onIncrement={() => setDraftYear(y => y + 1)}
                      onDecrement={() => setDraftYear(y => y - 1)}
                      accentColor={heroColor}
                    />
                  </View>
                </View>

                {/* ── Time section ── */}
                <View style={{
                  backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16,
                }}>
                  <Text style={{
                    fontFamily: 'Inter_700Bold', fontSize: 10, color: '#8A8A9A',
                    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
                  }}>
                    Time
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Stepper
                      label="Hour"
                      display={String(draftHour)}
                      onIncrement={() => setDraftHour(h => h < 12 ? h + 1 : 1)}
                      onDecrement={() => setDraftHour(h => h > 1 ? h - 1 : 12)}
                      accentColor={heroColor}
                    />
                    <Text style={{
                      fontFamily: 'DMMonoMedium', fontSize: 22,
                      color: '#1E1E2E', marginTop: 14,
                    }}>
                      :
                    </Text>
                    <Stepper
                      label="Min"
                      display={String(draftMinute).padStart(2, '0')}
                      onIncrement={() => setDraftMinute(m => (m + 1) % 60)}
                      onDecrement={() => setDraftMinute(m => (m + 59) % 60)}
                      accentColor={heroColor}
                    />
                    {/* AM/PM toggle */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 10, color: '#8A8A9A',
                        fontFamily: 'Inter_400Regular', marginBottom: 4,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        AM/PM
                      </Text>
                      <TouchableOpacity
                        onPress={() => setDraftAmPm(ap => ap === 'AM' ? 'PM' : 'AM')}
                        style={{
                          backgroundColor: heroColor,
                          borderRadius: 10,
                          paddingHorizontal: 14, paddingVertical: 10,
                          minWidth: 52, alignItems: 'center',
                        }}
                      >
                        <Text style={{
                          fontFamily: 'Nunito_700Bold', fontSize: 16, color: '#FFFFFF',
                        }}>
                          {draftAmPm}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Confirm button */}
                <TouchableOpacity
                  onPress={confirmDate}
                  style={{
                    backgroundColor: heroColor,
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

      {/* ─── DELETE CONFIRM MODAL ─── */}
      <Modal visible={isDeleteConfirmVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => !isDeleting && setIsDeleteConfirmVisible(false)}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(30,30,46,0.5)',
            justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
          }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%',
              }}>
                <Text style={{
                  fontFamily: 'Nunito_800ExtraBold', fontSize: 18,
                  color: '#1E1E2E', marginBottom: 8,
                }}>
                  Delete transaction?
                </Text>
                <Text style={{
                  fontFamily: 'Inter_400Regular', fontSize: 14,
                  color: '#8A8A9A', marginBottom: 24, lineHeight: 20,
                }}>
                  This will permanently remove this transaction and restore the account balance.
                </Text>
                <TouchableOpacity
                  onPress={handleDelete}
                  disabled={isDeleting}
                  style={{
                    backgroundColor: '#C0503A', borderRadius: 12,
                    paddingVertical: 14, alignItems: 'center',
                    marginBottom: 10, opacity: isDeleting ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 15, color: '#FFFFFF' }}>
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsDeleteConfirmVisible(false)}
                  style={{ paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#8A8A9A' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── RECEIPT MODAL ─── */}
      <Modal visible={isReceiptVisible} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 60, right: 24, zIndex: 10, padding: 8 }}
            onPress={() => setIsReceiptVisible(false)}
          >
            <Ionicons name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          <Image
            source={{ uri: tx.receipt_url! }}
            style={{ width: '100%', height: '80%' }}
            resizeMode="contain"
          />
        </View>
      </Modal>

    </SafeAreaView>
  );
}
