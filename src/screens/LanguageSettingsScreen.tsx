import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/I18nContext';
import { SUPPORTED_LANGUAGES } from '../i18n/strings';
import {
  Group,
  SectionTitle,
  Row,
  SettingsHeader,
} from '../components/settings/SettingsPrimitives';

export default function LanguageSettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { lang, setLanguage, t } = useTranslation();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <SettingsHeader
        title={t('settings.section.language')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40 + insets.bottom,
        }}
      >
        <SectionTitle>{t('settings.language.app')}</SectionTitle>
        <Group>
          {SUPPORTED_LANGUAGES.map((l, idx) => {
            const isActive = l.code === lang;
            const isLast = idx === SUPPORTED_LANGUAGES.length - 1;
            return (
              <TouchableOpacity
                key={l.code}
                activeOpacity={0.7}
                onPress={() => setLanguage(l.code)}
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
                <Text style={{ fontSize: 26 }}>{l.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: 'Inter_600SemiBold',
                      fontSize: 15,
                      color: colors.textPrimary,
                    }}
                  >
                    {l.native}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular',
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    {l.name}
                  </Text>
                </View>
                {isActive && (
                  <Ionicons name="checkmark" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </Group>

        <Group>
          <Row
            icon="globe-outline"
            title={t('settings.language.help')}
            subtitle={t('settings.language.helpSub')}
            showChevron
            onPress={() => {}}
            isLast
          />
        </Group>

        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            color: colors.textSecondary,
            marginHorizontal: 6,
            marginTop: 4,
            lineHeight: 18,
          }}
        >
          {t('language.footer')}
        </Text>
      </ScrollView>
    </View>
  );
}
