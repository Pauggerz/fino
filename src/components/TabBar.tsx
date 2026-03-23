import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

export type TabRoute = 'home' | 'feed' | 'stats' | 'more';

interface TabBarProps {
  activeTab: TabRoute;
  onTabPress: (tab: TabRoute) => void;
  onFabPress: () => void;
}

export default function TabBar({ activeTab, onTabPress, onFabPress }: TabBarProps) {
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
    <View style={styles.tabBar}>
      {renderTab('home', '🏠', 'Home')}
      {renderTab('feed', '📋', 'Txns')}

      {/* ── FAB (ADD BUTTON) ── */}
      <TouchableOpacity 
        activeOpacity={0.8} 
        onPress={onFabPress}
        style={styles.fabContainer}
      >
        <LinearGradient
          colors={['#4a7a5e', '#5B8C6E', '#6a9e7f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Text style={styles.fabIcon}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      {renderTab('stats', '📊', 'Stats')}
      {renderTab('more', '⋯', 'More')}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 82,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,30,46,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12, // Slight adjustment for device safe areas
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
    backgroundColor: colors.primaryLight, // #EBF2EE
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: colors.textSecondary, // #8A8A9A
  },
  tabLabelActive: {
    fontFamily: 'Inter_700Bold', // using 700 as the closest loaded font to prototype's 800
    color: colors.primary, // #5B8C6E
  },
  fabContainer: {
    // We wrap the gradient in a container to cleanly apply the green shadow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
    marginHorizontal: 4,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1, // Simulates the inset white box-shadow from the HTML
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  fabIcon: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.white,
    lineHeight: 28,
    marginTop: Platform.OS === 'ios' ? -2 : 0, // Visual centering adjustment
  },
});