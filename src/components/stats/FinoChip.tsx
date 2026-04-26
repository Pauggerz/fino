import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FinoIntelIcon } from '@/components/icons/FinoIntelIcon';

export function FinoHeadline({ text }: { text: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.headline,
        {
          backgroundColor: colors.lavenderLight,
          borderColor: isDark
            ? colors.cardBorderTransparent
            : 'rgba(176,154,224,0.35)',
        },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.lavender }]}>
        <FinoIntelIcon size={16} color={colors.lavenderDark} filled />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.headlineLabelRow}>
          <Text style={[styles.headlineLabel, { color: colors.lavenderDark }]}>
            Fino Intelligence
          </Text>
          <View style={[styles.betaPill, { backgroundColor: colors.lavender }]}>
            <Text
              style={[styles.betaPillText, { color: colors.lavenderDark }]}
            >
              BETA
            </Text>
          </View>
        </View>
        <Text style={[styles.headlineText, { color: colors.textPrimary }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

export function FinoChip({ text }: { text: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: colors.lavenderLight,
          borderColor: isDark
            ? colors.cardBorderTransparent
            : 'rgba(176,154,224,0.28)',
        },
      ]}
    >
      <View style={[styles.chipIconBox, { backgroundColor: colors.lavender }]}>
        <FinoIntelIcon size={12} color={colors.lavenderDark} />
      </View>
      <Text style={[styles.chipText, { color: colors.textPrimary }]}>
        {text}
      </Text>
      <View style={[styles.chipBetaPill, { backgroundColor: colors.lavender }]}>
        <Text style={[styles.chipBetaText, { color: colors.lavenderDark }]}>
          BETA
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  headlineLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  betaPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  betaPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.6,
  },
  headlineText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  chip: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginBottom: 8,
  },
  chipIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  chipBetaPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipBetaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.6,
  },
});
