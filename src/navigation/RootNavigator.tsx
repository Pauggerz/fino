import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import FeedScreen from '../screens/FeedScreen'; // <-- Added real FeedScreen import
import AddTransactionSheet from '../screens/AddTransactionSheet';
import FABActionSheet from '../components/FABActionSheet';
import TabBar, { TabRoute } from '../components/TabBar';
import ScreenshotScreen from '../screens/ScreenshotScreen';

// ─── Placeholder screens ────────────────────────────────────────────────────

// (The dummy FeedScreen was deleted from here!)

const TransactionDetailScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>Transaction Detail</Text>
  </View>
);

const StatsScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>Stats Screen</Text>
  </View>
);

const MoreScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>More Screen</Text>
  </View>
);

// ─── Types ──────────────────────────────────────────────────────────────────

export type FeedStackParamList = {
  FeedMain: undefined;
  TransactionDetail: { id: string }; // <-- Updated to accept the transaction ID from FeedScreen
};

export type MoreStackParamList = {
  MoreMain: undefined;
};

export type TabStackParamList = {
  home: undefined;
  feed: undefined;
  stats: undefined;
  more: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  FABActionSheet: undefined;
  AddTransaction: { mode: 'expense' | 'income' };
  ScreenshotScreen: undefined;
};

// ─── Navigators ─────────────────────────────────────────────────────────────

const FeedStack = createNativeStackNavigator<FeedStackParamList>();
function FeedNavigator() {
  return (
    <FeedStack.Navigator screenOptions={{ headerShown: false }}>
      <FeedStack.Screen name="FeedMain" component={FeedScreen} />
      <FeedStack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreen}
      />
    </FeedStack.Navigator>
  );
}

const MoreStack = createNativeStackNavigator<MoreStackParamList>();
function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreMain" component={MoreScreen} />
    </MoreStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabStackParamList>();
function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <TabBar
          activeTab={props.state.routeNames[props.state.index] as TabRoute}
          onTabPress={(tab) => props.navigation.navigate(tab)}
          onFabPress={() => props.navigation.navigate('FABActionSheet')}
        />
      )}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="home" component={HomeScreen} />
      <Tab.Screen name="feed" component={FeedNavigator} />
      <Tab.Screen name="stats" component={StatsScreen} />
      <Tab.Screen name="more" component={MoreNavigator} />
    </Tab.Navigator>
  );
}

// ─── Root Stack ─────────────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabNavigator} />

        {/* FAB action sheet — custom JS animation, so navigator animation is none */}
        <Stack.Screen
          name="FABActionSheet"
          component={FABActionSheet}
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />

        {/* Add transaction sheet — self-animates with 340 ms bezier */}
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionSheet}
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />

        <Stack.Screen
          name="ScreenshotScreen"
          component={ScreenshotScreen}
          options={{
            headerShown: false,
            // Optional: makes it slide up from the bottom like a native iOS card
            presentation: 'modal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: '#F7F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#1E1E2E',
  },
});
