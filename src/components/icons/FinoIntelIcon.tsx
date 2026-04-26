import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type Props = {
  size?: number;
  /** Primary color of the main spark. */
  color?: string;
  /** Color of the accent discs. Defaults to a soft lavender. */
  accent?: string;
  /** When true, fills the main spark with a subtle vertical gradient. */
  filled?: boolean;
};

/**
 * Fino Intelligence brand mark.
 *
 * A large 4-point spark with two orbiting accent discs (each holding a
 * smaller spark) and a third tiny node — reads as a constellation of
 * insight around the central spark.
 */
export function FinoIntelIcon({
  size = 18,
  color = '#7A4AB8',
  accent = '#D8C3F9',
  filled = false,
}: Props) {
  const fillId = `fino-intel-grad-${color.replace('#', '')}`;
  const sparkFill = filled ? `url(#${fillId})` : color;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {filled ? (
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={color} stopOpacity={0.6} />
          </LinearGradient>
        </Defs>
      ) : null}

      {/* Main 4-point spark — concave-sided diamond */}
      <Path
        d="M 50 4
           C 52 28, 58 42, 96 50
           C 58 58, 52 72, 50 96
           C 48 72, 42 58, 4 50
           C 42 42, 48 28, 50 4 Z"
        fill={sparkFill}
      />

      {/* Top-right accent disc with inner spark */}
      <Circle cx={68} cy={30} r={17} fill={accent} />
      <Path
        d="M 68 19
           C 68.7 26, 71 28.3, 78 29
           C 71 29.7, 68.7 32, 68 39
           C 67.3 32, 65 29.7, 58 29
           C 65 28.3, 67.3 26, 68 19 Z"
        fill={sparkFill}
      />

      {/* Mid-left smaller disc with tiny spark */}
      <Circle cx={36} cy={66} r={8} fill={accent} />
      <Path
        d="M 36 61
           C 36.3 64.5, 37.5 65.7, 41 66
           C 37.5 66.3, 36.3 67.5, 36 71
           C 35.7 67.5, 34.5 66.3, 31 66
           C 34.5 65.7, 35.7 64.5, 36 61 Z"
        fill={sparkFill}
      />

      {/* Bottom-right tiny accent node */}
      <Circle cx={62} cy={80} r={3.8} fill={accent} />
      <Path
        d="M 62 77.7
           C 62.15 79.3, 62.7 79.85, 64.3 80
           C 62.7 80.15, 62.15 80.7, 62 82.3
           C 61.85 80.7, 61.3 80.15, 59.7 80
           C 61.3 79.85, 61.85 79.3, 62 77.7 Z"
        fill={sparkFill}
      />
    </Svg>
  );
}

export default FinoIntelIcon;
