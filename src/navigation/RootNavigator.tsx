import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  NavigatorScreenParams,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import FABActionSheet from '../components/FABActionSheet';
import HomeScreen from '../screens/HomeScreen';
import FeedScreen from '../screens/FeedScreen';
import StatsScreen from '../screens/StatsScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import AddTransactionSheet from '../screens/AddTransactionSheet';
import TabBar, { TabRoute } from '../components/TabBar';
import ScreenshotScreen from '../screens/ScreenshotScreen';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import MoreScreen from '../screens/MoreScreen';
import ChatScreen from '../screens/ChatScreen';

// ─── ONBOARDING SCREENS ─────────────────────────────────────────────────────
import AccountSetupScreen from '../screens/onboarding/AccountSetupScreen';

// Temporary placeholder for the next step so the app doesn't crash when you hit Continue
const OnboardingCategoriesScreen = ({ navigation }: any) => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>Categories Setup Screen</Text>
    <Text
      style={{ color: '#534AB7', marginTop: 20, fontWeight: 'bold' }}
      onPress={() => navigation.navigate('Tabs')}
    >
      Finish Onboarding & Go to App →
    </Text>
  </View>
);

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type FeedStackParamList = {
  FeedMain: { filterCategory?: string } | undefined;
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
  more: undefined;
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
  AccountSetup: undefined; // <-- Added Onboarding
  OnboardingCategories: undefined; // <-- Added Onboarding
};

// ─── NAVIGATORS ─────────────────────────────────────────────────────────────

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
          onTabPress={(tab) => props.navigation.navigate(tab)}
          onFabPress={() => props.navigation.navigate('FABActionSheet')}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="home" component={HomeScreen} />
      <Tab.Screen name="feed" component={FeedNavigator} />
      <Tab.Screen name="stats" component={StatsScreen} />
      <Tab.Screen name="more" component={MoreNavigator} />
    </Tab.Navigator>
  );
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      {/* Notice initialRouteName is set to "AccountSetup" right now so you can test it. 
        Later, we will conditionally render this based on if the user is signed in!
      */}
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="AccountSetup"
      >
        {/* Onboarding Flow */}
        <Stack.Screen name="AccountSetup" component={AccountSetupScreen} />
        <Stack.Screen
          name="OnboardingCategories"
          component={OnboardingCategoriesScreen}
        />

        {/* Main App */}
        <Stack.Screen name="Tabs" component={TabNavigator} />

        {/* Modals */}
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
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="ScreenshotScreen"
          component={ScreenshotScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="ChatScreen"
          component={ChatScreen}
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: '#F7F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#1E1E2E',
  },
});
