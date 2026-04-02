import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../constants/theme';
import { CATEGORY_TILE_BG, CATEGORY_COLOR } from '@/constants/categoryMappings';
import { CategoryIcon } from '@/components/CategoryIcon';
import { supabase } from '@/services/supabase';
import type { Transaction } from '@/types';
import type { FeedStackParamList } from '../navigation/RootNavigator';

// ─── Types ───────────────────────────────────────────────────────────────────

type DetailRouteProp = RouteProp<FeedStackParamList, 'TransactionDetail'>;

interface TransactionWithAccount extends Transaction {
  account_name: string;
  account_brand_colour: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<DetailRouteProp>();
  const transactionId = route.params?.id;

  const [tx, setTx] = useState<TransactionWithAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const [isReceiptVisible, setIsReceiptVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editedName, setEditedName] = useState('');
  const [editedNote, setEditedNote] = useState('');

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
      setEditedName(row.display_name ?? row.merchant_name ?? '');
      setEditedNote(row.transaction_note ?? '');
    }

    setLoading(false);
  }, [transactionId]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  // ── Save edits ──
  const handleSave = async () => {
    if (!tx) return;
    setIsSaving(true);

    await supabase
      .from('transactions')
      .update({
        display_name: editedName || null,
        transaction_note: editedNote || null,
      })
      .eq('id', tx.id);

    setTx({ ...tx, display_name: editedName, transaction_note: editedNote });
    setIsSaving(false);
    setIsEditing(false);
  };

  // ── Edit ──
  const handleEdit = () => setIsEditing(true);

  // ── Delete ──
  const handleDelete = async () => {
    if (!tx) return;
    setIsDeleting(true);

    // Delete the transaction
    await supabase.from('transactions').delete().eq('id', tx.id);

    // Restore account balance
    if (!tx.account_deleted) {
      const { data: acct } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', tx.account_id)
        .single();

      if (acct) {
        const restored =
          tx.type === 'expense'
            ? acct.balance + tx.amount
            : acct.balance - tx.amount;
        await supabase
          .from('accounts')
          .update({ balance: restored })
          .eq('id', tx.account_id);
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

  const categoryKey = (tx.category ?? 'default').toLowerCase();
  const heroBg = CATEGORY_TILE_BG[categoryKey] ?? '#F7F5F2';
  const heroColor = CATEGORY_COLOR[categoryKey] ?? '#888780';

  const displayTitle =
    tx.display_name?.trim() ||
    tx.merchant_name?.trim() ||
    tx.transaction_note?.trim() ||
    (categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)) ||
    'Unknown';

  const formattedAmount = tx.amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const accountName = tx.account_name;

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
      >

        {/* ── HEADER ── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 8,
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.8)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: heroColor, lineHeight: 24 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'Nunito_800ExtraBold',
            fontSize: 18,
            color: '#1E1E2E',
            marginRight: 36,
          }}>
            Transaction
          </Text>
        </View>

        {/* ── HERO ── */}
        <View style={{
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 32,
          paddingHorizontal: 24,
        }}>

          {/* Icon in white rounded square */}
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }}>
            <CategoryIcon
              categoryKey={categoryKey}
              color={heroColor}
              size={36}
              wrapperSize={56}
            />
          </View>

          {/* Amount */}
          <Text style={{ marginBottom: 4 }}>
            <Text style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 22,
              color: heroColor,
              letterSpacing: 0,
            }}>
              {tx.type === 'expense' ? '−₱' : '+₱'}
            </Text>
            <Text style={{
              fontFamily: 'DMMonoMedium',
              fontSize: 42,
              fontWeight: '700',
              color: heroColor,
              letterSpacing: -2,
            }}>
              {formattedAmount}
            </Text>
          </Text>

          {/* Merchant name */}
          <Text style={{
            fontFamily: 'Nunito_700Bold',
            fontSize: 18,
            color: '#1E1E2E',
            marginBottom: 4,
            textAlign: 'center',
          }}>
            {displayTitle}
          </Text>

          {/* Date meta */}
          <Text style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            color: '#8A8A9A',
            textAlign: 'center',
          }}>
            {new Date(tx.date).toLocaleDateString('en-PH', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </Text>

        </View>

        {/* ── DETAIL CARD ── */}
        <View style={{
          marginHorizontal: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 2,
        }}>

          {/* Account row */}
          <View style={rowStyle}>
            <Text style={labelStyle}>Account</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={valueStyle}>{accountName}</Text>
            </View>
          </View>

          {/* Date & time row */}
          <View style={rowStyle}>
            <Text style={labelStyle}>Date & time</Text>
            <Text style={valueStyle}>
              {new Date(tx.date).toLocaleDateString('en-PH', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          </View>

          {/* Category row */}
          <View style={rowStyle}>
            <Text style={labelStyle}>Category</Text>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: heroBg,
              borderColor: heroColor,
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
              <CategoryIcon
                categoryKey={categoryKey}
                color={heroColor}
                size={12}
                wrapperSize={20}
              />
              <Text style={{
                fontFamily: 'Inter_600SemiBold',
                fontSize: 13,
                color: heroColor,
              }}>
                {categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)}
              </Text>
            </View>
          </View>

          {/* Note row */}
          <View style={[rowStyle, { borderBottomWidth: 0 }]}>
            <Text style={labelStyle}>Note</Text>
            <Text style={[valueStyle, {
              color: tx.transaction_note ? '#1E1E2E' : '#B4B2A9',
              fontStyle: tx.transaction_note ? 'normal' : 'italic',
            }]}>
              {tx.transaction_note || 'No note'}
            </Text>
          </View>

        </View>

        {/* ── ACTIONS ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 12 }}>

          {/* Edit button - lavender */}
          <TouchableOpacity
            onPress={handleEdit}
            style={{
              backgroundColor: '#F0ECFD',
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#C9B8F5',
            }}
          >
            <Text style={{
              fontFamily: 'Nunito_700Bold',
              fontSize: 16,
              color: '#4B2DA3',
            }}>
              Edit transaction
            </Text>
          </TouchableOpacity>

          {/* Delete - plain underlined text */}
          <TouchableOpacity
            onPress={handleDelete}
            style={{ alignItems: 'center', paddingVertical: 12 }}
          >
            <Text style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 13,
              color: '#C8A09A',
              textDecorationLine: 'underline',
            }}>
              Delete transaction
            </Text>
          </TouchableOpacity>

        </View>

      </ScrollView>

      {/* ─── RECEIPT MODAL ─── */}
      <Modal visible={isReceiptVisible} transparent animationType="fade">
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.9)',
          justifyContent: 'center',
          alignItems: 'center',
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
