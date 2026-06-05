/**
 * MiniBars — bubble-sized horizontal bars for a spending breakdown
 * (FINO_CHATBOT_CARDS.md §4). Pure `View` widths, no chart lib. Each row is a
 * category label, a proportional colored track, and the ₱ amount.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ThemeColors } from '@/constants/theme';
import type { BreakdownSegment } from '@/intelligence';
import { roleColor, peso } from './palette';

export function MiniBars({
  segments,
  colors,
}: {
  segments: BreakdownSegment[];
  colors: ThemeColors;
}) {
  const max = segments.reduce((m, s) => Math.max(m, s.amount), 0) || 1;

  return (
    <View style={styles.wrap}>
      {segments.map((seg) => {
        const fill = Math.max(0.06, seg.amount / max); // floor so tiny bars stay visible
        const color = roleColor(seg.role);
        return (
          <View key={`${seg.role}-${seg.label}`} style={styles.row}>
            <Text
              style={[styles.label, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
            <View style={styles.barCol}>
              <View
                style={[
                  styles.track,
                  { backgroundColor: colors.surfaceSubdued },
                ]}
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
          </View>
        );
      })}
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
