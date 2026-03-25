import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import TabBar, { TabRoute } from '../components/TabBar';
import AddTransactionSheet from '../screens/AddTransactionSheet';

// ── TEMPORARY PLACEHOLDERS ──
const FeedScreen = ({ navigation }: any) => (
  <View style={styles.placeholder}>
    <Text>Txns Feed Screen</Text>
    <Text
      style={styles.link}
      onPress={() => navigation.navigate('TransactionDetail')}
    >
      Tap to test Push to TransactionDetail →
    </Text>
  </View>
);
const StatsScreen = () => (
  <View style={styles.placeholder}>
    <Text>Stats Screen</Text>
  </View>
);
const MoreScreen = ({ navigation }: any) => (
  <View style={styles.placeholder}>
    <Text>More Screen</Text>
    <Text
      style={styles.link}
      onPress={() => navigation.navigate('AccountDetail')}
    >
      Tap to test Push to AccountDetail →
    </Text>
    <Text style={styles.link} onPress={() => navigation.navigate('AIScreen')}>
      Ask Fino (AI Screen) →
    </Text>
  </View>
);

const TransactionDetail = () => (
  <View style={styles.placeholder}>
    <Text>Transaction Detail</Text>
  </View>
);
const AccountDetail = () => (
  <View style={styles.placeholder}>
    <Text>Account Detail</Text>
  </View>
);
const AIScreen = () => (
  <View style={styles.placeholder}>
    <Text>✨ Fino AI Assistant</Text>
  </View>
);

// ── TYPES ──
export type FeedStackParamList = {
  FeedMain: undefined;
  TransactionDetail: undefined;
};

export type MoreStackParamList = {
  MoreMain: undefined;
  AccountDetail: undefined;
  AIScreen: undefined;
};

export type TabStackParamList = {
  home: undefined;
  feed: undefined;
  stats: undefined;
  more: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  AddTransaction: undefined;
};

const Tab = createBottomTabNavigator<TabStackParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// ── PER-TAB STACK NAVIGATORS ──
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
function FeedNavigator() {
  return (
    <FeedStack.Navigator screenOptions={{ headerShown: false }}>
      <FeedStack.Screen name="FeedMain" component={FeedScreen} />
      <FeedStack.Screen
        name="TransactionDetail"
        component={TransactionDetail}
      />
    </FeedStack.Navigator>
  );
}

const MoreStack = createNativeStackNavigator<MoreStackParamList>();
function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreMain" component={MoreScreen} />
      <MoreStack.Screen name="AccountDetail" component={AccountDetail} />
      {/* AI Screen lives inside the More stack so the Tab Bar stays visible */}
      <MoreStack.Screen name="AIScreen" component={AIScreen} />
    </MoreStack.Navigator>
  );
}

// ── MAIN TAB NAVIGATOR ──
function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <TabBar
          activeTab={props.state.routeNames[props.state.index] as TabRoute}
          onTabPress={(tab) => props.navigation.navigate(tab)}
          onFabPress={() => props.navigation.navigate('AddTransaction')}
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

// ── ROOT NAVIGATOR ──
export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Main Tabs */}
        <Stack.Screen name="Tabs" component={TabNavigator} />

        {/* Modal / Bottom Sheet Screens */}
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionSheet}
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
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
  link: {
    color: '#5B8C6E',
    fontFamily: 'Inter_600SemiBold',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
});
