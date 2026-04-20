import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import RAnim, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CategoryIcon } from '@/components/CategoryIcon';
import type { CategoryWithSpend } from '@/hooks/useCategories';
import type { ThemeColors } from '@/constants/theme';
import fmtPeso from '@/utils/format';
import { WaveFill } from './WaveFill';

type BudgetTileProps = {
  cat: CategoryWithSpend;
  index: number;
  isPrivacyMode: boolean;
  isDark: boolean;
  colors: ThemeColors;
  styles: Record<string, any>;
  onPress: () => void;
};

const BudgetTile = React.memo(
  ({
    cat,
    index,
    isPrivacyMode,
    isDark,
    colors,
    styles,
    onPress,
  }: BudgetTileProps) => {
    const opacity = useSharedValue(0);
    const transY = useSharedValue(16);
    const animStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ translateY: transY.value }],
    }));

    useEffect(() => {
      opacity.value = withDelay(index * 60, withTiming(1, { duration: 280 }));
      transY.value = withDelay(
        index * 60,
        withSpring(0, { damping: 18, stiffness: 200 })
      );
    }, [index, opacity, transY]);

    const bgColor = cat.tile_bg_colour ?? colors.catTileEmptyBg;
    const solidColor = cat.text_colour ?? colors.primary;
    const isOver = cat.state === 'over';

    return (
      <RAnim.View style={[styles.catTileWrap, animStyle]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${cat.name} budget${isOver ? ', over limit' : ''}`}
        >
          <View
            style={[
              styles.catTile,
              { backgroundColor: isDark ? colors.surfaceSubdued : bgColor },
            ]}
          >
            <WaveFill pct={cat.pct} color={solidColor} />

            <View style={styles.catBadgeWrap}>
              {isOver ? (
                <View style={styles.catOverBadge}>
                  <Text style={styles.catOverBadgeText}>Over!</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.catPctPill,
                    { backgroundColor: `${solidColor}18` },
                  ]}
                >
                  <Text style={[styles.catPctBadge, { color: solidColor }]}>
                    {Math.round(cat.pct * 100)}%
                  </Text>
                </View>
              )}
            </View>

            <View
              style={[
                styles.catIconCircle,
                { backgroundColor: `${solidColor}22` },
              ]}
            >
              <CategoryIcon
                categoryKey={cat.name.toLowerCase()}
                color={solidColor}
              />
            </View>

            <Text style={[styles.catName, { color: solidColor }]}>
              {cat.name}
            </Text>
            <Text style={[styles.catAmt, { color: solidColor }]}>
              {fmtPeso(cat.spent, isPrivacyMode)}
            </Text>
          </View>
        </TouchableOpacity>
      </RAnim.View>
    );
  },
  (prev, next) =>
    prev.cat.id === next.cat.id &&
    prev.cat.pct === next.cat.pct &&
    prev.cat.state === next.cat.state &&
    prev.cat.spent === next.cat.spent &&
    prev.isPrivacyMode === next.isPrivacyMode &&
    prev.isDark === next.isDark &&
    prev.colors === next.colors &&
    prev.styles === next.styles
);

export default BudgetTile;
