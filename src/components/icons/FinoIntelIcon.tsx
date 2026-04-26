import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type Props = {
  size?: number;
  /** Primary color of the spark/diamond outline. */
  color?: string;
  /** Optional accent for the inner core. Falls back to color at lower opacity. */
  accent?: string;
  /** When true, adds a subtle gradient fill (for hero placements). */
  filled?: boolean;
};

/**
 * Fino Intelligence brand mark.
 *
 * Geometry: a 4-point spark (diamond with concave sides) with a small
 * orbiting node — reads as both "spark of insight" and a stylized F.
 * Designed at a 24×24 canvas; scale via `size`.
 */
export function FinoIntelIcon({
  size = 18,
  color = '#7A4AB8',
  accent,
  filled = false,
}: Props) {
  const fillId = `fino-intel-grad-${color.replace('#', '')}`;
  const innerColor = accent ?? color;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {filled ? (
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={innerColor} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
      ) : null}

      {/* Main 4-point spark with concave sides */}
      <Path
        d="M12 1.5
           C 12.6 6.4, 14.8 8.6, 19.7 9.2
           C 17.2 9.6, 14.8 11.4, 13.6 13.6
           C 14.8 16.5, 16.2 18.0, 18.5 19.0
           C 14.4 18.6, 12.6 20.3, 12 22.5
           C 11.4 20.3, 9.6 18.6, 5.5 19.0
           C 7.8 18.0, 9.2 16.5, 10.4 13.6
           C 9.2 11.4, 6.8 9.6, 4.3 9.2
           C 9.2 8.6, 11.4 6.4, 12 1.5 Z"
        fill={filled ? `url(#${fillId})` : color}
      />

      {/* Inner core — small high-contrast highlight */}
      <Circle cx={12} cy={12} r={1.6} fill="#FFFFFF" fillOpacity={0.85} />

      {/* Orbiting node — gives the mark personality */}
      <Circle cx={19.5} cy={4.5} r={1.6} fill={innerColor} />
    </Svg>
  );
}

export default FinoIntelIcon;
