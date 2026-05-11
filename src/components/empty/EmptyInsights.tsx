import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle as SvgCircle, Line as SvgLine } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/constants/theme';
import { AmbientOrb } from './AnimatedAmbient';

/**
 * Animated empty-state for the Insights screen.
 *
 * Same architecture as EmptyTransactions:
 *   - Reanimated UI-thread animations only
 *   - Honours `useReducedMotion()`
 *   - Memoised styles, frozen sub-components
 *   - Pure inline SVG / native views — no Skia, no Lottie, no asset hits
 *
 * Visual layers (back → front):
 *   1. Two ambient orbs (lavender + sage)
 *   2. Six bars rising/falling in a wave (staggered scaleY)
 *   3. A spark dot tracing the chart top with a soft trail
 *   4. A magnifier badge floating at upper-right of the chart
 *   5. A sweeping shimmer bar under the chart
 *   6. Heading / body / status chip (or CTA when supplied)
 */

export interface EmptyInsightsProps {
  title: string;
  body: string;
  /** Pill at the bottom — "Learning your habits" by default. */
  chipLabel?: string;
  /** Optional CTA. When supplied, replaces the status chip. */
  ctaLabel?: string;
  onPressCta?: () => void;
  style?: ViewStyle;
}

const BAR_COUNT = 6;
const BAR_DURATION_MS = 3400;
const BAR_STAGGER_MS = 180;
const SPARK_DURATION_MS = 4000;
const PROGRESS_DURATION_MS = 2600;
const BADGE_DURATION_MS = 4000;
const CHIP_DOT_DURATION_MS = 1600;

const BAR_WIDTH = 22;
const BAR_GAP = 8;
const CHART_WIDTH = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP; // 188
const CHART_HEIGHT = 156;
const SPARK_TRACK_HEIGHT = 36;

// Heights for each bar at peak (multiplied by scaleY oscillation in [0.4, 1]).
const BAR_HEIGHTS = [60, 96, 76, 132, 48, 108];

