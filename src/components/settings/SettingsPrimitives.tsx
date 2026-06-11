import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemeColors } from '../../constants/theme';

// ── Section title (small uppercase label) ────────────────────────────────────
export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: 'Inter_700Bold',
        fontSize: 11,
        color: colors.textSecondary,
        letterSpacing: 1,
        marginHorizontal: 4,
        marginBottom: 8,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

// ── Group container (white-card rounded list) ────────────────────────────────
export function Group({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 24,
        ...(isDark
          ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }
          : {
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 1,
            }),
      }}
    >
      {children}
    </View>
  );
}

interface RowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconNode?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  isLast?: boolean;
  danger?: boolean;
}

export function Row({
  icon,
  iconNode,
  iconBg,
  iconColor,
  title,
  subtitle,
  trailing,
  showChevron = false,
  onPress,
  isLast = false,
  danger = false,
}: RowProps) {
  const { colors, isDark } = useTheme();
  const titleColor = danger ? colors.expenseRed : colors.textPrimary;
  const tileBg = iconBg ?? (danger
    ? isDark ? 'rgba(224,92,92,0.15)' : '#FCE9E5'
    : colors.accentMuted);
  const tint = iconColor ?? (danger ? colors.expenseRed : colors.accentMutedOn);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {(icon || iconNode) && (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: tileBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {iconNode ?? <Ionicons name={icon!} size={18} color={tint} />}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
            color: titleColor,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 12,
              color: colors.textSecondary,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.iconMuted}
        />
      )}
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

// ── Themed switch using accent token (not raw primary) ───────────────────────
export function ThemedSwitch({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{
        false: Platform.OS === 'android' ? colors.border : undefined,
        true: colors.primary,
      }}
      thumbColor={
        Platform.OS === 'android'
          ? value
            ? colors.accentOn
            : '#FFFFFF'
          : undefined
      }
      ios_backgroundColor={colors.surfaceSubdued}
    />
  );
}

// ── Settings screen header (back button + title) ─────────────────────────────
export function SettingsHeader({
  title,
  onBack,
  rightAction,
}: {
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        paddingTop: 4,
      }}
    >
      <TouchableOpacity
        onPress={onBack}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.surfaceSubdued,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="chevron-back" size={20} color={colors.icon} />
      </TouchableOpacity>
      <Text
        style={{
          fontFamily: 'Nunito_800ExtraBold',
          fontSize: 18,
          color: colors.textPrimary,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      <View style={{ width: 36, height: 36 }}>{rightAction}</View>
    </View>
  );
}

export function useSettingsColors(): ThemeColors {
  return useTheme().colors;
}
