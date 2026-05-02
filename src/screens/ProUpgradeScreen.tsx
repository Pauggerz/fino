import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { spacing } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';

// Hardcoded promo codes — move to env var or Supabase table when monetization matures.
const VALID_PROMO_CODES = ['FINOPRO2025', 'BETAUSER', 'FINOTEST'];

const FEATURES = [
  {
    icon: 'layers-outline' as const,
    title: 'Unlimited custom categories',
    description: 'Create as many categories as you need beyond the 6 defaults.',
  },
  {
    icon: 'color-palette-outline' as const,
    title: 'Custom icons and colors',
    description: 'Personalize every category with your own icon and color.',
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Gemini AI auto-categorization',
    description:
      'Smart AI that understands all your categories — including the ones you created.',
  },
];

export default function ProUpgradeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, refreshProfile } = useAuth();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [promoCode, setPromoCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const handleRedeem = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Enter a code', 'Please type your promo code first.');
      return;
    }
    if (!VALID_PROMO_CODES.includes(code)) {
      Alert.alert(
        'Invalid code',
        'That promo code is not valid. Please check and try again.'
      );
      return;
    }
    if (!user?.id) return;

    setRedeeming(true);
    const { error } = await supabase
      .from('users')
      .update({ is_pro: true })
      .eq('id', user.id);

    if (error) {
      setRedeeming(false);
      Alert.alert(
        'Something went wrong',
        'Could not activate Pro. Please try again.'
      );
      return;
    }

    await refreshProfile();
    setRedeeming(false);
    Alert.alert(
      'Welcome to Fino Pro!',
      'Your account has been upgraded. Enjoy unlimited categories and Gemini AI.',
      [{ text: "Let's go", onPress: () => navigation.goBack() }]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Handle */}
      <View style={styles.handleBar}>
        <View style={styles.handle} />
      </View>

      {/* Close */}
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.closeBtn}
          hitSlop={8}
        >
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.screenPadding,
          paddingBottom: 48,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Badge */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={13} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              FINO PRO
            </Text>
          </View>
        </View>

        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Unlock the full{'\n'}Fino experience
        </Text>
        <Text style={[styles.subheadline, { color: colors.textSecondary }]}>
          Get smarter categorization and full control over how you track your
          spending.
        </Text>

        {/* Feature list */}
        <View
          style={[
            styles.featureCard,
            {
              backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
              borderColor: colors.border,
            },
          ]}
        >
          {FEATURES.map((f, i) => (
            <View
              key={f.title}
              style={[
                styles.featureRow,
                i < FEATURES.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.featureIcon,
                  { backgroundColor: isDark ? colors.background : '#F0F7FF' },
                ]}
              >
                <Ionicons name={f.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.featureMeta}>
                <Text
                  style={[styles.featureTitle, { color: colors.textPrimary }]}
                >
                  {f.title}
                </Text>
                <Text
                  style={[styles.featureDesc, { color: colors.textSecondary }]}
                >
                  {f.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Promo code */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          HAVE A PROMO CODE?
        </Text>
        <View
          style={[
            styles.promoRow,
            {
              backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
              borderColor: colors.border,
            },
          ]}
        >
          <TextInput
            value={promoCode}
            onChangeText={setPromoCode}
            placeholder="Enter code"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={30}
            style={[styles.promoInput, { color: colors.textPrimary }]}
          />
          <TouchableOpacity
            onPress={handleRedeem}
            activeOpacity={0.85}
            disabled={redeeming}
            style={[
              styles.redeemBtn,
              { backgroundColor: colors.primary },
              redeeming && { opacity: 0.6 },
            ]}
          >
            {redeeming ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.redeemBtnText}>Redeem</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
          style={styles.dismissBtn}
        >
          <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
            Maybe later
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#F7F5F2',
    },
    handleBar: {
      paddingTop: 12,
      paddingBottom: 4,
      alignItems: 'center',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.surfaceSubdued : colors.white,
    },
    badgeRow: {
      alignItems: 'flex-start',
      marginTop: 8,
      marginBottom: 12,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? colors.surfaceSubdued : '#EAF4FF',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 0.8,
    },
    headline: {
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: 28,
      lineHeight: 34,
      marginBottom: 10,
    },
    subheadline: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 24,
    },
    featureCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 28,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      padding: 16,
    },
    featureIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    featureMeta: {
      flex: 1,
    },
    featureTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      marginBottom: 3,
    },
    featureDesc: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      lineHeight: 18,
    },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    promoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 20,
    },
    promoInput: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      paddingHorizontal: 14,
      paddingVertical: 14,
      letterSpacing: 1,
    },
    redeemBtn: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 90,
    },
    redeemBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: '#FFFFFF',
    },
    dismissBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    dismissText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
    },
  });
