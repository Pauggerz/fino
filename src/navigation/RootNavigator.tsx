import React, { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  NavigationContainer,
  NavigatorScreenParams,
  useNavigation,
} from '@react-navigation/native';
import { useShareIntent } from 'expo-share-intent';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import FABActionSheet from '../components/FABActionSheet';
import HomeScreen from '../screens/HomeScreen';
import FeedScreen from '../screens/FeedScreen';
import InsightsScreen from '../screens/StatsScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import AddTransactionSheet from '../screens/AddTransactionSheet';
import TabBar, { TabRoute } from '../components/TabBar';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import MoreScreen from '../screens/MoreScreen';
import LoginScreen from '../screens/LoginScreen';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Modal screens — not part of first paint. Split out of the initial bundle
// graph so cold start doesn't parse them. Suspense boundary below catches the
// load flash on first open.
const ChatScreen = lazy(() => import('../screens/ChatScreen'));
const BillSplitterScreen = lazy(() => import('../screens/BillSplitterScreen'));
const UtangTrackerScreen = lazy(() => import('../screens/UtangTrackerScreen'));
const SavingsGoalScreen = lazy(() => import('../screens/SavingsGoalScreen'));
const ScreenshotScreen = lazy(() => import('../screens/ScreenshotScreen'));
const OnboardingScreen = lazy(() => import('../screens/OnboardingScreen'));

function ModalLoadingShim() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.white,
      }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type FeedStackParamList = {
  FeedMain:
    | {
        filterCategory?: string;
        filterAccount?: string;
        filterSortOrder?: string;
      }
    | undefined;
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
  Onboarding: undefined;
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
  ScreenshotScreen: { sharedImageUri?: string } | undefined;
  ChatScreen: undefined;
  BillSplitter: undefined;
  UtangTracker: undefined;
  SavingsGoal: undefined;
};

// ─── Navigators ─────────────────────────────────────────────────────────────

const FeedStack = createNativeStackNavigator<FeedStackParamList>();
function FeedNavigator() {
  return (
    <FeedStack.Navigator
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
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
    <MoreStack.Navigator
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
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
        // Freeze inactive tab screens — pauses their JS work (Reanimated
        // worklets, Skia draws, non-focused observable subscribers continue
        // but their state updates never reach React). Switching back thaws
        // instantly because the view hierarchy is kept in memory.
        freezeOnBlur: true,
        // lazy is the default, but make it explicit: Stats/More/Feed don't
        // mount until first tapped. Home cold-starts alone.
        lazy: true,
      }}
    >
      <Tab.Screen name="home" component={HomeScreen} />
      <Tab.Screen name="feed" component={FeedNavigator} />
      <Tab.Screen name="stats" component={InsightsScreen} />
      <Tab.Screen name="more" component={MoreNavigator} />
    </Tab.Navigator>
  );
}

// ─── Root Stack ─────────────────────────────────────────────────────────────

// Watches for incoming share-sheet images and routes to ScreenshotScreen.
// Must live inside NavigationContainer so useNavigation is available.
function ShareIntentHandler() {
  const { shareIntent, resetShareIntent } = useShareIntent();
  const navigation = useNavigation<any>();
  const { session } = useAuth();

  useEffect(() => {
    if (!shareIntent || !session) return;
    const file = shareIntent.files?.[0];
    if (!file?.path) return;

    navigation.navigate('ScreenshotScreen', { sharedImageUri: file.path });
    resetShareIntent();
  }, [shareIntent, session]);

  return null;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { session, isLoading } = useAuth();
  // DEV: always show onboarding for critiquing. To restore normal behaviour,
  // replace the line below with the commented-out block.
  const [hasOnboarded, setHasOnboarded] = useState(false);
  // const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  // useEffect(() => {
  //   AsyncStorage.getItem('hasOnboarded').then(val => setHasOnboarded(val === 'true'));
  // }, []);

  if (isLoading) return null;

  return (
    <NavigationContainer>
      <ShareIntentHandler />
      <Suspense fallback={<ModalLoadingShim />}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!hasOnboarded ? (
          <Stack.Screen name="Onboarding">
            {(props) => (
              <OnboardingScreen
                {...props}
                onComplete={() => setHasOnboarded(true)}
              />
            )}
          </Stack.Screen>
        ) : !session ? (
          // ── Unauthenticated ───────────────────────────────────────────────
          <Stack.Screen
            name={'Login' as any}
            component={LoginScreen}
            options={{ animation: 'fade' }}
          />
        ) : (
          // ── Authenticated ─────────────────────────────────────────────────
          <>
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
          </>
        )}
        </Stack.Navigator>
      </Suspense>
    </NavigationContainer>
  );
}
