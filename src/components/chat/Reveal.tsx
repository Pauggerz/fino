/**
 * Reveal — a mount-time fade + rise (see docs/chat-timing-mockup.html). Wrap a
 * section or row and offset `delay` to make chat graphics "fade in one by one".
 *
 * When `animate` is false it renders its children fully visible with no
 * animation — so historical messages and the live proactive card stay static
 * and never replay their reveal on a re-render. The reveal plays once, on the
 * mount of the message that introduced it.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

/** Default fade duration for a single reveal unit. */
export const REVEAL_FADE_MS = 240;
/** Gap between consecutive staggered units (bars, sections, chips). */
export const REVEAL_STAGGER_MS = 85;

export function Reveal({
  children,
  animate = true,
  delay = 0,
  duration = REVEAL_FADE_MS,
  distance = 8,
  style,
}: {
  children: React.ReactNode;
  animate?: boolean;
  delay?: number;
  duration?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Start at the resting value when not animating so a static render is free.
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
