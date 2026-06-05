/**
 * MiniSparkline — the forecast visual (FINO_CHATBOT_CARDS.md §4): the actual
 * spend pace so far (solid), a dashed continuation to the projected month-end
 * total, the projection dot, its 95% CI band, and an optional income reference
 * line. Bubble-sized; measures its own width via onLayout so it fits the
 * bubble without screen-math guessing.
 */

import React, { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Circle, Rect } from 'react-native-svg';
import type { ThemeColors } from '@/constants/theme';
import type { CardStatus } from '@/intelligence';
import { statusColor } from './palette';

const H = 88;
const PAD_T = 10;
const PAD_B = 10;
const PAD_L = 4;
const PAD_R = 10;

export function MiniSparkline({
  spent,
  projected,
  ciLow,
  ciHigh,
  income,
  daysElapsed,
  daysInMonth,
  status,
  colors,
}: {
  spent: number;
  projected: number;
  ciLow: number;
  ciHigh: number;
  income?: number;
  daysElapsed: number;
  daysInMonth: number;
  status: CardStatus;
  colors: ThemeColors;
}) {
  const [w, setW] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - w) > 1) setW(next);
  };

  const proj = statusColor(status, colors);
  const inner = w > 0 ? w : 0;
  const chartW = Math.max(0, inner - PAD_L - PAD_R);

  // Geometry only computed once we know the width.
  let body = null;
  if (inner > 0) {
    const totalDays = Math.max(2, daysInMonth);
    const elapsed = Math.min(Math.max(1, daysElapsed), totalDays);
    const yMax = Math.max(projected, ciHigh, income ?? 0, spent, 1) * 1.1;

    const dayToX = (day: number) =>
      PAD_L + ((day - 1) / (totalDays - 1)) * chartW;
    const valToY = (v: number) =>
      H - PAD_B - (Math.max(0, v) / yMax) * (H - PAD_T - PAD_B);

    const x0 = dayToX(1);
    const y0 = valToY(0);
    const xNow = dayToX(elapsed);
    const yNow = valToY(spent);
    const xEnd = dayToX(totalDays);
    const yProj = valToY(projected);

    body = (
      <Svg width={inner} height={H}>
        {/* Income reference line */}
        {income && income > 0 ? (
          <Line
            x1={PAD_L}
            y1={valToY(income)}
            x2={inner - PAD_R}
            y2={valToY(income)}
            stroke={colors.textSecondary}
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ) : null}

        {/* CI band on the projection */}
        <Rect
          x={xEnd - 3}
          y={valToY(ciHigh)}
          width={6}
          height={Math.max(2, valToY(ciLow) - valToY(ciHigh))}
          rx={3}
          fill={proj}
          fillOpacity={0.18}
        />

        {/* Actual pace so far (solid) */}
        <Line
          x1={x0}
          y1={y0}
          x2={xNow}
          y2={yNow}
          stroke={colors.primary}
          strokeWidth={2.4}
          strokeLinecap="round"
        />

        {/* Projected continuation (dashed) */}
        <Line
          x1={xNow}
          y1={yNow}
          x2={xEnd}
          y2={yProj}
          stroke={proj}
          strokeWidth={2}
          strokeDasharray="3 4"
          strokeLinecap="round"
        />

        {/* Today marker */}
        <Circle cx={xNow} cy={yNow} r={4} fill={colors.primary} />

        {/* Projection marker */}
        <Circle cx={xEnd} cy={yProj} r={5} fill={proj} />
        <Circle cx={xEnd} cy={yProj} r={2.4} fill={colors.white} />
      </Svg>
    );
  }

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: H, width: '100%' },
});
