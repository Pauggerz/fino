import React, { memo, useEffect } from 'react';
import { View, Text } from 'react-native';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const PEAK_AMBER = '#E07B2E';
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Runs height + opacity animation on the UI thread.
// Replaces Animated.View with useNativeDriver: false.
function AnimatedDowBar({
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
      style={[style, { width: 22, backgroundColor: barColor, borderRadius: 5 }]}
    />
  );
}

function AnimatedPeakLabel({ value }: { value: string }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 520 });
  }, [opacity, value]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <RAnim.Text
      style={[
        style,
        {
          fontFamily: 'DMMono_500Medium',
          fontSize: 8,
          color: PEAK_AMBER,
          marginBottom: 3,
        },
      ]}
    >
      {value}
    </RAnim.Text>
  );
}

interface DowPatternChartProps {
  dowAvg: number[];
  colors: any;
}

const DowPatternChart = memo(({ dowAvg, colors }: DowPatternChartProps) => {
  const maxDow = Math.max(...dowAvg, 1);
  const BAR_H_MAX = 48;
  const peakDow = dowAvg.indexOf(Math.max(...dowAvg));

  const formatAvg = (v: number): string => {
    if (v === 0) return '';
    if (v >= 1000) return `₱${(v / 1000).toFixed(1)}k`;
    return `₱${Math.round(v)}`;
  };

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          height: BAR_H_MAX + 32,
        }}
      >
        {DOW_LABELS.map((label, i) => {
          const pct = dowAvg[i] / maxDow;
          const barH = Math.max(pct * BAR_H_MAX, dowAvg[i] > 0 ? 3 : 2);
          const isWeekend = i >= 5;
          const isPeak = i === peakDow && dowAvg[i] > 0;
          const weekdayColor = isWeekend ? colors.lavender : colors.primary;
          const barColor = isPeak ? PEAK_AMBER : weekdayColor;
          const minH = dowAvg[i] > 0 ? 3 : 2;
          const barOpacity = dowAvg[i] === 0 ? 0.2 : 0.82;

          return (
            <View key={label} style={{ alignItems: 'center', flex: 1 }}>
              {isPeak && <AnimatedPeakLabel value={formatAvg(dowAvg[i])} />}
              <AnimatedDowBar
                targetH={barH}
                minH={minH}
                targetOpacity={barOpacity}
                barColor={barColor}
              />
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 9,
                  color: isPeak ? PEAK_AMBER : colors.textSecondary,
                  marginTop: 5,
                }}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: colors.primary,
            }}
          />
          <Text
            style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 10,
              color: colors.textSecondary,
            }}
          >
            Weekday
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: colors.lavender,
            }}
          />
          <Text
            style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 10,
              color: colors.textSecondary,
            }}
          >
            Weekend
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: PEAK_AMBER,
            }}
          />
          <Text
            style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 10,
              color: colors.textSecondary,
            }}
          >
            Peak day
          </Text>
        </View>
      </View>
    </View>
  );
});

export default DowPatternChart;
