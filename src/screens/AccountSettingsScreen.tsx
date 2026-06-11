import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/I18nContext';
import { supabase } from '../services/supabase';
import {
  Group,
  Row,
  SectionTitle,
  SettingsHeader,
} from '../components/settings/SettingsPrimitives';

type FocusArea = 'name' | 'email' | 'password' | null;

export default function AccountSettingsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    user,
    profile,
    refreshProfile,
    signOut: signOutWithCleanup,
  } = useAuth();
  const { t } = useTranslation();

  const initialFocus = (route.params?.focus as FocusArea) ?? null;
  const [focus, setFocus] = useState<FocusArea>(initialFocus);

  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Refs for jump-to-section on initial focus
  const scrollRef = useRef<ScrollView>(null);
  const sectionYs = useRef<Record<string, number>>({});

  useEffect(() => {
    setName(profile?.name ?? '');
  }, [profile?.name]);

  useEffect(() => {
    setEmail(user?.email ?? '');
  }, [user?.email]);

  useEffect(() => {
    if (!initialFocus) return;
    const y = sectionYs.current[initialFocus];
    if (typeof y === 'number' && scrollRef.current) {
      setTimeout(
        () =>
          scrollRef.current?.scrollTo({
            y: Math.max(y - 12, 0),
            animated: true,
          }),
        200
      );
    }
  }, [initialFocus]);

  const saveName = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(
        t('account.alert.nameRequired.title'),
        t('account.alert.nameRequired.body')
      );
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ name: trimmed })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert(t('account.alert.saveFailed'), error.message);
      return;
    }
    await refreshProfile();
    Alert.alert(t('account.alert.saved.title'), t('account.alert.saved.body'));
  };

  const changeEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      Alert.alert(
        t('account.alert.invalidEmail.title'),
        t('account.alert.invalidEmail.body')
      );
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setSaving(false);
    if (error) {
      Alert.alert(t('account.alert.updateFailed'), error.message);
      return;
    }
    Alert.alert(
      t('account.alert.confirmEmail.title'),
      t('account.alert.confirmEmail.body')
    );
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert(
        t('account.alert.weakPassword.title'),
        t('account.alert.weakPassword.body')
      );
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      Alert.alert(t('account.alert.updateFailed'), error.message);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    Alert.alert(
      t('account.alert.passwordChanged.title'),
      t('account.alert.passwordChanged.body')
    );
  };

  const signOut = () => {
    Alert.alert(t('alert.signOut.title'), t('alert.signOut.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.account.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOutWithCleanup();
        },
      },
    ]);
  };

  const deleteAccount = () => {
    Alert.alert(t('alert.delete.title'), t('alert.delete.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          // The delete-account Edge Function validates our session JWT, deletes
          // the auth user, and cascades all app data. supabase-js attaches the
          // current access token to the invocation automatically.
          const { error } = await supabase.functions.invoke('delete-account');
          setSaving(false);
          if (error) {
            Alert.alert(
              t('account.alert.deleteFailed.title'),
              t('account.alert.deleteFailed.body')
            );
            return;
          }
          // Account is gone server-side — clear the local session + device
          // state, which routes back to Login.
          await signOutWithCleanup();
        },
      },
    ]);
  };

  const inputStyle = {
    backgroundColor: colors.surfaceSubdued,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_500Medium' as const,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  };
  const labelStyle = {
    fontFamily: 'Inter_500Medium' as const,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <SettingsHeader
          title={t('settings.section.account')}
          onBack={() => navigation.goBack()}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Profile (name) ── */}
        <View
          onLayout={(e) => {
            sectionYs.current.name = e.nativeEvent.layout.y;
          }}
        >
          <SectionTitle>{t('account.profile')}</SectionTitle>
          <Group>
            <View style={{ padding: 16 }}>
              <Text style={labelStyle}>{t('account.displayName')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('account.namePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
                autoCapitalize="words"
                returnKeyType="done"
              />
              <PrimaryButton
                title={t('account.saveName')}
                onPress={saveName}
                disabled={saving || name.trim() === (profile?.name ?? '')}
              />
            </View>
          </Group>
        </View>

        {/* ── Email ── */}
        <View
          onLayout={(e) => {
            sectionYs.current.email = e.nativeEvent.layout.y;
          }}
        >
          <SectionTitle>{t('account.emailSection')}</SectionTitle>
          <Group>
            <View style={{ padding: 16 }}>
              <Text style={labelStyle}>{t('account.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Text
                style={{
                  fontFamily: 'Inter_400Regular',
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginTop: 8,
                  marginLeft: 4,
                }}
              >
                {t('account.emailHelper')}
              </Text>
              <PrimaryButton
                title={t('account.updateEmail')}
                onPress={changeEmail}
                disabled={saving || email.trim() === (user?.email ?? '')}
              />
            </View>
          </Group>
        </View>

        {/* ── Password ── */}
        <View
          onLayout={(e) => {
            sectionYs.current.password = e.nativeEvent.layout.y;
          }}
        >
          <SectionTitle>{t('account.passwordSection')}</SectionTitle>
          <Group>
            <View style={{ padding: 16 }}>
              <Text style={labelStyle}>{t('account.newPassword')}</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t('account.passwordPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
                secureTextEntry
                autoCapitalize="none"
              />
              <PrimaryButton
                title={t('account.changePassword')}
                onPress={changePassword}
                disabled={saving || newPassword.length < 8}
              />
            </View>
          </Group>
        </View>

        {/* ── Session ── */}
        <Group>
          <Row
            icon="log-out-outline"
            title={t('settings.account.signOut')}
            onPress={signOut}
            isLast
          />
        </Group>

        {/* ── Danger zone ── */}
        <SectionTitle>{t('account.dangerZone')}</SectionTitle>
        <Group>
          <Row
            icon="trash-outline"
            title={t('settings.account.delete')}
            subtitle={t('settings.account.deleteSub')}
            onPress={deleteAccount}
            danger
            showChevron
            isLast
          />
        </Group>

        {saving && (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={{
        backgroundColor: disabled ? colors.surfaceSubdued : colors.primary,
        paddingVertical: 13,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 14,
      }}
    >
      <Text
        style={{
          fontFamily: 'Inter_700Bold',
          fontSize: 14,
          color: disabled ? colors.textSecondary : colors.accentOn,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
