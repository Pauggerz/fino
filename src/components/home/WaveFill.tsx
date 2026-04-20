import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

export const TILE_W = 160;
export const TILE_H = 120;
// SVG must be wide enough that translating by -TILE_W never exposes a gap.
const WAVE_SVG_W = TILE_W * 4;

function makeWavePath(yBase: number, amp: number, tileH: number): string {
  const halfWl = TILE_W / 2;
  const numArcs = WAVE_SVG_W / halfWl + 2;
  let d = `M 0 ${yBase}`;
  for (let i = 0; i < numArcs; i++) {
    const x0 = i * halfWl;
    const xMid = x0 + halfWl / 2;
    const x1 = x0 + halfWl;
    const yPeak = i % 2 === 0 ? yBase - amp : yBase + amp;
    d += ` Q ${xMid} ${yPeak} ${x1} ${yBase}`;
  }
  d += ` L ${WAVE_SVG_W + halfWl} ${tileH} L 0 ${tileH} Z`;
  return d;
}

export function WaveFill({
  pct,
  color,
  tileHeight = TILE_H,
}: {
  pct: number;
  color: string;
  tileHeight?: number;
}) {
  const wave1X = useSharedValue(0);
  const wave2X = useSharedValue(0);

  const wave1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave1X.value }],
  }));
  const wave2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: wave2X.value }],
  }));

  useEffect(() => {
    wave1X.value = withRepeat(
      withTiming(-TILE_W, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
    wave2X.value = withRepeat(
      withTiming(-TILE_W, { duration: 4600, easing: Easing.linear }),
      -1,
      false
    );

    return () => {
      cancelAnimation(wave1X);
      cancelAnimation(wave2X);
      wave1X.value = 0;
      wave2X.value = 0;
    };
  }, [wave1X, wave2X]);

  const clampedPct = Math.min(Math.max(pct, 0), 1);
  const yBase = tileHeight - tileHeight * clampedPct;

  const waveStyle = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: WAVE_SVG_W,
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
    >
      <RAnim.View style={[waveStyle, wave2Style]}>
        <Svg width={WAVE_SVG_W} height={tileHeight}>
          <SvgPath
            d={makeWavePath(yBase + 6, 8, tileHeight)}
            fill={color}
            opacity={0.18}
          />
        </Svg>
      </RAnim.View>
      <RAnim.View style={[waveStyle, wave1Style]}>
        <Svg width={WAVE_SVG_W} height={tileHeight}>
          <SvgPath
            d={makeWavePath(yBase, 10, tileHeight)}
            fill={color}
            opacity={0.42}
          />
        </Svg>
      </RAnim.View>
    </View>
  );
}
