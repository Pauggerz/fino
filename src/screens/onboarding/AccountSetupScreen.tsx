import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase'; // 👈 Added Supabase import

const colors = {
  primary: '#2d6a4f',
  primaryLight: '#EFF8F2',
  textPrimary: '#1E1E2E',
  textSecondary: '#888780',
  border: '#e0dfd7',
  white: '#FFFFFF',
  background: '#F7F5F2',
};

const WALLET_OPTIONS = [
  {
    id: 'gcash',
    label: 'GCash',
    emoji: '📱',
    type: 'wallet',
    brand_colour: '#007DFF',
    letter_avatar: 'G',
  },
  {
    id: 'maya',
    label: 'Maya',
    emoji: '💳',
    type: 'wallet',
    brand_colour: '#000000',
    letter_avatar: 'M',
  },
  {
    id: 'bdo',
    label: 'BDO',
    emoji: '🏦',
    type: 'bank',
    brand_colour: '#0038A8',
    letter_avatar: 'B',
  },
  {
    id: 'bpi',
    label: 'BPI',
    emoji: '🏦',
    type: 'bank',
    brand_colour: '#B30000',
    letter_avatar: 'B',
  },
  {
    id: 'gotyme',
    label: 'GoTyme',
    emoji: '💚',
    type: 'bank',
    brand_colour: '#00C8FF',
    letter_avatar: 'G',
  },
  {
    id: 'other',
    label: 'Other',
    emoji: '➕',
    type: 'wallet',
    brand_colour: '#555555',
    letter_avatar: 'O',
  },
];

export default function AccountSetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [cashBalance, setCashBalance] = useState('');
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false); // 👈 Added loading state

  const toggleWallet = (id: string) => {
    setSelectedWallets((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const handleContinue = async () => {
    setIsSubmitting(true);

    try {
      // 1. Get the auto-logged-in testing user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        Alert.alert(
          'Auth Error',
          'Could not find a logged in user. Make sure your auto-login is working.'
        );
        setIsSubmitting(false);
        return;
      }

      const startingBal = parseFloat(cashBalance.replace(/,/g, '')) || 0;

      // 2. Prepare the payload matching your schema
      const accountsToCreate = [
        {
          user_id: user.id, // Linked to the user!
          name: 'Cash',
          type: 'cash',
          brand_colour: '#4a7a5e',
          letter_avatar: 'C',
          balance: startingBal,
          starting_balance: startingBal,
          is_active: true,
          is_deletable: false,
          sort_order: 0,
        },
      ];

      selectedWallets.forEach((walletId, index) => {
        const walletDef = WALLET_OPTIONS.find((w) => w.id === walletId);
        if (walletDef) {
          accountsToCreate.push({
            user_id: user.id,
            name: walletDef.label,
            type: walletDef.type,
            brand_colour: walletDef.brand_colour,
            letter_avatar: walletDef.letter_avatar,
            balance: 0,
            starting_balance: 0,
            is_active: true,
            is_deletable: true,
            sort_order: index + 1,
          });
        }
      });

      // 3. Bulk insert to Supabase
      const { error } = await supabase
        .from('accounts')
        .insert(accountsToCreate);

      if (error) throw error;

      // 4. Move to next step on success
      navigation.navigate('CategorySetup');
    } catch (error: any) {
      Alert.alert('Error saving accounts', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Are you sure?',
      "Skipping setup enables on-device mode. Sync will be turned off and your data won't be backed up to the cloud.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip & Continue Offline',
          style: 'destructive',
          onPress: () => navigation.navigate('Tabs'),
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.obProgress}>
          <View style={styles.dotInactive} />
          <View style={styles.dotActive} />
          <View style={styles.dotInactive} />
          <View style={styles.dotInactive} />
        </View>

        <LinearGradient colors={['#EBF2EE', '#F0ECFD']} style={styles.obHero}>
          <Text style={styles.heroEmoji}>💸</Text>
        </LinearGradient>

        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Where is your money?</Text>
          <Text style={styles.subtitle}>
            Let's set up your starting balances so Fino can track your net worth
            accurately.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>DEFAULT WALLET</Text>
        <LinearGradient
          colors={['#4a7a5e', '#5B8C6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cashRow}
        >
          <View style={styles.cashRowLeft}>
            <Text style={styles.cashEmoji}>💵</Text>
            <View>
              <Text style={styles.cashTitle}>Cash</Text>
              <Text style={styles.cashSubtitle}>Always pre-added</Text>
            </View>
          </View>
          <View style={styles.preAddedBadge}>
            <Text style={styles.preAddedBadgeText}>Pre-added</Text>
          </View>
        </LinearGradient>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Current Cash Balance</Text>
          <TextInput
            style={styles.balanceInput}
            value={cashBalance}
            onChangeText={setCashBalance}
            keyboardType="decimal-pad"
            placeholder="₱ 0.00"
            placeholderTextColor="#B4B2A9"
            editable={!isSubmitting} // Lock input while saving
          />
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>
          ADD MORE ACCOUNTS
        </Text>
        <View style={styles.chipGrid}>
          {WALLET_OPTIONS.map((wallet) => {
            const isSelected = selectedWallets.includes(wallet.id);
            return (
              <TouchableOpacity
                key={wallet.id}
                activeOpacity={0.7}
                onPress={() => toggleWallet(wallet.id)}
                disabled={isSubmitting} // Lock buttons while saving
                style={[
                  styles.walletChip,
                  isSelected
                    ? styles.walletChipActive
                    : styles.walletChipInactive,
                ]}
              >
                <Text style={styles.chipEmoji}>{wallet.emoji}</Text>
                <Text
                  style={[
                    styles.chipText,
                    isSelected
                      ? styles.chipTextActive
                      : styles.chipTextInactive,
                  ]}
                >
                  {wallet.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}
      >
        <TouchableOpacity
          style={[styles.continueBtn, isSubmitting && { opacity: 0.7 }]}
          activeOpacity={0.8}
          onPress={handleContinue}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.continueBtnText}>Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          disabled={isSubmitting}
        >
          <Text style={styles.skipBtnText}>Skip this step</Text>
        </TouchableOpacity>
        <Text style={styles.skipConsequence}>
          Skip → on-device mode, sync off
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  obProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 32,
  },
  dotActive: {
    width: 22,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#D8D6D0',
  },
  obHero: {
    height: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heroEmoji: {
    fontSize: 60,
  },
  headerTextContainer: {
    marginBottom: 32,
  },
  title: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 12,
    marginLeft: 4,
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 12,
  },
  cashRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashEmoji: {
    fontSize: 28,
  },
  cashTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    color: colors.white,
    marginBottom: 2,
  },
  cashSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  preAddedBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  preAddedBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.white,
  },
  inputContainer: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.primary,
    marginBottom: 8,
  },
  balanceInput: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 18,
    color: colors.textPrimary,
    padding: 0,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  walletChipInactive: {
    backgroundColor: colors.white,
    borderColor: colors.border,
  },
  walletChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipEmoji: {
    fontSize: 16,
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  chipTextInactive: {
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.white,
  },
  footer: {
    paddingHorizontal: 24,
    backgroundColor: colors.background,
    paddingTop: 16,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  continueBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.white,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textSecondary,
  },
  skipConsequence: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#B4B2A9',
    textAlign: 'center',
    marginTop: 4,
  },
});
