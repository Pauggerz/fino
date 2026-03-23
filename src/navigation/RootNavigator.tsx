import React from 'react';
import TabBar from '../components/TabBar';
import HomeScreen from '@/screens/HomeScreen';
import AddTransactionSheet from '../screens/AddTransactionSheet';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';


// TODO: Import your actual screen components here
const InsightsScreen = () => <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
const AccountsScreen = () => <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
const SettingsScreen = () => <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
const AddExpenseModal = () => <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

// --- Typings ---
export type RootStackParamList = {
  MainTabs: undefined;
  AddExpenseModal: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Insights: undefined;
  AddAction: undefined; // Placeholder for the center button
  Accounts: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// --- Tab Navigator ---
function MainTabNavigator() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />} // <-- Inject the custom UI here
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={HomeScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="AddAction" component={View} /> 
      <Tab.Screen name="Accounts" component={AccountsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// --- Root Stack ---
export default function RootNavigator() {
  return (
    <Stack.Navigator>
      {/* Main App hidden behind the tabs */}
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabNavigator} 
        options={{ headerShown: false }} 
      />
      
      {/* iOS Style Modal overlay for adding expenses */}
      <Stack.Screen 
        name="AddExpenseModal" 
        component={AddTransactionSheet} 
        options={{ 
          presentation: 'modal', // Creates the native iOS card slide-up effect
          headerShown: false,
        }} 
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingBottom: 24, // Safe area padding for newer iPhones
    paddingTop: 8,
    height: 85,
  },
  centerButtonContainer: {
    top: -15, // Pushes the button slightly out of the tab bar
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF', // Update with your theme brand color
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5, // Fallback for Android later
  },
});