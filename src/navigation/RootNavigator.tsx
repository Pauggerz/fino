import React, { startTransition } from 'react';
import { Platform, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  NavigatorScreenParams,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import FABActionSheet from '../components/FABActionSheet';
import HomeScreen from '../screens/HomeScreen';
import FeedScreen from '../screens/FeedScreen';
import InsightsScreen from '../screens/StatsScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import AddTransactionSheet from '../screens/AddTransactionSheet';
import TabBar, { TabRoute } from '../components/TabBar';
import ScreenshotScreen from '../screens/ScreenshotScreen';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import MoreScreen from '../screens/MoreScreen';
import ChatScreen from '../screens/ChatScreen';
import BillSplitterScreen from '../screens/BillSplitterScreen';
import UtangTrackerScreen from '../screens/UtangTrackerScreen';
import SavingsGoalScreen from '../screens/SavingsGoalScreen';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FeedStackParamList = {
  FeedMain: { filterCategory?: string; filterAccount?: string; filterSortOrder?: string } | undefined;
  TransactionDetail: { id: string };
};

export type MoreStackParamList = {
  MoreMain: undefined;
  AccountDetail: { id: string };
};

export type TabStackParamList = {
  home: undefined;
  feed: NavigatorScreenParams<FeedStackParamList>;
  stats: undefined;
  more: NavigatorScreenParams<MoreStackParamList>;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabStackParamList>;
  FABActionSheet: undefined;
  AddTransaction: {
    mode: 'expense' | 'income';
    prefill?: {
      merchant: string;
      amount: string;
      account: string;
      category: string;
      note?: string;
    };
  };
  ScreenshotScreen: undefined;
  ChatScreen: undefined;
  BillSplitter: undefined;
  UtangTracker: undefined;
  SavingsGoal: undefined;
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
      <MoreStack.Screen name="AccountDetail" component={AccountDetailScreen} />
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
          onTabPress={(tab) => {
            // Haptics fire on the current frame; heavy screen mounting is
            // deferred as a background transition via React 19 concurrent mode.
            startTransition(() => {
              if (tab === 'more') {
                // @ts-ignore
                props.navigation.navigate('more', { screen: 'MoreMain' });
              } else if (tab === 'feed') {
                // @ts-ignore
                props.navigation.navigate('feed', { screen: 'FeedMain' });
              } else {
                props.navigation.navigate(tab);
              }
            });
          }}
          onFabPress={() => props.navigation.navigate('FABActionSheet')}
        />
      )}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tab.Screen name="home" component={HomeScreen} />
      {/* unmountOnBlur safely removed to satisfy TypeScript */}
      <Tab.Screen name="feed" component={FeedNavigator} />
      <Tab.Screen name="stats" component={InsightsScreen} />
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

        <Stack.Screen
          name="FABActionSheet"
          component={FABActionSheet}
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionSheet}
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: {
              backgroundColor: 'transparent',
            },
          }}
        />

        <Stack.Screen
          name="ScreenshotScreen"
          component={ScreenshotScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />

        <Stack.Screen
          name="ChatScreen"
          component={ChatScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="BillSplitter"
          component={BillSplitterScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="UtangTracker"
          component={UtangTrackerScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="SavingsGoal"
          component={SavingsGoalScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
