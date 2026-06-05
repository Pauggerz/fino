/**
 * DeltaChip — a tiny ▲/▼ percent pill for period-over-period spend changes
 * (FINO_CHATBOT_CARDS.md §4). For spending, up is concerning (negative token),
 * down is good (positive token), flat is neutral.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/constants/theme';
import type { DeltaDirection } from '@/intelligence';

export function DeltaChip({
  pct,
  direction,
  colors,
}: {
  /** Absolute percent change, ≥ 0. */
  pct: number;
  direction: DeltaDirection;
  colors: ThemeColors;
}) {
  const color =
    direction === 'up'
      ? colors.expenseRed
      : direction === 'down'
        ? colors.incomeGreen
        : colors.textSecondary;
  const icon =
    direction === 'up'
      ? 'arrow-up'
      : direction === 'down'
        ? 'arrow-down'
        : 'remove';
  const bg =
    direction === 'up'
      ? colors.coralLight
      : direction === 'down'
        ? colors.onTrackBg1
        : colors.surfaceSubdued;

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Ionicons name={icon as 'arrow-up'} size={11} color={color} />
      <Text style={[styles.text, { color }]}>{Math.round(pct)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  text: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 11,
  },
});
