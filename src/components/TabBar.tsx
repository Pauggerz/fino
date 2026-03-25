import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';
import { BlurView } from 'expo-blur';

export type TabRoute = 'home' | 'feed' | 'stats' | 'more';

interface TabBarProps {
  activeTab: TabRoute;
  onTabPress: (tab: TabRoute) => void;
  onFabPress: () => void;
}

export default function TabBar({
  activeTab,
  onTabPress,
  onFabPress,
}: TabBarProps) {
  // FAB bounce animation
  const fabScale = useRef(new Animated.Value(1)).current;

  const handleFabPress = () => {
    Animated.sequence([
      Animated.timing(fabScale, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(fabScale, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
    onFabPress();
  };

  const renderTab = (id: TabRoute, icon: string, label: string) => {
    const isActive = activeTab === id;
    return (
      <TouchableOpacity
        key={id}
        style={[styles.tabItem, isActive && styles.tabItemActive]}
        onPress={() => onTabPress(id)}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>{icon}</Text>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <BlurView intensity={20} tint="light" style={styles.tabBar}>
      {renderTab('home', '🏠', 'Home')}
      {renderTab('feed', '📋', 'Txns')} 
      {/* ── FAB ── */}
      <Animated.View
        style={[styles.fabContainer, { transform: [{ scale: fabScale }] }]}
      >
        <TouchableOpacity activeOpacity={1} onPress={handleFabPress}>
          <LinearGradient
            colors={['#4a7a5e', '#5B8C6E', '#6a9e7f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Text style={styles.fabIcon}>+</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {renderTab('stats', '📊', 'Stats')}
      {renderTab('more', '⋯', 'More')}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 82,
    // spec: rgba(255,255,255,0.95)
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,30,46,0.08)',
    // spec: borderRadius 0 0 50px 50px (bottom corners only)
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 8,
    shadowColor: '#1E1E2E',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 3,
  },
  tabItemActive: {
    backgroundColor: colors.primaryLight,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    // spec: Nunito 700 for active label
    fontFamily: 'Nunito_700Bold',
    color: colors.primary,
  },
  fabContainer: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
    marginHorizontal: 4,
  },
  fab: {
    // spec: 58px circle
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  fabIcon: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.white,
    lineHeight: 28,
    marginTop: Platform.OS === 'ios' ? -2 : 0,
  },
});
