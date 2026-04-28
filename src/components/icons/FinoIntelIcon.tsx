import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  /** Primary color of the bars and the spark. */
  color?: string;
  /** Accepted for backward compatibility — no longer used. */
  accent?: string;
  /** Accepted for backward compatibility — no longer used. */
  filled?: boolean;
};

/**
 * Fino Intelligence brand mark.
 *
 * Three stacked bars of decreasing length (a "summary" / list-of-insights
 * motif) with a 4-point spark in the bottom-right corner — reads as
 * "AI-generated summary".
 */
export function FinoIntelIcon({
  size = 18,
  color = '#7A4AB8',
  // Accepted for backward compatibility with existing call sites.
  accent: _accent,
  filled: _filled,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Top bar — longest, deepest */}
      <Rect
        x={4}
        y={10}
        width={72}
        height={16}
        rx={8}
        fill={color}
        opacity={0.95}
      />
      {/* Middle bar */}
      <Rect
        x={4}
        y={38}
        width={52}
        height={16}
        rx={8}
        fill={color}
        opacity={0.55}
      />
      {/* Bottom bar — shortest, lightest */}
      <Rect
        x={4}
        y={66}
        width={28}
        height={16}
        rx={8}
        fill={color}
        opacity={0.22}
      />

      {/* 4-point spark — sharp tips with deeply concave sides.
          Control points sit on the center axis so each tip leaves the body
          along the radial direction, producing the elongated "twinkle"
          shape from the reference. Centered at (70, 72). */}
      <Path
        d="M 70 50
           C 70 68, 74 72, 92 72
           C 74 72, 70 76, 70 94
           C 70 76, 66 72, 48 72
           C 66 72, 70 68, 70 50 Z"
        fill={color}
        opacity={0.95}
      />
    </Svg>
  );
}

export default FinoIntelIcon;
