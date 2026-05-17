import React, { useMemo } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTranslation } from '../contexts/I18nContext';
import { ACCENT_THEMES, AccentKey } from '../constants/theme';
import {
  Group,
  Row,
  SectionTitle,
  SettingsHeader,
} from '../components/settings/SettingsPrimitives';
import { SUPPORTED_LANGUAGES } from '../i18n/strings';

const APP_VERSION = '1.4.2';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, mode, setMode, accent, setAccent, isDark } = useTheme();
  const { user, profile } = useAuth();
  const { meta: currencyMeta } = useCurrency();
  const { lang, t } = useTranslation();

  const langMeta = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0],
    [lang]
  );

  const email = user?.email ?? '';
  const displayName = profile?.name || (email ? email.split('@')[0] : 'You');
  const initial = (displayName[0] || 'F').toUpperCase();

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}
    >
      <SettingsHeader
        title={t('settings.title')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ── */}
        <View
          style={{
            backgroundColor: colors.white,
            borderRadius: 24,
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 24,
            ...(isDark
              ? {
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }
              : {
                  shadowColor: '#000',
                  shadowOpacity: 0.05,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }),
          }}
        >
          <LinearGradient
            colors={[colors.primary, colors.heroBg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'Nunito_800ExtraBold',
                fontSize: 22,
                color: colors.accentOn,
              }}
            >
              {initial}
            </Text>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: 'Nunito_800ExtraBold',
                fontSize: 18,
                color: colors.textPrimary,
              }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text
              style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 12,
                color: colors.textSecondary,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {email || 'Not signed in'}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: colors.accentMuted,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 10,
                color: colors.accentMutedOn,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              Free
            </Text>
          </View>
        </View>

        {/* ── Appearance ── */}
        <SectionTitle>{t('settings.section.appearance')}</SectionTitle>
        <Group>
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 14,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <View style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: colors.accentMuted,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="sunny-outline" size={18} color={colors.accentMutedOn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textPrimary,
                }}>
                  {t('settings.appearance.theme')}
                </Text>
                <Text style={{
                  fontFamily: 'Inter_400Regular', fontSize: 12,
                  color: colors.textSecondary, marginTop: 2,
                }}>
                  {t('settings.appearance.themeSub')}
                </Text>
              </View>
            </View>
            <ThemeModeSegmented mode={mode} onChange={setMode} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: colors.accentMuted,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="color-palette-outline" size={18} color={colors.accentMutedOn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textPrimary,
                }}>
                  {t('settings.appearance.accent')}
                </Text>
                <Text style={{
                  fontFamily: 'Inter_400Regular', fontSize: 12,
                  color: colors.textSecondary, marginTop: 2,
                }}>
                  {t('settings.appearance.accentSub')}
                </Text>
              </View>
            </View>
            <AccentPicker accent={accent} onChange={setAccent} />
          </View>

          <View style={{
            paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16,
            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
          }}>
            <Text style={{
              fontFamily: 'Inter_700Bold', fontSize: 11,
              color: colors.textSecondary, letterSpacing: 1,
              textTransform: 'uppercase', marginTop: 10, marginBottom: 10,
            }}>
              {t('settings.appearance.preview')}
            </Text>
            <ThemePreview />
          </View>
        </Group>

        {/* ── Account ── */}
        <SectionTitle>{t('settings.section.account')}</SectionTitle>
        <Group>
          <Row
            icon="person-outline"
            title={t('settings.account.edit')}
            subtitle={t('settings.account.editSub')}
            showChevron
            onPress={() => navigation.navigate('AccountSettings')}
          />
          <Row
            icon="mail-outline"
            title={t('settings.account.email')}
            subtitle={email || '—'}
            showChevron
            onPress={() => navigation.navigate('AccountSettings', { focus: 'email' })}
          />
          <Row
            icon="lock-closed-outline"
            title={t('settings.account.password')}
            showChevron
            onPress={() => navigation.navigate('AccountSettings', { focus: 'password' })}
            isLast
          />
        </Group>

        {/* ── Notifications ── */}
        <SectionTitle>{t('settings.section.notifications')}</SectionTitle>
        <Group>
          <Row
            icon="notifications-outline"
            title={t('settings.notifications.push')}
            subtitle={t('settings.notifications.pushSub')}
            showChevron
            onPress={() => navigation.navigate('NotificationSettings')}
            isLast
          />
        </Group>

        {/* ── Currency & Region ── */}
        <SectionTitle>{t('settings.section.currency')}</SectionTitle>
        <Group>
          <Row
            icon="cash-outline"
            title={t('settings.currency.primary')}
            subtitle={t('settings.currency.primarySub')}
            trailing={
              <Text style={{
                fontFamily: 'DMMono_500Medium', fontSize: 13,
                color: colors.textSecondary, marginRight: 4,
              }}>
                {currencyMeta.symbol} {currencyMeta.code}
              </Text>
            }
            showChevron
            onPress={() => navigation.navigate('CurrencySettings')}
            isLast
          />
        </Group>

        {/* ── Language ── */}
        <SectionTitle>{t('settings.section.language')}</SectionTitle>
        <Group>
          <Row
            icon="language-outline"
            title={t('settings.language.app')}
            subtitle={`${langMeta.flag}  ${langMeta.native}`}
            showChevron
            onPress={() => navigation.navigate('LanguageSettings')}
            isLast
          />
        </Group>

        {/* ── About ── */}
        <SectionTitle>{t('settings.section.about')}</SectionTitle>
        <Group>
          <Row
            icon="information-circle-outline"
            title={t('settings.about.version')}
            trailing={
              <Text style={{
                fontFamily: 'DMMono_400Regular', fontSize: 13,
                color: colors.textSecondary, marginRight: 4,
              }}>
                {APP_VERSION}
              </Text>
            }
          />
          <Row
            icon="chatbubble-ellipses-outline"
            title={t('settings.about.feedback')}
            showChevron
            onPress={() => {}}
            isLast
          />
        </Group>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Theme mode segmented control ────────────────────────────────────────────

