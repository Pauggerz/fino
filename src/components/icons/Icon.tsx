import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export type IconName =
  | 'edit'
  | 'add'
  | 'search'
  | 'balance'
  | 'sun'
  | 'cloud-sun'
  | 'moon'
  | 'chart'
  | 'bell'
  | 'sparkle'
  | 'chat';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 24,
  color = '#000',
  strokeWidth = 1.75,
}: IconProps) {
  const svgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'edit':
      return (
        <Svg {...svgProps}>
          <Path d="M4 20 L4 16 L16 4 L20 8 L8 20 Z" />
          <Path d="M14 6 L18 10" />
        </Svg>
      );
    case 'add':
      return (
        <Svg {...svgProps}>
          <Path d="M12 5 V19 M5 12 H19" />
        </Svg>
      );
    case 'search':
      return (
        <Svg {...svgProps}>
          <Circle cx="11" cy="11" r="7" />
          <Path d="M16.5 16.5 L21 21" />
        </Svg>
      );
    case 'balance':
      return (
        <Svg {...svgProps}>
          <Path d="M12 4 V20" />
          <Path d="M5 20 H19" />
          <Path d="M5 8 H19" />
          <Path d="M3 14 L5 8 L7 14 Z" />
          <Path d="M17 14 L19 8 L21 14 Z" />
        </Svg>
      );
    case 'sun':
      return (
        <Svg {...svgProps}>
          <Circle cx="12" cy="12" r="4" />
          <Path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6" />
        </Svg>
      );
    case 'cloud-sun':
      return (
        <Svg {...svgProps}>
          <Circle cx="8" cy="8" r="2.5" />
          <Path d="M8 2 V3.5 M2 8 H3.5 M3.8 3.8 L4.9 4.9 M12.2 3.8 L11.1 4.9" />
          <Path d="M8 18 H17 A4 4 0 0 0 17 10 A5.5 5.5 0 0 0 6.5 11.5 A3.25 3.25 0 0 0 8 18 Z" />
        </Svg>
      );
    case 'moon':
      return (
        <Svg {...svgProps}>
          <Path d="M20 14 A8 8 0 1 1 10 4 A6 6 0 0 0 20 14 Z" />
        </Svg>
      );
    case 'chart':
      return (
        <Svg {...svgProps}>
          <Path d="M3 21 H21" />
          <Path d="M7 21 V13" />
          <Path d="M12 21 V8" />
          <Path d="M17 21 V16" />
        </Svg>
      );
    case 'bell':
      return (
        <Svg {...svgProps}>
          <Path d="M6 8 A6 6 0 0 1 18 8 V14 L20 17 H4 L6 14 Z" />
          <Path d="M10 21 A2 2 0 0 0 14 21" />
        </Svg>
      );
    case 'sparkle':
      return (
        <Svg {...svgProps}>
          <Path d="M12 3 L13.6 9.4 L20 12 L13.6 14.6 L12 21 L10.4 14.6 L4 12 L10.4 9.4 Z" />
        </Svg>
      );
    case 'chat':
      return (
        <Svg {...svgProps}>
          <Path d="M21 12 A9 9 0 0 1 7 19.5 L3 21 L4.5 17 A9 9 0 1 1 21 12 Z" />
        </Svg>
      );
    default:
      return null;
  }
}
