import React, { useRef, useState, useEffect, startTransition } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

export type TabRoute = 'home' | 'feed' | 'stats' | 'more';

interface TabBarProps {
  activeTab: TabRoute;
  onTabPress: (tab: TabRoute) => void;
  onFabPress: () => void;
}

const TAB_ICONS: Record<TabRoute, [string, string]> = {
  home:  ['home-outline',      'home'],
  feed:  ['receipt-outline',   'receipt'],
  stats: ['bar-chart-outline', 'bar-chart'],
  more:  ['grid-outline',      'grid'],
};

const TAB_LABELS: Record<TabRoute, string> = {
  home:  'Home',
  feed:  'Txns',
  stats: 'Insights',
  more:  'Tools',
};

export default function TabBar({ activeTab, onTabPress, onFabPress }: TabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const fabScale = useRef(new Animated.Value(1)).current;

  // Optimistic active tab: updates instantly on press, reconciles with navigation after
  const [visualActiveTab, setVisualActiveTab] = useState<TabRoute>(activeTab);
  useEffect(() => { setVisualActiveTab(activeTab); }, [activeTab]);

  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 0.86, duration: 70, useNativeDriver: true }),
      Animated.spring(fabScale, { toValue: 1, friction: 4, tension: 240, useNativeDriver: true }),
    ]).start();
    onFabPress();
  };

  const pillBg   = isDark ? '#1C1C1E' : '#FFFFFF';
  const fabBg    = isDark ? '#FFFFFF' : '#1C1C1E';
  const fabColor = isDark ? '#1C1C1E' : '#FFFFFF';

  const renderTab = (id: TabRoute) => {
    const isActive = visualActiveTab === id;
    const [outline, filled] = TAB_ICONS[id];
    return (
      <TouchableOpacity
        key={id}
        style={styles.tabItem}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setVisualActiveTab(id);
          startTransition(() => { onTabPress(id); });
        }}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${TAB_LABELS[id]} tab`}
      >
        <Ionicons
          name={(isActive ? filled : outline) as any}
          size={22}
          color={isActive ? colors.primary : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)')}
        />
        <Text style={[
          styles.tabLabel,
          {
            color: isActive
              ? colors.primary
              : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'),
            fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular',
          },
        ]}>
          {TAB_LABELS[id]}
        </Text>
      </TouchableOpacity>
    );
  };

  const bottomOffset = Math.max(insets.bottom, 16);

  return (
    <View
      style={[styles.wrapper, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      {/* ── Floating pill ── */}
      <View style={[
        styles.pill,
        {
          backgroundColor: pillBg,
          shadowColor: isDark ? '#000' : '#1C1C1E',
        },
      ]}>
        {renderTab('home')}
        {renderTab('feed')}
        {renderTab('stats')}
        {renderTab('more')}
      </View>

      {/* ── FAB circle ── */}
      <Animated.View style={[
        styles.fabWrap,
        {
          shadowColor: isDark ? '#fff' : '#000',
          transform: [{ scale: fabScale }],
        },
      ]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFabPress}
          style={[styles.fab, { backgroundColor: fabBg }]}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
        >
          <Ionicons name="add" size={28} color={fabColor} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer row containing pill + FAB
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // The oval pill
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    borderRadius: 100,
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 10,
  },

  // FAB
  fabWrap: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 14,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
