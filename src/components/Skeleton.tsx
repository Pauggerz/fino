import React, { useEffect } from 'react';
import { ViewStyle, StyleSheet, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  style?: ViewStyle;
  borderRadius?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  style,
  borderRadius = 8,
}) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    // Creates a continuous smooth pulsing shimmer effect
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1, // Infinite loop
      true // Reverse sequence
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius },
        style,
        animatedStyle,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E1E1E1', // Neutral placeholder color
  },
});
