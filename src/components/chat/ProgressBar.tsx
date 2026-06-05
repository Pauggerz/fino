/**
 * ProgressBar — a value-against-limit track with an optional limit marker
 * (FINO_CHATBOT_CARDS.md §4). Used by coach reason rows (current vs baseline).
 * Colored by status; pure `View` widths.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ThemeColors } from '@/constants/theme';
import type { CardStatus } from '@/intelligence';
import { statusColor } from './palette';

export function ProgressBar({
  value,
  limit,
  status,
  colors,
  showMarker = true,
}: {
  value: number;
  limit: number;
  status: CardStatus;
  colors: ThemeColors;
  /** Draw a tick at the limit (the baseline the value is measured against). */
  showMarker?: boolean;
}) {
  const safeLimit = limit > 0 ? limit : 1;
  // Scale so the bar can overshoot the limit (which is the point of "over").
  const scaleMax = Math.max(value, safeLimit) * 1.02;
  const fillPct = Math.min(1, value / scaleMax);
  const markerPct = Math.min(1, safeLimit / scaleMax);
  const color = statusColor(status, colors);

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceSubdued }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: color, width: `${fillPct * 100}%` },
        ]}
      />
      {showMarker ? (
        <View
          style={[
            styles.marker,
            {
              left: `${markerPct * 100}%`,
              backgroundColor: colors.textSecondary,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  marker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
});
