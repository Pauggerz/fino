import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';

function StarIcon({ size = 12, fill }: { size?: number; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l1.8 6L20 9.6l-5 4 1.5 6.4L12 16.5 7.5 20 9 13.6 4 9.6 10.2 8z"
        fill={fill}
      />
    </Svg>
  );
}

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
      <View style={[styles.starBox, { backgroundColor: colors.lavender }]}>
        <StarIcon size={14} fill={colors.lavenderDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.headlineLabel, { color: colors.lavenderDark }]}>
          Fino Intelligence
        </Text>
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
      <View style={[styles.chipStar, { backgroundColor: colors.lavender }]}>
        <StarIcon size={10} fill={colors.lavenderDark} />
      </View>
      <Text style={[styles.chipText, { color: colors.textPrimary }]}>
        {text}
      </Text>
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
  starBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
    textTransform: 'uppercase',
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
  chipStar: {
    width: 18,
    height: 18,
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
});
