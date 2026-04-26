import React from 'react';
import Svg, {
  Path,
  Circle,
  Rect,
  Polyline,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';

export type FinoIntelVariantProps = {
  size?: number;
  color?: string;
  accent?: string;
  filled?: boolean;
};

/**
 * Variant A — Monogram F-Spark.
 * Bold geometric "F" letterform; the top arm tapers into a small spark.
 * Strongest direct brand link (literally "F" for Fino). Reads cleanly at 12px.
 */
export function FinoIconA({
  size = 18,
  color = '#7A4AB8',
  accent,
}: FinoIntelVariantProps) {
  const sparkColor = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Vertical stem */}
      <Rect x={5.5} y={3} width={3} height={18} rx={1.4} fill={color} />
      {/* Top arm */}
      <Rect x={5.5} y={3} width={11.5} height={3} rx={1.4} fill={color} />
      {/* Mid arm */}
      <Rect x={5.5} y={11} width={8} height={2.6} rx={1.2} fill={color} />
      {/* Spark — top-right of the F, replaces the arm tip */}
      <Path
        d="M19.5 2 L20.5 4.5 L23 5.5 L20.5 6.5 L19.5 9 L18.5 6.5 L16 5.5 L18.5 4.5 Z"
        fill={sparkColor}
      />
    </Svg>
  );
}

/**
 * Variant B — Orbital Atom.
 * Central core with two small nodes on elliptical orbits. Reads as
 * "intelligent agent / active processing." Distinctive silhouette.
 */
export function FinoIconB({
  size = 18,
  color = '#7A4AB8',
  accent,
  filled = false,
}: FinoIntelVariantProps) {
  const orbitColor = filled ? color : color;
  const nodeColor = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Two crossed elliptical orbits */}
      <Path
        d="M12 4 C 5 8, 5 16, 12 20 C 19 16, 19 8, 12 4 Z"
        stroke={orbitColor}
        strokeWidth={1.4}
        fill="none"
        opacity={0.55}
      />
      <Path
        d="M4 12 C 8 5, 16 5, 20 12 C 16 19, 8 19, 4 12 Z"
        stroke={orbitColor}
        strokeWidth={1.4}
        fill="none"
        opacity={0.55}
      />
      {/* Core */}
      <Circle cx={12} cy={12} r={3} fill={color} />
      <Circle cx={12} cy={12} r={1.2} fill="#FFFFFF" fillOpacity={0.9} />
      {/* Orbiting nodes */}
      <Circle cx={20} cy={12} r={1.5} fill={nodeColor} />
      <Circle cx={6.5} cy={6.5} r={1.2} fill={nodeColor} />
    </Svg>
  );
}

/**
 * Variant C — Sparkle Constellation.
 * One primary 4-point spark plus two smaller satellite sparkles.
 * Universal "AI / generative" iconography (Gemini / Apple Intelligence vibe).
 * Most familiar to users who have seen modern AI products.
 */
export function FinoIconC({
  size = 18,
  color = '#7A4AB8',
  accent,
}: FinoIntelVariantProps) {
  const small = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Primary spark — large 4-point */}
      <Path
        d="M11 5
           C 11.5 9, 13 10.5, 17 11
           C 13 11.5, 11.5 13, 11 17
           C 10.5 13, 9 11.5, 5 11
           C 9 10.5, 10.5 9, 11 5 Z"
        fill={color}
      />
      {/* Satellite spark — top-right */}
      <Path
        d="M19 3 L19.6 5.4 L22 6 L19.6 6.6 L19 9 L18.4 6.6 L16 6 L18.4 5.4 Z"
        fill={small}
      />
      {/* Satellite spark — bottom-right */}
      <Path
        d="M18 17 L18.5 19 L20.5 19.5 L18.5 20 L18 22 L17.5 20 L15.5 19.5 L17.5 19 Z"
        fill={small}
        opacity={0.85}
      />
    </Svg>
  );
}

/**
 * Variant D — Faceted Diamond.
 * Pure diamond outline with internal facet lines + a high-contrast core.
 * Reads as "gem of insight / precision." Geometric and trustworthy.
 */
export function FinoIconD({
  size = 18,
  color = '#7A4AB8',
  accent,
  filled = false,
}: FinoIntelVariantProps) {
  const fillId = `fino-d-grad-${color.replace('#', '')}`;
  const inner = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {filled ? (
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={inner} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
      ) : null}
      {/* Outer diamond */}
      <Path
        d="M12 2 L21 9 L12 22 L3 9 Z"
        fill={filled ? `url(#${fillId})` : color}
      />
      {/* Top facet line */}
      <Line
        x1={3}
        y1={9}
        x2={21}
        y2={9}
        stroke="#FFFFFF"
        strokeOpacity={0.55}
        strokeWidth={1}
      />
      {/* Inner facet vertices */}
      <Line
        x1={12}
        y1={2}
        x2={12}
        y2={9}
        stroke="#FFFFFF"
        strokeOpacity={0.45}
        strokeWidth={0.9}
      />
      {/* Center highlight */}
      <Circle cx={12} cy={9} r={1.6} fill="#FFFFFF" fillOpacity={0.85} />
    </Svg>
  );
}

/**
 * Variant E — Pulse Spark.
 * An ECG-style waveform that ends in a spark. Says "live financial pulse."
 * Connects directly to the section name "Pulse" used on Insights.
 */
export function FinoIconE({
  size = 18,
  color = '#7A4AB8',
  accent,
}: FinoIntelVariantProps) {
  const sparkColor = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Pulse line */}
      <Polyline
        points="2,13 6,13 8,8 11,18 14,11 17,13 21,13"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Spark above the peak */}
      <Path
        d="M19 3 L19.7 5.3 L22 6 L19.7 6.7 L19 9 L18.3 6.7 L16 6 L18.3 5.3 Z"
        fill={sparkColor}
      />
    </Svg>
  );
}
