import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Soft drifting orb used as ambient background motion in empty states.
 *
 * The HTML reference uses CSS `filter: blur(40px)`, which has no native RN
 * equivalent that pays for itself at this size. We approximate the look by
 * stacking three concentric translucent circles — outermost largest, lowest
 * opacity — so the edge fades organically without any blur shader.
 *
 * All motion lives in a single shared value transformed on the UI thread.
 * No bridge crossings per frame.
 */
export interface AmbientOrbProps {
  size: number;
  color: string;
  /** Maximum drift in either axis. The orb oscillates ±amplitude/2. */
  amplitude?: number;
  /** Loop duration in ms. */
  durationMs?: number;
  /** Phase offset 0..1 to desync sibling orbs. */
  phase?: number;
  baseOpacity?: number;
  style?: ViewStyle;
}

export const AmbientOrb: React.FC<AmbientOrbProps> = React.memo(
  ({ size, color, amplitude = 36, durationMs = 11000, phase = 0, baseOpacity = 0.32, style }) => {
    const reduceMotion = useReducedMotion();
    const t = useSharedValue(phase);

    useEffect(() => {
      if (reduceMotion) {
        t.value = 0.5;
        return;
      }
      // 0 → 1 linear progression, reversed via withRepeat(true) so we get a
      // smooth back-and-forth without two separate timing calls.
      t.value = phase;
      t.value = withRepeat(
        withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    }, [reduceMotion, durationMs, phase, t]);

    const animatedStyle = useAnimatedStyle(() => {
      // Map progression to a small Lissajous-ish drift so x and y feel
      // organic rather than locked-step.
      const tx = (t.value - 0.5) * amplitude;
      const ty = Math.sin(t.value * Math.PI * 2) * (amplitude * 0.6);
      const scale = 1 + Math.sin(t.value * Math.PI) * 0.06;
      return { transform: [{ translateX: tx }, { translateY: ty }, { scale }] };
    });

    // Three stacked circles fake the radial fade. Sizes/opacities tuned so
    // the visible edge falls off smoothly.
    const inner = size * 0.55;
    const mid = size * 0.78;

    const circles = useMemo(
      () => [
        { d: size, o: baseOpacity * 0.35 },
        { d: mid, o: baseOpacity * 0.6 },
        { d: inner, o: baseOpacity },
      ],
      [size, mid, inner, baseOpacity],
    );

    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.orbWrap, { width: size, height: size }, animatedStyle, style]}
      >
        {circles.map((c, i) => (
          <View
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            style={{
              position: 'absolute',
              left: (size - c.d) / 2,
              top: (size - c.d) / 2,
              width: c.d,
              height: c.d,
              borderRadius: c.d / 2,
              backgroundColor: color,
              opacity: c.o,
            }}
          />
        ))}
      </Animated.View>
    );
  },
);

AmbientOrb.displayName = 'AmbientOrb';

const styles = StyleSheet.create({
  orbWrap: {
    position: 'absolute',
  },
});
