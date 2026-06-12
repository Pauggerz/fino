import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/I18nContext';
import { useCurrency, SUPPORTED_CURRENCIES } from '../contexts/CurrencyContext';
import {
  Group,
  SettingsHeader,
} from '../components/settings/SettingsPrimitives';

export default function CurrencySettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { code, setCurrency } = useCurrency();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUPPORTED_CURRENCIES;
    return SUPPORTED_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.includes(q)
    );
  }, [query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <SettingsHeader
        title={t('settings.section.currency')}
        onBack={() => navigation.goBack()}
      />

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surfaceSubdued,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="search" size={16} color={colors.iconMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('currency.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={{
              flex: 1,
              fontFamily: 'Inter_500Medium',
              fontSize: 14,
              color: colors.textPrimary,
              padding: 0,
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.iconMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Group>
          {filtered.map((c, idx) => {
            const isActive = c.code === code;
            const isLast = idx === filtered.length - 1;
            return (
              <TouchableOpacity
                key={c.code}
                activeOpacity={0.7}
                onPress={async () => {
                  await setCurrency(c.code);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  gap: 14,
                  borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: isActive ? colors.primary : colors.accentMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Nunito_800ExtraBold',
                      fontSize: 16,
                      color: isActive ? colors.accentOn : colors.accentMutedOn,
                    }}
                  >
                    {c.symbol}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Inter_600SemiBold',
                      fontSize: 15,
                      color: colors.textPrimary,
                    }}
                  >
                    {c.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'DMMono_400Regular',
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    {c.code} · {c.locale}
                  </Text>
                </View>
                {isActive && (
                  <Ionicons name="checkmark" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
          {filtered.length === 0 && (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text
                style={{
                  fontFamily: 'Inter_500Medium',
                  fontSize: 13,
                  color: colors.textSecondary,
                }}
              >
                {t('currency.noMatch', { query })}
              </Text>
            </View>
          )}
        </Group>
      </ScrollView>
    </View>
  );
}