export const EmptyInsights: React.FC<EmptyInsightsProps> = React.memo(
  ({ title, body, chipLabel, ctaLabel, onPressCta, style }) => {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const reduceMotion = useReducedMotion();

    // ── Shared clocks ──────────────────────────────────────────────────────
    const barClocks = [
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
      useSharedValue(0),
    ];
    const sparkProgress = useSharedValue(0);
    const progressSweep = useSharedValue(0);
    const badgeFloat = useSharedValue(0);
    const dotPulse = useSharedValue(0);

    useEffect(() => {
      if (reduceMotion) {
        barClocks.forEach((v) => { v.value = 0.5; });
        sparkProgress.value = 0;
        progressSweep.value = 0;
        badgeFloat.value = 0.5;
        dotPulse.value = 0.5;
        return;
      }
      barClocks.forEach((v, i) => {
        v.value = 0;
        v.value = withDelay(
          BAR_STAGGER_MS * i,
          withRepeat(
            withTiming(1, { duration: BAR_DURATION_MS, easing: Easing.inOut(Easing.cubic) }),
            -1,
            true,
          ),
        );
      });
      sparkProgress.value = withRepeat(
        withTiming(1, { duration: SPARK_DURATION_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        false,
      );
      progressSweep.value = withRepeat(
        withTiming(1, { duration: PROGRESS_DURATION_MS, easing: Easing.inOut(Easing.cubic) }),
        -1,
        false,
      );
      badgeFloat.value = withRepeat(
        withTiming(1, { duration: BADGE_DURATION_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      dotPulse.value = withRepeat(
        withTiming(1, { duration: CHIP_DOT_DURATION_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reduceMotion]);

    return (
      <View style={[styles.wrap, style]}>
        {/* Layer 1 — ambient orbs. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <AmbientOrb
            size={240}
            color={colors.lavender}
            baseOpacity={0.32}
            amplitude={32}
            durationMs={10000}
            phase={0.3}
            style={{ top: -50, right: -70 }}
          />
          <AmbientOrb
            size={260}
            color={colors.primary}
            baseOpacity={0.22}
            amplitude={36}
            durationMs={13000}
            style={{ bottom: -80, left: -90 }}
          />
        </View>

        {/* Layers 2-5 — chart cluster. */}
        <View style={styles.chartCluster}>
          <View style={styles.chartFrame}>
            {/* Spark trail + dot rendered above the bars. */}
            <View pointerEvents="none" style={styles.sparkTrack}>
              <SparkTrail colors={colors} />
              <Spark progress={sparkProgress} colors={colors} />
            </View>

            <View style={styles.chartRow}>
              {BAR_HEIGHTS.map((h, i) => (
                <Bar
                  key={i}
                  progress={barClocks[i]}
                  peakHeight={h}
                  colors={colors}
                  variant={i % 5 === 2 ? 'lavender' : i % 5 === 4 ? 'peach' : 'primary'}
                />
              ))}
            </View>

            {/* Baseline */}
            <View style={[styles.baseline, { backgroundColor: colors.cardBorderTransparent }]} />

            <Badge progress={badgeFloat} colors={colors} styles={styles} />
          </View>

          {/* Progress sweep sits under the chart, same width. */}
          <View style={[styles.progressTrack, { backgroundColor: colors.primaryLight }]}>
            <ProgressSweep progress={progressSweep} colors={colors} />
          </View>
        </View>

        {/* Layer 6 — copy. */}
        <View style={styles.copyBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {ctaLabel && onPressCta ? (
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
          ) : (
            <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
              <ChipDot progress={dotPulse} colors={colors} />
              <Text style={[styles.chipText, { color: colors.primaryDark }]}>
                {chipLabel ?? 'Learning your habits'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  },
);

EmptyInsights.displayName = 'EmptyInsights';

// ── Sub-pieces ────────────────────────────────────────────────────────────

interface BarProps {
  progress: SharedValue<number>;
  peakHeight: number;
  colors: ThemeColors;
  variant: 'primary' | 'lavender' | 'peach';
}

const Bar = React.memo(({ progress, peakHeight, colors, variant }: BarProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const sy = interpolate(progress.value, [0, 1], [0.4, 1]);
    // scaleY pivots from the centre by default, which makes the bar lift off
    // the baseline when scaled down. Counter-translate by half the missing
    // height so the bottom edge stays planted on the chart baseline.
    const ty = (peakHeight * (1 - sy)) / 2;
    const opacity = interpolate(progress.value, [0, 1], [0.5, 1]);
    return { transform: [{ translateY: ty }, { scaleY: sy }], opacity };
  });
  const palette =
    variant === 'lavender'
      ? [colors.lavender, colors.lavender]
      : variant === 'peach'
        ? [colors.peach, colors.peach]
        : [colors.primary, colors.primary];
  // Top of bar is opaque, fades 45% toward bottom — gives the bar the tapered
  // gradient look from the HTML mockup with one shader pass.
  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          height: peakHeight,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          overflow: 'hidden',
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={[palette[0], `${palette[1]}66`] as unknown as readonly [string, string]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

Bar.displayName = 'Bar';

interface SparkTrailProps {
  colors: ThemeColors;
}

const SparkTrail = React.memo(({ colors }: SparkTrailProps) => {
  // SVG line is cheaper than a flex of three coloured strips and stays sharp
  // at any scale.
  return (
    <Svg
      width={CHART_WIDTH}
      height={SPARK_TRACK_HEIGHT}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <SvgLine
        x1={4}
        y1={SPARK_TRACK_HEIGHT - 8}
        x2={CHART_WIDTH - 4}
        y2={SPARK_TRACK_HEIGHT - 8}
        stroke={colors.primary}
        strokeOpacity={0.18}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
});

SparkTrail.displayName = 'SparkTrail';

interface SparkProps {
  progress: SharedValue<number>;
  colors: ThemeColors;
}

const Spark = React.memo(({ progress, colors }: SparkProps) => {
  // Horizontal travels left → right; vertical traces an arc over the bars.
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const tx = interpolate(progress.value, [0, 1], [4, CHART_WIDTH - 12]);
    // Parabolic dip: peaks (most negative ty) at progress = 0.5
    const arc = -Math.sin(progress.value * Math.PI) * 18;
    // Fade in/out at the ends of the trace for a softer entry/exit.
    const opacity =
      progress.value < 0.1
        ? interpolate(progress.value, [0, 0.1], [0, 1])
        : progress.value > 0.9
          ? interpolate(progress.value, [0.9, 1], [1, 0])
          : 1;
    return {
      opacity,
      transform: [{ translateX: tx }, { translateY: arc }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: SPARK_TRACK_HEIGHT - 12,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.primary,
          shadowColor: colors.primary,
          shadowOpacity: 0.55,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        animatedStyle,
      ]}
    />
  );
});

Spark.displayName = 'Spark';

interface ProgressSweepProps {
  progress: SharedValue<number>;
  colors: ThemeColors;
}

const ProgressSweep = React.memo(({ progress, colors }: ProgressSweepProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const tx = interpolate(progress.value, [0, 1], [-CHART_WIDTH * 0.4, CHART_WIDTH]);
    return { transform: [{ translateX: tx }] };
  });
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        animatedStyle,
        { width: CHART_WIDTH * 0.4 },
      ]}
    >
      <LinearGradient
        colors={[
          'transparent',
          colors.primary,
          'transparent',
        ] as unknown as readonly [string, string, string]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

ProgressSweep.displayName = 'ProgressSweep';

interface BadgeProps {
  progress: SharedValue<number>;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

const Badge = React.memo(({ progress, colors, styles }: BadgeProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const ty = interpolate(progress.value, [0, 1], [0, -6]);
    return { transform: [{ translateY: ty }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.badge, animatedStyle]}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <SvgCircle cx="11" cy="11" r="7" stroke={colors.primary} strokeWidth={2} />
        <SvgLine x1="21" y1="21" x2="16.5" y2="16.5" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
        <SvgLine x1="11" y1="8" x2="11" y2="14" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
        <SvgLine x1="8" y1="11" x2="14" y2="11" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
});

Badge.displayName = 'Badge';

interface ChipDotProps {
  progress: SharedValue<number>;
  colors: ThemeColors;
}

const ChipDot = React.memo(({ progress, colors }: ChipDotProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const s = interpolate(progress.value, [0, 1], [1, 1.4]);
    const o = interpolate(progress.value, [0, 1], [1, 0.5]);
    return { transform: [{ scale: s }], opacity: o };
  });
  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.primary,
        },
        animatedStyle,
      ]}
    />
  );
});

ChipDot.displayName = 'ChipDot';

// ── Styles ────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      minHeight: 520,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 24,
      paddingBottom: 48,
    },
    chartCluster: {
      alignItems: 'center',
      marginBottom: 28,
    },
    chartFrame: {
      width: CHART_WIDTH,
      height: CHART_HEIGHT + SPARK_TRACK_HEIGHT,
      paddingTop: SPARK_TRACK_HEIGHT,
      position: 'relative',
    },
    sparkTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: SPARK_TRACK_HEIGHT,
    },
    chartRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: CHART_HEIGHT,
    },
    baseline: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 1,
    },
    badge: {
      position: 'absolute',
      top: SPARK_TRACK_HEIGHT - 18,
      right: -12,
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.cardBorderTransparent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#1E1E2E',
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    progressTrack: {
      width: CHART_WIDTH,
      height: 6,
      borderRadius: 999,
      marginTop: 14,
      overflow: 'hidden',
    },
    copyBlock: {
      alignItems: 'center',
      maxWidth: 340,
    },
    title: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 20,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      textAlign: 'center',
      marginBottom: 6,
    },
    body: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      textAlign: 'center',
      maxWidth: 300,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginTop: 18,
    },
    chipText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 999,
      marginTop: 20,
      shadowColor: '#5B8C6E',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    ctaText: {
      fontFamily: 'Nunito_700Bold',
      fontSize: 14,
      color: '#FFFFFF',
    },
  });
}
