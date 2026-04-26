import React, { memo, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const PEAK_AMBER = '#E07B2E';

export type TimeBucket = {
  key: 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  range: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const BUCKETS: TimeBucket[] = [
  { key: 'morning', label: 'Morning', range: '5–12', icon: 'sunny-outline' },
  { key: 'afternoon', label: 'Afternoon', range: '12–17', icon: 'partly-sunny-outline' },
  { key: 'evening', label: 'Evening', range: '17–21', icon: 'cafe-outline' },
  { key: 'night', label: 'Night', range: '21–5', icon: 'moon-outline' },
];

function AnimatedTodBar({
  targetH,
  minH,
  targetOpacity,
  barColor,
}: {
  targetH: number;
  minH: number;
  targetOpacity: number;
  barColor: string;
}) {
  const height = useSharedValue(minH);
  const opacity = useSharedValue(0.15);

  useEffect(() => {
    height.value = withTiming(targetH, { duration: 520 });
    opacity.value = withTiming(targetOpacity, { duration: 520 });
  }, [height, opacity, targetH, targetOpacity]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  return (
    <RAnim.View
      style={[
        style,
        { width: 28, backgroundColor: barColor, borderRadius: 6 },
      ]}
    />
  );
}

interface TimeOfDayChartProps {
  // Total spend in each bucket (₱). Length must be 4.
  todTotals: number[];
  // Transaction counts per bucket. Length must be 4.
  todCounts: number[];
  colors: any;
}

const TimeOfDayChart = memo(
  ({ todTotals, todCounts, colors }: TimeOfDayChartProps) => {
    const max = Math.max(...todTotals, 1);
    const BAR_H_MAX = 64;
    const peakIdx = todTotals.indexOf(Math.max(...todTotals));
    const totalSpend = todTotals.reduce((s, v) => s + v, 0);

    return (
      <View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            height: BAR_H_MAX + 12,
          }}
        >
          {BUCKETS.map((b, i) => {
            const value = todTotals[i] ?? 0;
            const pct = value / max;
            const barH = Math.max(pct * BAR_H_MAX, value > 0 ? 4 : 3);
            const isPeak = i === peakIdx && value > 0;
            const barColor = isPeak ? PEAK_AMBER : colors.primary;
            const minH = value > 0 ? 4 : 3;
            const barOpacity = value === 0 ? 0.18 : 0.85;

            return (
              <View key={b.key} style={{ alignItems: 'center', flex: 1 }}>
                <AnimatedTodBar
                  targetH={barH}
                  minH={minH}
                  targetOpacity={barOpacity}
                  barColor={barColor}
                />
              </View>
            );
          })}
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          {BUCKETS.map((b, i) => {
            const value = todTotals[i] ?? 0;
            const count = todCounts[i] ?? 0;
            const isPeak = i === peakIdx && value > 0;
            const share =
              totalSpend > 0 ? Math.round((value / totalSpend) * 100) : 0;
            return (
              <View
                key={`label-${b.key}`}
                style={{ alignItems: 'center', flex: 1, gap: 2 }}
              >
                <Ionicons
                  name={b.icon}
                  size={14}
                  color={isPeak ? PEAK_AMBER : colors.textSecondary}
                />
                <Text
                  style={{
                    fontFamily: 'Inter_700Bold',
                    fontSize: 10,
                    color: isPeak ? PEAK_AMBER : colors.textPrimary,
                  }}
                >
                  {b.label}
                </Text>
                <Text
                  style={{
                    fontFamily: 'DMMono_500Medium',
                    fontSize: 9,
                    color: colors.textSecondary,
                  }}
                >
                  {b.range}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Inter_500Medium',
                    fontSize: 9,
                    color: colors.textSecondary,
                  }}
                >
                  {count} · {share}%
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
);

TimeOfDayChart.displayName = 'TimeOfDayChart';

export default TimeOfDayChart;
