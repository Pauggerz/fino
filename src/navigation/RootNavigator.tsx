import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import Screens & Components
import HomeScreen from '../screens/HomeScreen';
import TabBar, { TabRoute } from '../components/TabBar';
// Note: We will build these placeholders in the upcoming steps
import AddTransactionSheet from '../screens/AddTransactionSheet';

// Temporary placeholder screens for the other tabs
const FeedScreen = () => (
  <View style={styles.placeholder}>
    <Text>Txns Feed Screen</Text>
  </View>
);
const StatsScreen = () => (
  <View style={styles.placeholder}>
    <Text>Stats Screen</Text>
  </View>
);
const MoreScreen = () => (
  <View style={styles.placeholder}>
    <Text>More Screen</Text>
  </View>
);

// Types
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
      <Tab.Screen name="feed" component={FeedScreen} />
      <Tab.Screen name="stats" component={StatsScreen} />
      <Tab.Screen name="more" component={MoreScreen} />
    </Tab.Navigator>
  );
}

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
            presentation: 'transparentModal', // Allows the sheet to slide over the dimmed background
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
});
