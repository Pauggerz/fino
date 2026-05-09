import React, { useRef, useState, useEffect, startTransition } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

export type TabRoute = 'home' | 'feed' | 'stats' | 'more';

interface TabBarProps {
  activeTab: TabRoute;
  onTabPress: (tab: TabRoute) => void;
  onAddManual: () => void;
  onScan: () => void;
}

const TAB_ICONS: Record<TabRoute, [string, string]> = {
  home: ['home-outline', 'home'],
  feed: ['receipt-outline', 'receipt'],
  stats: ['bar-chart-outline', 'bar-chart'],
  more: ['grid-outline', 'grid'],
};

const TAB_LABELS: Record<TabRoute, string> = {
  home: 'Home',
  feed: 'Txns',
  stats: 'Insights',
  more: 'Tools',
};

export default function TabBar({
  activeTab,
  onTabPress,
  onAddManual,
  onScan,
}: TabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const fabScale = useRef(new Animated.Value(1)).current;

  // Optimistic active tab: updates instantly on press, reconciles with navigation after
  const [visualActiveTab, setVisualActiveTab] = useState<TabRoute>(activeTab);
  useEffect(() => {
    setVisualActiveTab(activeTab);
  }, [activeTab]);

  // ── Speed-dial menu state ────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = useSharedValue(0); // 0 closed, 1 open

  const openMenu = () => {
    setMenuOpen(true);
    progress.value = withSpring(1, {
      damping: 16,
      stiffness: 220,
      mass: 0.55,
    });
  };
  const closeMenu = () => {
    progress.value = withTiming(0, { duration: 160 }, (finished) => {
      if (finished) runOnJS(setMenuOpen)(false);
    });
  };

  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      Animated.timing(fabScale, {
        toValue: 0.86,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(fabScale, {
        toValue: 1,
        friction: 4,
        tension: 240,
        useNativeDriver: true,
      }),
    ]).start();
    if (menuOpen) closeMenu();
    else openMenu();
  };

  const pickAction = (which: 'manual' | 'scan') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    closeMenu();
    // small delay so the close animation reads visually before nav slide-up
    setTimeout(() => {
      if (which === 'manual') onAddManual();
      else onScan();
    }, 80);
  };

  // Animated styles — manual pill (closer to FAB), scan pill (further)
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.45,
  }));
  const fabIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));
  const manualStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [30, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.6, 1]) },
    ],
  }));
  const scanStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [60, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.6, 1]) },
    ],
  }));

  const pillBg = colors.white;
  const fabBg = isDark ? '#FFFFFF' : '#1C1C1E';
  const fabColor = isDark ? '#1C1C1E' : '#FFFFFF';

  const renderTab = (id: TabRoute) => {
    const isActive = visualActiveTab === id;
    const [outline, filled] = TAB_ICONS[id];
    return (
      <TouchableOpacity
        key={id}
        style={styles.tabItem}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {}
          );
          setVisualActiveTab(id);
          startTransition(() => {
            onTabPress(id);
          });
        }}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${TAB_LABELS[id]} tab`}
      >
        <Ionicons
          name={(isActive ? filled : outline) as any}
          size={22}
          color={
            isActive
              ? colors.primary
              : isDark
                ? 'rgba(255,255,255,0.45)'
                : 'rgba(0,0,0,0.35)'
          }
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: isActive
                ? colors.primary
                : isDark
                  ? 'rgba(255,255,255,0.45)'
                  : 'rgba(0,0,0,0.35)',
              fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular',
            },
          ]}
        >
          {TAB_LABELS[id]}
        </Text>
      </TouchableOpacity>
    );
  };

  const bottomOffset = Math.max(insets.bottom, 16);

  const actionPillBg = isDark ? '#2C2C2E' : '#FFFFFF';
  const actionPillText = isDark ? '#FFFFFF' : '#1C1C1E';

  return (
    <>
      {/* ── Speed-dial backdrop (full-screen, captures taps to close) ── */}
      {menuOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeMenu}
          accessibilityLabel="Close menu"
        >
          <Reanimated.View
            style={[styles.menuBackdrop, backdropStyle]}
            pointerEvents="none"
          />
        </Pressable>
      )}

      <View
        style={[styles.wrapper, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        {/* ── Speed-dial action pills (anchored to FAB column) ── */}
        {menuOpen && (
          <View
            style={styles.dialColumn}
            pointerEvents="box-none"
          >
            <Reanimated.View
              style={[
                styles.actionPill,
                { backgroundColor: actionPillBg, shadowColor: '#000' },
                scanStyle,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => pickAction('scan')}
                style={styles.actionPillInner}
                accessibilityLabel="Scan receipt"
              >
                <View
                  style={[
                    styles.actionIcon,
                    {
                      backgroundColor: isDark
                        ? 'rgba(201,184,245,0.18)'
                        : '#EEEDFE',
                    },
                  ]}
                >
                  <Ionicons
                    name="scan-outline"
                    size={18}
                    color={isDark ? colors.lavender : '#4B2DA3'}
                  />
                </View>
                <Text
                  style={[styles.actionLabel, { color: actionPillText }]}
                >
                  Scan receipt
                </Text>
              </TouchableOpacity>
            </Reanimated.View>

            <Reanimated.View
              style={[
                styles.actionPill,
                { backgroundColor: actionPillBg, shadowColor: '#000' },
                manualStyle,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => pickAction('manual')}
                style={styles.actionPillInner}
                accessibilityLabel="Add manually"
              >
                <View
                  style={[
                    styles.actionIcon,
                    {
                      backgroundColor: isDark
                        ? 'rgba(91,140,110,0.22)'
                        : '#EBF2EE',
                    },
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <Text
                  style={[styles.actionLabel, { color: actionPillText }]}
                >
                  Add manually
                </Text>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        )}

        {/* ── Floating pill ── */}
        <View
          style={[
            styles.pill,
            {
              backgroundColor: pillBg,
              shadowColor: isDark ? '#000' : '#1C1C1E',
            },
          ]}
        >
          {renderTab('home')}
          {renderTab('feed')}
          {renderTab('stats')}
          {renderTab('more')}
        </View>

        {/* ── FAB circle ── */}
        <Animated.View
          style={[
            styles.fabWrap,
            {
              shadowColor: isDark ? '#fff' : '#000',
              transform: [{ scale: fabScale }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleFabPress}
            style={[styles.fab, { backgroundColor: fabBg }]}
            accessibilityRole="button"
            accessibilityLabel={menuOpen ? 'Close menu' : 'Add transaction'}
          >
            <Reanimated.View style={fabIconStyle}>
              <Ionicons name="add" size={28} color={fabColor} />
            </Reanimated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
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

  // ── Speed-dial menu
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  dialColumn: {
    position: 'absolute',
    right: 0,
    bottom: 72, // sits just above the FAB (64 + ~8 spacing)
    alignItems: 'flex-end',
    gap: 10,
  },
  actionPill: {
    borderRadius: 999,
    minWidth: 180, // both pills share the same width regardless of label length
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  actionPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 8,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: -0.1,
  },
});