function ThemeModeSegmented({
  mode,
  onChange,
}: {
  mode: 'system' | 'light' | 'dark';
  onChange: (m: 'system' | 'light' | 'dark') => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const opts: Array<{
    key: 'system' | 'light' | 'dark';
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }> = [
    { key: 'system', icon: 'phone-portrait-outline', label: t('settings.appearance.system') },
    { key: 'light',  icon: 'sunny-outline',         label: t('settings.appearance.light')  },
    { key: 'dark',   icon: 'moon-outline',          label: t('settings.appearance.dark')   },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceSubdued,
        borderRadius: 12,
        padding: 4,
      }}
    >
      {opts.map((opt) => {
        const active = mode === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              borderRadius: 9,
              ...(active && {
                backgroundColor: colors.white,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              }),
            }}
          >
            <Ionicons
              name={opt.icon}
              size={15}
              color={active ? colors.textPrimary : colors.textSecondary}
            />
            <Text
              style={{
                fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium',
                fontSize: 13,
                color: active ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Accent picker (swatch grid) ─────────────────────────────────────────────

function AccentPicker({
  accent,
  onChange,
}: {
  accent: AccentKey;
  onChange: (k: AccentKey) => void;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 14,
      }}
    >
      {ACCENT_THEMES.map((theme) => {
        const isActive = accent === theme.key;
        return (
          <TouchableOpacity
            key={theme.key}
            onPress={() => onChange(theme.key)}
            activeOpacity={0.8}
            style={{ alignItems: 'center', gap: 6, width: 64 }}
          >
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: theme.swatch,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: isActive ? 3 : 2,
                borderColor: isActive
                  ? colors.textPrimary
                  : isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.06)',
                shadowColor: theme.swatch,
                shadowOpacity: isActive ? 0.4 : 0,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: isActive ? 4 : 0,
              }}
            >
              {isActive && (
                <Ionicons
                  name="checkmark"
                  size={22}
                  color={
                    // Use a luminance-safe color based on accent — for now,
                    // the active swatch's own `light.accentOn` (if defined).
                    (theme.light.accentOn as string) ?? '#FFFFFF'
                  }
                />
              )}
            </View>
            <Text
              style={{
                fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular',
                fontSize: 11,
                color: isActive ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {theme.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Live preview (uses new paired tokens) ───────────────────────────────────

function ThemePreview() {
  const { colors } = useTheme();
  const { format } = useCurrency();
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden' }}>
      {/* Hero — uses heroBg + heroOn instead of hardcoded #fff */}
      <View
        style={{
          backgroundColor: colors.heroBg,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: 'Inter_500Medium',
              fontSize: 10,
              letterSpacing: 1.2,
              color: colors.heroSub,
              textTransform: 'uppercase',
            }}
          >
            Total balance
          </Text>
          <Text
            style={{
              fontFamily: 'Nunito_900Black',
              fontSize: 28,
              color: colors.heroOn,
              letterSpacing: -1,
              marginTop: 2,
            }}
          >
            {format(48250)}
          </Text>
        </View>
        <View
          style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="wallet" size={18} color={colors.iconOnAccent} />
        </View>
      </View>
      {/* Row */}
      <View
        style={{
          backgroundColor: colors.surfaceSubdued,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: colors.accentMuted,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="restaurant-outline" size={18} color={colors.accentMutedOn} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.textPrimary,
          }}>
            Jollibee
          </Text>
          <Text style={{
            fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.textSecondary,
          }}>
            Food & Dining
          </Text>
        </View>
        <Text style={{
          fontFamily: 'DMMono_500Medium', fontSize: 13, color: colors.expenseRed,
        }}>
          −{format(285)}
        </Text>
      </View>
      {/* Buttons */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{
            fontFamily: 'Inter_700Bold', fontSize: 14, color: colors.accentOn,
          }}>
            Continue
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.accentMuted,
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{
            fontFamily: 'Inter_700Bold', fontSize: 14, color: colors.accentMutedOn,
          }}>
            Skip
          </Text>
        </View>
      </View>
    </View>
  );
}
