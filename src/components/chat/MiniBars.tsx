/**
 * MiniBars — bubble-sized horizontal bars for a spending breakdown
 * (FINO_CHATBOT_CARDS.md §4). Pure `View` widths, no chart lib. Each row is a
 * category label, a proportional colored track, and the ₱ amount.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import type { ThemeColors } from '@/constants/theme';
import type { BreakdownSegment } from '@/intelligence';
import { roleColor, peso } from './palette';
import { REVEAL_STAGGER_MS } from './Reveal';

/** One breakdown row. Fades + rises on mount (offset by `delay`) so the bars
 *  assemble one by one; static when `animate` is false. */
function MiniBarRow({
  seg,
  max,
  colors,
  animate,
  delay,
}: {
  seg: BreakdownSegment;
  max: number;
  colors: ThemeColors;
  animate: boolean;
  delay: number;
}) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);

  const fill = Math.max(0.06, seg.amount / max); // floor so tiny bars stay visible
  const color = roleColor(seg.role);

  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text
        style={[styles.label, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {seg.label}
      </Text>
      <View style={styles.barCol}>
        <View
          style={[styles.track, { backgroundColor: colors.surfaceSubdued }]}
        >
          <View
            style={[
              styles.fill,
              { backgroundColor: color, width: `${fill * 100}%` },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.amount, { color: colors.textPrimary }]}>
        {peso(seg.amount)}
      </Text>
    </Animated.View>
  );
}

export function MiniBars({
  segments,
  colors,
  animate = false,
  baseDelay = 0,
}: {
  segments: BreakdownSegment[];
  colors: ThemeColors;
  /** Stagger the rows in on mount (set for a freshly-sent reply). */
  animate?: boolean;
  /** Delay (ms) before the first row reveals; each subsequent row +stagger. */
  baseDelay?: number;
}) {
  const max = segments.reduce((m, s) => Math.max(m, s.amount), 0) || 1;

  return (
    <View style={styles.wrap}>
      {segments.map((seg, i) => (
        <MiniBarRow
          key={`${seg.role}-${seg.label}`}
          seg={seg}
          max={max}
          colors={colors}
          animate={animate}
          delay={baseDelay + i * REVEAL_STAGGER_MS}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    width: 76,
  },
  barCol: { flex: 1 },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: 999 },
  amount: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 12,
    minWidth: 64,
    textAlign: 'right',
  },
});
