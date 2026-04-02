import React from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { CATEGORY_ICON_PATHS } from '@/constants/categoryIcons';

/* eslint-disable import/prefer-default-export */

interface CategoryIconProps {
  categoryKey: string; // 'food' | 'transport' | 'shopping' | 'bills' | 'health' | any custom
  color: string; // hex color e.g. '#C97A20'
  size?: number; // icon size in px, default 20
  wrapperSize?: number; // circle size in px, default 38
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  categoryKey,
  color,
  size = 20,
  wrapperSize = 38,
}) => {
  const iconConfig =
    CATEGORY_ICON_PATHS[categoryKey] ?? CATEGORY_ICON_PATHS.default;

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <View
      style={{
        width: wrapperSize,
        height: wrapperSize,
        borderRadius: wrapperSize / 2,
        backgroundColor: hexToRgba(color, 0.18),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={iconConfig.viewBox ?? '0 0 24 24'}
      >
        {React.Children.map(iconConfig.paths as any, (child) =>
          React.cloneElement(child, { fill: color })
        )}
      </Svg>
    </View>
  );
};
