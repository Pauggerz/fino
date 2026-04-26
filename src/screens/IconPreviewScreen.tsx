import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  FinoIconA,
  FinoIconB,
  FinoIconC,
  FinoIconD,
  FinoIconE,
} from '../components/icons/FinoIntelIconVariants';
import { FinoIntelIcon } from '../components/icons/FinoIntelIcon';

const VARIANTS: {
  key: string;
  name: string;
  blurb: string;
  Component: React.ComponentType<{
    size?: number;
    color?: string;
    accent?: string;
    filled?: boolean;
  }>;
}[] = [
  {
    key: 'current',
    name: 'CURRENT — 4-Point Spark with Orbit',
    blurb:
      'Diamond/spark with a small orbiting node. Distinctive but a bit busy at small sizes.',
    Component: FinoIntelIcon,
  },
  {
    key: 'A',
    name: 'A — Monogram F + Spark',
    blurb:
      'Geometric "F" with a spark at the top arm. Strongest direct brand link.',
    Component: FinoIconA,
  },
  {
    key: 'B',
    name: 'B — Orbital Atom',
    blurb:
      'Central core with two orbital paths and small nodes. Reads as "AI agent."',
    Component: FinoIconB,
  },
  {
    key: 'C',
    name: 'C — Sparkle Constellation',
    blurb:
      'One large sparkle plus two satellites. Universal generative-AI iconography.',
    Component: FinoIconC,
  },
  {
    key: 'D',
    name: 'D — Faceted Diamond',
    blurb: 'Geometric gem with internal facets. Trustworthy / precise feel.',
    Component: FinoIconD,
  },
  {
    key: 'E',
    name: 'E — Pulse Spark',
    blurb:
      'ECG waveform ending in a spark. Connects to the "Pulse" section name.',
    Component: FinoIconE,
  },
];

export default function IconPreviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Fino Intelligence Icon — Variants
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Each row shows the icon at 12 / 18 / 24 / 36 / 64 px in light & dark
        contexts, with the BETA chip layout for context.
      </Text>

      {VARIANTS.map(({ key, name, blurb, Component }) => (
        <View
          key={key}
          style={[
            styles.card,
            {
              backgroundColor: colors.white,
              borderColor: colors.cardBorderTransparent,
            },
          ]}
        >
          <Text style={[styles.cardName, { color: colors.textPrimary }]}>
            {name}
          </Text>
          <Text style={[styles.cardBlurb, { color: colors.textSecondary }]}>
            {blurb}
          </Text>

          {/* Light backdrop */}
          <View
            style={[
              styles.demoRow,
              { backgroundColor: colors.lavenderLight },
            ]}
          >
            {[12, 18, 24, 36, 64].map((sz) => (
              <View key={`l-${sz}`} style={styles.swatch}>
                <Component size={sz} color={colors.lavenderDark} />
                <Text
                  style={[styles.swatchLabel, { color: colors.lavenderDark }]}
                >
                  {sz}
                </Text>
              </View>
            ))}
          </View>

          {/* Filled hero treatment */}
          <View style={[styles.demoRow, { backgroundColor: '#1E1E2E' }]}>
            {[18, 24, 36, 64].map((sz) => (
              <View key={`d-${sz}`} style={styles.swatch}>
                <Component
                  size={sz}
                  color="#D7C4F1"
                  accent="#FFFFFF"
                  filled
                />
                <Text style={[styles.swatchLabel, { color: '#D7C4F1' }]}>
                  {sz}
                </Text>
              </View>
            ))}
          </View>

          {/* In-chip preview */}
          <View
            style={[
              styles.chipPreview,
              {
                backgroundColor: colors.lavenderLight,
                borderColor: 'rgba(176,154,224,0.28)',
              },
            ]}
          >
            <View
              style={[styles.chipIconBox, { backgroundColor: colors.lavender }]}
            >
              <Component size={12} color={colors.lavenderDark} />
            </View>
            <Text style={[styles.chipText, { color: colors.textPrimary }]}>
              Heads up — Dining is up 32% vs your 3-mo average.
            </Text>
            <View
              style={[styles.betaPill, { backgroundColor: colors.lavender }]}
            >
              <Text
                style={[styles.betaText, { color: colors.lavenderDark }]}
              >
                BETA
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 22,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  card: {
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    gap: 10,
  },
  cardName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  cardBlurb: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  swatch: { alignItems: 'center', gap: 4 },
  swatchLabel: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 9,
  },
  chipPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
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
  betaPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  betaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.6,
  },
});
