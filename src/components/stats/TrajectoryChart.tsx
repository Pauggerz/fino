import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Polyline,
  Line,
  Circle,
  Path,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import fmtPeso from '@/utils/format';
import DailySpendChart from './DailySpendChart';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;

export function TrajectoryChart({
  cumulative,
  budget,
  daysInMonth,
  daysElapsed,
  dailyData,
  dailyMax,
  isCurrentMonth,
}: {
  cumulative: number[];
  budget: number;
  daysInMonth: number;
  daysElapsed: number;
  dailyData: { day: number; amount: number }[];
  dailyMax: number;
  isCurrentMonth: boolean;
}) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Layout
  const padX = 32;
  const padTop = 14;
  const padBottom = 22;
  const innerW = SCREEN_W - 32 - 36; // screen padding (16*2) + card padding (~18*2)
  const W = Math.max(280, innerW);
  const H = 170;
  const chartLeft = 36;
  const chartRight = W - 8;
  const chartTop = padTop;
  const chartBottom = H - padBottom;

  const todaySpent = cumulative[Math.min(daysElapsed, cumulative.length) - 1] ?? 0;
  const budgetCap = Math.max(budget, todaySpent * 1.05);
  const yMax = budgetCap || 1;

  const dayToX = (day: number) =>
    chartLeft + ((day - 1) / Math.max(1, daysInMonth - 1)) * (chartRight - chartLeft);
  const valueToY = (v: number) =>
    chartBottom - (v / yMax) * (chartBottom - chartTop);

  const points = cumulative
    .slice(0, daysElapsed)
    .map((v, i) => `${dayToX(i + 1).toFixed(2)},${valueToY(v).toFixed(2)}`)
    .join(' ');

  const safePaceEnd = { x: dayToX(daysInMonth), y: valueToY(budget) };
  const safePaceStart = { x: dayToX(1), y: valueToY(0) };

  const lastIdx = Math.max(0, daysElapsed - 1);
  const lastX = dayToX(lastIdx + 1);
  const lastY = valueToY(todaySpent);

  // Forecast
  const projected = daysElapsed > 0 ? (todaySpent / daysElapsed) * daysInMonth : 0;
  const delta = budget - projected;
  const onTrack = delta >= 0;

  const yLabels = [
    { v: yMax, lbl: shortPeso(yMax) },
    { v: yMax * 0.66, lbl: shortPeso(yMax * 0.66) },
    { v: yMax * 0.33, lbl: shortPeso(yMax * 0.33) },
    { v: 0, lbl: '₱0' },
  ];

  const xTicks = pickXTicks(daysInMonth);

  // Build filled area under actual line
  const areaPath =
    daysElapsed > 1
      ? `M ${dayToX(1)} ${chartBottom} ` +
        cumulative
          .slice(0, daysElapsed)
          .map(
            (v, i) =>
              `L ${dayToX(i + 1).toFixed(2)} ${valueToY(v).toFixed(2)}`
          )
          .join(' ') +
        ` L ${lastX.toFixed(2)} ${chartBottom} Z`
      : null;

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.white,
          borderColor: colors.cardBorderTransparent,
        },
      ]}
    >
      {/* Head */}
      <View style={styles.headRow}>
        <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
          SPENDING TRAJECTORY
        </Text>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: onTrack
                ? colors.onTrackBg1
                : colors.coralLight,
            },
          ]}
        >
          <Text
            style={[
              styles.pillText,
              { color: onTrack ? colors.incomeGreen : colors.expenseRed },
            ]}
          >
            {onTrack ? 'on track' : 'over pace'}
          </Text>
        </View>
      </View>

      {/* Forecast callout */}
      {budget > 0 && isCurrentMonth ? (
        <View
          style={[
            styles.callout,
            {
              backgroundColor: onTrack
                ? colors.onTrackBg1
                : colors.coralLight,
            },
          ]}
        >
          <View
            style={[
              styles.calloutDot,
              {
                backgroundColor: onTrack
                  ? colors.incomeGreen
                  : colors.expenseRed,
              },
            ]}
          />
          <Text style={[styles.calloutText, { color: colors.textPrimary }]}>
            At this pace, you'll finish{' '}
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                color: onTrack ? colors.incomeGreen : colors.expenseRed,
              }}
            >
              {fmtPeso(Math.abs(delta))} {onTrack ? 'under' : 'over'} budget
            </Text>{' '}
            — pacing for {fmtPeso(projected)} of your {fmtPeso(budget)} cap.
          </Text>
        </View>
      ) : null}

      {/* Chart */}
      <Svg width={W} height={H}>
        {/* Y axis labels + grid */}
        {yLabels.map((y, i) => (
          <React.Fragment key={`y-${i}`}>
            <SvgText
              x={chartLeft - 4}
              y={valueToY(y.v) + 3}
              fontFamily="DMMono_500Medium"
              fontSize={9}
              fill={colors.textSecondary}
              fillOpacity={0.55}
              textAnchor="end"
            >
              {y.lbl}
            </SvgText>
            <Line
              x1={chartLeft}
              y1={valueToY(y.v)}
              x2={chartRight}
              y2={valueToY(y.v)}
              stroke={colors.textSecondary}
              strokeOpacity={0.1}
              strokeDasharray="2 3"
            />
          </React.Fragment>
        ))}

        {/* Safe pace line */}
        {budget > 0 ? (
          <Line
            x1={safePaceStart.x}
            y1={safePaceStart.y}
            x2={safePaceEnd.x}
            y2={safePaceEnd.y}
            stroke={colors.textSecondary}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="3 4"
          />
        ) : null}

        {/* Actual area */}
        {areaPath ? (
          <Path
            d={areaPath}
            fill={colors.primary}
            fillOpacity={isDark ? 0.18 : 0.12}
          />
        ) : null}

        {/* Actual line */}
        {daysElapsed > 1 ? (
          <Polyline
            points={points}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Today marker */}
        {daysElapsed > 0 ? (
          <>
            <Circle cx={lastX} cy={lastY} r={6} fill={colors.primary} />
            <Circle cx={lastX} cy={lastY} r={3} fill={colors.white} />
          </>
        ) : null}

        {/* X axis ticks */}
        {xTicks.map((d) => (
          <SvgText
            key={`x-${d}`}
            x={dayToX(d)}
            y={H - 6}
            fontFamily="Inter_500Medium"
            fontSize={9}
            fill={colors.textSecondary}
            fillOpacity={0.6}
            textAnchor="middle"
          >
            {d}
          </SvgText>
        ))}
      </Svg>

      {/* Drill toggle */}
      <Pressable
        onPress={handleToggle}
        style={[
          styles.drillToggle,
          { borderTopColor: colors.border },
        ]}
      >
        <Text style={[styles.drillToggleText, { color: colors.primary }]}>
          {expanded ? 'Hide daily breakdown' : 'View daily breakdown'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.primary}
        />
      </Pressable>

      {expanded ? (
        <View style={{ marginTop: 6 }}>
          <DailySpendChart
            data={dailyData}
            maxAmount={dailyMax}
            colors={colors}
          />
        </View>
      ) : null}
    </View>
  );
}

function shortPeso(v: number): string {
  if (v <= 0) return '₱0';
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `₱${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `₱${Math.round(v)}`;
}

function pickXTicks(daysInMonth: number): number[] {
  if (daysInMonth <= 7) return [1, daysInMonth];
  return [1, Math.round(daysInMonth * 0.25), Math.round(daysInMonth * 0.5), Math.round(daysInMonth * 0.75), daysInMonth];
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  callout: {
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  calloutDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6,
  },
  calloutText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  drillToggle: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drillToggleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
