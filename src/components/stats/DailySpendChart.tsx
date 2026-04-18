import React, { memo, useEffect } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Text as SvgText } from 'react-native-svg';

export const PEAK_AMBER = '#E07B2E';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Runs its height + opacity animation entirely on the UI thread via Reanimated.
// Replaces the legacy AnimatedRect approach which required useNativeDriver: false.
function AnimatedBar({
  targetH,
  minH,
  barW,
  barColor,
  targetOpacity,
}: {
  targetH: number;
  minH: number;
  barW: number;
  barColor: string;
  targetOpacity: number;
}) {
  const height = useSharedValue(minH);
  const opacity = useSharedValue(0.16);

  useEffect(() => {
    height.value = withTiming(targetH, { duration: 560 });
    opacity.value = withTiming(targetOpacity, { duration: 560 });
  }, [height, opacity, targetH, targetOpacity]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  return (
    <RAnim.View
      style={[
        style,
        { width: barW, backgroundColor: barColor, borderRadius: 1.5 },
      ]}
    />
  );
}

interface DailySpendChartProps {
  data: { day: number; amount: number }[];
  maxAmount: number;
  colors: any;
}

const DailySpendChart = memo(
  ({ data, maxAmount, colors }: DailySpendChartProps) => {
    const Y_LABEL_W = 34;
    const PADDING = 16;
    const CHART_W = SCREEN_WIDTH - 32 - PADDING * 2 - Y_LABEL_W;
    const CHART_H = 80;
    const BAR_GAP = 2;
    const barCount = data.length;
    const BAR_W = Math.max(2, (CHART_W - BAR_GAP * (barCount - 1)) / barCount);

    const peakIndex = data.reduce(
      (best, d, i) => (d.amount > data[best].amount ? i : best),
      0
    );

    const formatYLabel = (value: number): string => {
      if (value === 0) return '₱0';
      if (value >= 1000)
        return `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
      return `₱${Math.round(value)}`;
    };

    const ySteps = [
      { id: 'max', label: formatYLabel(maxAmount), y: 4 },
      { id: 'mid', label: formatYLabel(maxAmount / 2), y: CHART_H / 2 + 4 },
      { id: 'zero', label: '₱0', y: CHART_H },
    ];

    const totalW = Y_LABEL_W + CHART_W;

    return (
      <View style={{ width: totalW, height: CHART_H + 14 }}>
        {/* Static SVG: y-axis labels and gridlines — no animated elements on JS thread */}
        <Svg
          width={totalW}
          height={CHART_H + 14}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {ySteps.map((step) => (
            <SvgText
              key={step.id}
              x={Y_LABEL_W - 4}
              y={step.y}
              fontSize={8}
              fill={colors.textSecondary}
              fillOpacity={0.5}
              textAnchor="end"
              fontWeight="500"
            >
              {step.label}
            </SvgText>
          ))}
          {[0.25, 0.5, 0.75, 1].map((pct) => {
            const y = CHART_H - CHART_H * pct;
            return (
              <Line
                key={pct}
                x1={Y_LABEL_W}
                y1={y}
                x2={Y_LABEL_W + CHART_W}
                y2={y}
                stroke={colors.textSecondary}
                strokeOpacity={0.1}
                strokeWidth={1}
              />
            );
          })}
        </Svg>

        {/* Animated bar layer: runs entirely on the UI thread */}
        <View
          style={{
            position: 'absolute',
            left: Y_LABEL_W,
            top: 0,
            width: CHART_W,
            height: CHART_H,
            flexDirection: 'row',
            alignItems: 'flex-end',
          }}
        >
          {data.map((d, i) => {
            const barH = maxAmount > 0 ? (d.amount / maxAmount) * CHART_H : 0;
            const minH = d.amount > 0 ? 2 : 1;
            const targetH = Math.max(barH, minH);
            const isPeak = i === peakIndex && d.amount > 0;
            const barColor = isPeak ? PEAK_AMBER : colors.primary;
            const peakOpacity = isPeak ? 1 : 0.6;
            const opacity = d.amount === 0 ? 0.15 : peakOpacity;

            return (
              <View
                key={d.day}
                style={{
                  width: BAR_W,
                  height: CHART_H,
                  marginRight: i < data.length - 1 ? BAR_GAP : 0,
                  justifyContent: 'flex-end',
                }}
              >
                <AnimatedBar
                  targetH={targetH}
                  minH={minH}
                  barW={BAR_W}
                  barColor={barColor}
                  targetOpacity={opacity}
                />
              </View>
            );
          })}
        </View>

        {/* Day number labels row — static, no animation needed */}
        <View
          style={{
            position: 'absolute',
            left: Y_LABEL_W,
            top: CHART_H + 2,
            width: CHART_W,
            height: 12,
            flexDirection: 'row',
          }}
        >
          {data.map((d, i) => {
            const isPeak = i === peakIndex && d.amount > 0;
            const showLabel = d.day % 2 === 1 || isPeak;
            return (
              <View
                key={d.day}
                style={{
                  width: BAR_W,
                  marginRight: i < data.length - 1 ? BAR_GAP : 0,
                  alignItems: 'center',
                }}
              >
                {showLabel && (
                  <Text
                    style={{
                      fontSize: 8,
                      fontFamily: 'Inter_600SemiBold',
                      color: isPeak ? PEAK_AMBER : colors.textSecondary,
                    }}
                  >
                    {d.day}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  }
);

export default DailySpendChart;
