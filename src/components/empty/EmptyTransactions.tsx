import React, { useEffect, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/constants/theme';
import { AmbientOrb } from './AnimatedAmbient';

/**
 * Animated empty-state for the transactions feed.
 *
 * Architecture:
 *   - Every motion lives on the UI thread via Reanimated shared values; no
 *     setInterval / no JS-bridge crossings per frame.
 *   - Honours `useReducedMotion()` — when active, animations resolve to
 *     their resting state and never tick.
 *   - StyleSheets are memoised per theme so `colors` swaps don't re-create
 *     the object on every render.
 *   - Decorative views are non-interactive (`pointerEvents="none"`) so the
 *     CTA absorbs all touches without hit-test contention.
 *
 * Visual layers (back → front):
 *   1. Two ambient orbs (sage + peach), drift, 9–11s loops
 *   2. Three concentric pulse rings expanding from the receipt
 *   3. The receipt card itself, gentle vertical float + tilt
 *   4. The `+` chip with its own halo pulse
 *   5. Four upward-rising "coins" in muted theme accents
 *   6. Heading / body / CTA stack
 */

export interface EmptyTransactionsProps {
  title: string;
  body: string;
  /** Optional CTA. When omitted (e.g. search-empty), nothing renders below body. */
  ctaLabel?: string;
  onPressCta?: () => void;
  /** Tighter sizing when embedded inside a section instead of a full screen. */
  compact?: boolean;
  style?: ViewStyle;
}

const RING_COUNT = 3;
const COIN_COUNT = 4;
const RING_DURATION_MS = 3600;
const FLOAT_DURATION_MS = 5000;
const CHIP_DURATION_MS = 3200;
const COIN_DURATION_MS = 6000;

export const EmptyTransactions: React.FC<EmptyTransactionsProps> = React.memo(
  ({ title, body, ctaLabel, onPressCta, compact = false, style }) => {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
    const reduceMotion = useReducedMotion();

    // ── Shared clocks ──────────────────────────────────────────────────────
    // Each clock counts 0→1 forever. Visual derivations happen in
    // useAnimatedStyle so the worklet evaluates only when its outputs change.
    const ringProgress = [
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
    ];
    const floatProgress = useSharedValue(0);
    const chipProgress = useSharedValue(0);
    const coinProgress = [
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
    ];

    useEffect(() => {
      if (reduceMotion) {
        // Park each clock at its resting state. No further work scheduled.
        ringProgress.forEach((v) => { v.value = 0; });
        floatProgress.value = 0.5;
        chipProgress.value = 0.5;
        coinProgress.forEach((v) => { v.value = 0; });
        return;
      }
      const ringDelay = RING_DURATION_MS / RING_COUNT;
      ringProgress.forEach((v, i) => {
        v.value = 0;
        v.value = withDelay(
          ringDelay * i,
          withRepeat(
            withTiming(1, { duration: RING_DURATION_MS, easing: Easing.out(Easing.cubic) }),
            -1,
            false,
          ),
        );
      });
      floatProgress.value = withRepeat(
        withTiming(1, { duration: FLOAT_DURATION_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      chipProgress.value = withRepeat(
        withTiming(1, { duration: CHIP_DURATION_MS, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      );
      const coinDelay = COIN_DURATION_MS / COIN_COUNT;
      coinProgress.forEach((v, i) => {
        v.value = 0;
        v.value = withDelay(
          coinDelay * i,
          withRepeat(
            withTiming(1, { duration: COIN_DURATION_MS, easing: Easing.linear }),
            -1,
            false,
          ),
        );
      });
      // Reanimated cancels worklet timing automatically when the component
      // unmounts, so no explicit cleanup is required.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reduceMotion]);

    return (
      <View style={[styles.wrap, style]}>
        {/* Layer 1 — ambient orbs (decorative, non-interactive). */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <AmbientOrb
            size={260}
            color={colors.primary}
            baseOpacity={0.16}
            amplitude={28}
            durationMs={9000}
            style={{ top: -40, left: -80 }}
          />
          <AmbientOrb
            size={220}
            color={colors.peach}
            baseOpacity={0.36}
            amplitude={34}
            durationMs={11000}
            phase={0.4}
            style={{ bottom: -40, right: -60 }}
          />
        </View>

        {/* Layer 5 — coins. Rendered behind the hero card so they appear to
            rise from below it. */}
        <View pointerEvents="none" style={styles.coinsLayer}>
          <Coin progress={coinProgress[0]} color={colors.primary} size={10} left="14%" />
          <Coin progress={coinProgress[1]} color={colors.peach} size={8} left="74%" />
          <Coin progress={coinProgress[2]} color={colors.lavender} size={9} left="32%" />
          <Coin progress={coinProgress[3]} color={colors.primary} size={6} left="60%" opacity={0.7} />
        </View>

        {/* Layer 2-4 — receipt + rings + chip, all centred together. */}
        <View style={styles.heroBlock}>
          <View style={styles.receiptStack}>
            {ringProgress.map((p, i) => (
              <PulseRing key={i} progress={p} color={colors.primary} />
            ))}

            <ReceiptCard progress={floatProgress} colors={colors} styles={styles} />

            <AddChip progress={chipProgress} colors={colors} />
          </View>
        </View>

        {/* Layer 6 — copy + CTA. Always last in the tree so it sits on top
            even without explicit z-indexing. */}
        <View style={styles.copyBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {ctaLabel && onPressCta && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              onPress={onPressCta}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  },
);

EmptyTransactions.displayName = 'EmptyTransactions';

// ── Sub-pieces ────────────────────────────────────────────────────────────

interface PulseRingProps {
  progress: SharedValue<number>;
  color: string;
}

const PulseRing = React.memo(({ progress, color }: PulseRingProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(progress.value, [0, 1], [0.55, 1.4]);
    // Bell-shaped opacity: 0 → 0.45 → 0
    const opacity =
      progress.value < 0.2
        ? interpolate(progress.value, [0, 0.2], [0, 0.45])
        : interpolate(progress.value, [0.2, 1], [0.45, 0]);
    return { transform: [{ scale }], opacity };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        ringStyles.ring,
        { borderColor: color },
        animatedStyle,
      ]}
    />
  );
});

PulseRing.displayName = 'PulseRing';

const ringStyles = StyleSheet.create({
  ring: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderRadius: 999,
  },
});

interface ReceiptCardProps {
  progress: SharedValue<number>;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

const ReceiptCard = React.memo(({ progress, colors, styles }: ReceiptCardProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const ty = interpolate(progress.value, [0, 1], [0, -8]);
    const rotate = interpolate(progress.value, [0, 1], [-2, -1]);
    return { transform: [{ translateY: ty }, { rotate: `${rotate}deg` }] };
  });
  return (
    <Animated.View style={[styles.receipt, animatedStyle]}>
      <View style={styles.receiptIcon}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <SvgPath
            d="M19 4H5c-1 0-2 .9-2 2v14l3-2 3 2 3-2 3 2 3-2 3 2V6c0-1.1-.9-2-2-2z"
            stroke={colors.primary}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <SvgPath d="M7 9h10" stroke={colors.primary} strokeWidth={2.2} strokeLinecap="round" />
          <SvgPath d="M7 13h6" stroke={colors.primary} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={[styles.receiptLine, { width: '78%' }]} />
      <View style={[styles.receiptLine, { width: '56%' }]} />
      <View style={[styles.receiptLine, { width: '38%', height: 5 }]} />
    </Animated.View>
  );
});

ReceiptCard.displayName = 'ReceiptCard';

interface AddChipProps {
  progress: SharedValue<number>;
  colors: ThemeColors;
}

const AddChip = React.memo(({ progress, colors }: AddChipProps) => {
  const chipStyle = useAnimatedStyle(() => {
    'worklet';
    const ty = Math.sin(progress.value * Math.PI * 2) * 4;
    return { transform: [{ translateY: ty }] };
  });
  const haloStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(progress.value, [0, 1], [1, 1.5]);
    const opacity = interpolate(progress.value, [0, 0.8, 1], [0.6, 0, 0]);
    return { transform: [{ scale }], opacity };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[chipBaseStyles.wrap, chipStyle]}
    >
      <Animated.View
        style={[
          chipBaseStyles.halo,
          { borderColor: colors.primary },
          haloStyle,
        ]}
      />
      <View style={[chipBaseStyles.body, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={22} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
});

AddChip.displayName = 'AddChip';

const chipBaseStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: -10,
    bottom: -6,
    width: 44,
    height: 44,
  },
  halo: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -6,
    bottom: -6,
    borderRadius: 999,
    borderWidth: 2,
  },
  body: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B8C6E',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});

interface CoinProps {
  progress: SharedValue<number>;
  color: string;
  size: number;
  left: `${number}%`;
  opacity?: number;
}

const Coin = React.memo(({ progress, color, size, left, opacity = 1 }: CoinProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const ty = interpolate(progress.value, [0, 1], [0, -220]);
    const s = interpolate(progress.value, [0, 1], [0.6, 1]);
    // Fade in fast, hold, fade out — feels less mechanical than a linear fade.
    const o =
      progress.value < 0.15
        ? interpolate(progress.value, [0, 0.15], [0, 0.5])
        : progress.value > 0.85
          ? interpolate(progress.value, [0.85, 1], [0.5, 0])
          : 0.5;
    return {
      opacity: o * opacity,
      transform: [{ translateY: ty }, { scale: s }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left,
          bottom: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
});

Coin.displayName = 'Coin';

// ── Styles ────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors, compact: boolean) {
  const stack = compact ? 120 : 156;
  return StyleSheet.create({
    wrap: {
      // `minHeight` lets us render correctly inside non-flex containers
      // (FlashList rows) while still expanding when the consumer wraps us
      // in a flex parent and passes `flex: 1` via the `style` prop.
      minHeight: compact ? 320 : 480,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: compact ? 24 : 32,
      paddingTop: compact ? 12 : 24,
      paddingBottom: compact ? 24 : 48,
    },
    coinsLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    heroBlock: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: compact ? 18 : 28,
    },
    receiptStack: {
      width: stack,
      height: stack,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receipt: {
      position: 'absolute',
      left: compact ? 18 : 24,
      top: compact ? 18 : 24,
      right: compact ? 18 : 24,
      bottom: compact ? 18 : 24,
      backgroundColor: colors.white,
      borderRadius: compact ? 14 : 18,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      paddingVertical: compact ? 12 : 16,
      paddingHorizontal: compact ? 11 : 14,
      gap: compact ? 6 : 8,
      shadowColor: '#1E1E2E',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
    },
    receiptIcon: {
      width: compact ? 22 : 28,
      height: compact ? 22 : 28,
      borderRadius: compact ? 6 : 8,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptLine: {
      height: compact ? 5 : 7,
      borderRadius: 4,
      backgroundColor: colors.primaryLight,
    },
    copyBlock: {
      alignItems: 'center',
      maxWidth: 320,
    },
    title: {
      fontFamily: 'Nunito_700Bold',
      fontSize: compact ? 17 : 20,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      textAlign: 'center',
      marginBottom: compact ? 4 : 6,
    },
    body: {
      fontFamily: 'Inter_400Regular',
      fontSize: compact ? 13 : 14,
      color: colors.textSecondary,
      lineHeight: compact ? 18 : 20,
      textAlign: 'center',
      maxWidth: 280,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: compact ? 18 : 22,
      paddingVertical: compact ? 10 : 12,
      borderRadius: 999,
      marginTop: compact ? 14 : 20,
      shadowColor: '#5B8C6E',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    ctaText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: compact ? 13 : 14,
      color: '#FFFFFF',
    },
  });
}
