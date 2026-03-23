import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        // --- The Center Action Button ("Add Expense") ---
        if (route.name === 'AddAction') {
          return (
            <View key={route.key} style={styles.centerButtonWrapper}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation.navigate('AddExpenseModal')}
                style={styles.centerButton}
              >
                <Ionicons name="add" size={32} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          );
        }

        // --- Standard Navigation Tabs ---
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Assigning icons based on the route name
        let iconName: keyof typeof Ionicons.glyphMap = 'help-outline';
        if (route.name === 'Dashboard') iconName = isFocused ? 'home' : 'home-outline';
        else if (route.name === 'Insights') iconName = isFocused ? 'pie-chart' : 'pie-chart-outline';
        else if (route.name === 'Accounts') iconName = isFocused ? 'wallet' : 'wallet-outline';
        else if (route.name === 'Settings') iconName = isFocused ? 'settings' : 'settings-outline';

        // High-contrast solid black for active, muted gray for inactive
        const color = isFocused ? '#1C1C1E' : '#8E8E93';

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={styles.tabItem}
          >
            <Ionicons name={iconName} size={24} color={color} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 12,
    // Subtle, high-end iOS shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    // TODO: Replace with your primary brand color from src/constants/theme.ts
    backgroundColor: '#007AFF', 
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: -38, // Pushes it significantly above the bar
    // White border ring to cut it out from the background
    borderWidth: 4,
    borderColor: '#FFFFFF',
    // Button-specific shadow
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
});