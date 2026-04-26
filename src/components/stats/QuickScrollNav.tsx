import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import RAnim, {
  useAnimatedStyle,
  interpolateColor,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

export type QuickNavTab = {
  key: string;
  num: string;
  label: string;
};

export const DEFAULT_TABS: QuickNavTab[] = [
  { key: 'sec-01', num: '01', label: 'Stand' },
  { key: 'sec-02', num: '02', label: 'Where' },
  { key: 'sec-03', num: '03', label: 'When' },
  { key: 'sec-04', num: '04', label: 'Flow' },
];

export function QuickScrollNav({
  tabs,
  activeIndex,
  scrolled,
  onTabPress,
}: {
  tabs: QuickNavTab[];
  activeIndex: number;
  scrolled: SharedValue<number>;
  onTabPress: (index: number) => void;
}) {
  const { colors, isDark } = useTheme();

  const containerAnim = useAnimatedStyle(() => ({
    borderBottomColor: interpolateColor(
      scrolled.value,
      [0, 1],
      ['rgba(0,0,0,0)', colors.border]
    ),
    shadowOpacity: withTiming(scrolled.value > 0.5 ? 0.08 : 0, {
      duration: 200,
    }),
  }));

  return (
    <RAnim.View
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? 'rgba(14,14,16,0.92)'
            : 'rgba(247,245,242,0.92)',
        },
        containerAnim,
      ]}
    >
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(i)}
            style={[
              styles.tab,
              {
                backgroundColor: isActive
                  ? colors.primary
                  : colors.surfaceSubdued,
                shadowColor: colors.primary,
                shadowOpacity: isActive ? 0.35 : 0,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: isActive ? 3 : 0,
              },
            ]}
          >
            <Text
              style={[
                styles.tabNum,
                {
                  color: isActive ? '#FFFFFF' : colors.textSecondary,
                  opacity: isActive ? 0.95 : 0.55,
                },
              ]}
            >
              {tab.num}
            </Text>
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </RAnim.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginHorizontal: -16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tabNum: {
    fontFamily: 'DMMono_500Medium',
    fontSize: 9,
  },
  tabLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
});
