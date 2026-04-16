import React, { useMemo } from 'react';
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

const rgbaCache = new Map<string, string>();

function hexToRgba(hex: string, alpha: number): string {
  const cacheKey = `${hex}-${alpha}`;
  const cached = rgbaCache.get(cacheKey);
  if (cached) return cached;

  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
  if (cleanHex.length !== 6) {
    const fallback = `rgba(0, 0, 0, ${alpha})`;
    rgbaCache.set(cacheKey, fallback);
    return fallback;
  }

  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  const rgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  rgbaCache.set(cacheKey, rgba);
  return rgba;
}

const CategoryIconBase: React.FC<CategoryIconProps> = ({
  categoryKey,
  color,
  size = 20,
  wrapperSize = 38,
}) => {
  const iconConfig = useMemo(
    () => CATEGORY_ICON_PATHS[categoryKey] ?? CATEGORY_ICON_PATHS.default,
    [categoryKey]
  );
  const bgColor = useMemo(() => hexToRgba(color, 0.18), [color]);
  const iconPaths = useMemo(
    () =>
      React.Children.map(iconConfig.paths as any, (child) =>
        React.cloneElement(child, { fill: color })
      ),
    [iconConfig, color]
  );

  return (
    <View
      style={{
        width: wrapperSize,
        height: wrapperSize,
        borderRadius: wrapperSize / 2,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={iconConfig.viewBox ?? '0 0 24 24'}
      >
        {iconPaths}
      </Svg>
    </View>
  );
};

export const CategoryIcon = React.memo(CategoryIconBase);
CategoryIcon.displayName = 'CategoryIcon';
