import React, {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useState,
} from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NavigationContainer,
  NavigatorScreenParams,
  useNavigation,
} from '@react-navigation/native';
import { useShareIntent } from 'expo-share-intent';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { navigationRef } from './navigationRef';
import { handleColdStartNotification } from '../services/notificationHandlers';
import FABActionSheet from '../components/FABActionSheet';
import HomeScreen from '../screens/HomeScreen';
import FeedScreen from '../screens/FeedScreen';
import InsightsScreen from '../screens/StatsScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import AddTransactionSheet from '../screens/AddTransactionSheet';
import TabBar, { TabRoute } from '../components/TabBar';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import MoreScreen from '../screens/MoreScreen';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Modal screens — not part of first paint. Split out of the initial bundle
// graph so cold start doesn't parse them. Suspense boundary below catches the
// load flash on first open.
const ChatScreen = lazy(() => import('../screens/ChatScreen'));
const BillSplitterScreen = lazy(() => import('../screens/BillSplitterScreen'));
const UtangTrackerScreen = lazy(() => import('../screens/UtangTrackerScreen'));
const SavingsGoalScreen = lazy(() => import('../screens/SavingsGoalScreen'));
const FinancialEducationScreen = lazy(
  () => import('../screens/FinancialEducationScreen')
);
const RecurringIncomeScreen = lazy(
  () => import('../screens/RecurringIncomeScreen')
);
const RecurringBillsScreen = lazy(
  () => import('../screens/RecurringBillsScreen')
);
const ScreenshotScreen = lazy(() => import('../screens/ScreenshotScreen'));
const VoiceEntryScreen = lazy(() => import('../screens/VoiceEntryScreen'));
const OnboardingScreen = lazy(() => import('../screens/OnboardingScreen'));
const CashFlowScreen = lazy(() => import('../screens/CashFlowScreen'));
const CategoryScreen = lazy(() => import('../screens/CategoryScreen'));
const AccountsScreen = lazy(() => import('../screens/AccountsScreen'));
const SankeyFullscreenScreen = lazy(
  () => import('../screens/SankeyFullscreenScreen')
);
const NotificationsScreen = lazy(
  () => import('../screens/NotificationsScreen')
);
const SettingsScreen = lazy(() => import('../screens/SettingsScreen'));
const AccountSettingsScreen = lazy(
  () => import('../screens/AccountSettingsScreen')
);
const NotificationSettingsScreen = lazy(
  () => import('../screens/NotificationSettingsScreen')
);
const NotificationPrimingScreen = lazy(
  () => import('../screens/NotificationPrimingScreen')
);
const CurrencySettingsScreen = lazy(
  () => import('../screens/CurrencySettingsScreen')
);
const LanguageSettingsScreen = lazy(
  () => import('../screens/LanguageSettingsScreen')
);
const AuthModalScreen = lazy(() => import('../screens/AuthModalScreen'));

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
        initialViewType?: 'expense' | 'income';
      }
    | undefined;
};

export type MoreStackParamList = {
  MoreMain: undefined;
  AccountDetail: { id: string; from?: 'home' };
};

export type TabStackParamList = {
  home: undefined;
  feed: NavigatorScreenParams<FeedStackParamList>;
  stats: undefined;
  more: NavigatorScreenParams<MoreStackParamList>;
};

export type RootStackParamList = {
  Onboarding: undefined;
  // Sign-in / sign-up modal — opened from Settings when running on the
  // device-local identity (offline-first; no account required to use the app).
  Auth: undefined;
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
  ScreenshotScreen:
    | { sharedImageUri?: string; initialSource?: 'camera' | 'upload' }
    | undefined;
  VoiceEntryScreen: undefined;
  ChatScreen: undefined;
  BillSplitter: undefined;
  // Optional prefill so the chatbot's "Add to Utang Tracker" action can stage
  // a record for the user to confirm (no silent write). `direction` picks the
  // tab/form mode — defaults to a receivable ('owed_to_me') when omitted.
  UtangTracker:
    | {
        debtorName?: string;
        amount?: number;
        direction?: 'owed_to_me' | 'i_owe';
      }
    | undefined;
  // Optional prefill so the chatbot's "Create goal" action can stage a goal
  // for the user to confirm (FINO_CHATBOT V3 — prefill + confirm).
  SavingsGoal:
    | { name?: string; target?: number; monthlyContribution?: number }
    | undefined;
  FinancialEducation: undefined;
  RecurringIncome: undefined;
  RecurringBills: undefined;
  CashFlow: { accountId?: string } | undefined;
  // Optional prefill so the chatbot's "Set a budget" action can focus/stage a
  // category budget for the user to confirm.
  Categories: { focusCategory?: string; budgetLimit?: number } | undefined;
  Accounts: undefined;
  Notifications: undefined;
  NotificationPriming: undefined;
  Settings: undefined;
  AccountSettings: { focus?: 'name' | 'email' | 'password' } | undefined;
  NotificationSettings: undefined;
  CurrencySettings: undefined;
  LanguageSettings: undefined;
  TransactionDetail: { id: string };
  SankeyFullscreen: {
    income: number;
    savings: number;
    expenseNodes: {
      key: string;
      label: string;
      amount: number;
      color: string;
    }[];
  };
};

// ─── Navigators ─────────────────────────────────────────────────────────────

const FeedStack = createNativeStackNavigator<FeedStackParamList>();
function FeedNavigator() {
  return (
    <FeedStack.Navigator
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
      <FeedStack.Screen name="FeedMain" component={FeedScreen} />
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
  // Receipt OCR needs the authed backend, so it's online-only. On the local
  // identity, prompt the user to create an account instead of opening a
  // scanner whose save would fail.
  const { isLocal } = useAuth();

  const requireAccountForScan = (navigate: () => void) => {
    Alert.alert(
      'Sign in to scan receipts',
      'Receipt scanning needs an account. Create one to sync online and unlock scanning — your offline data comes with you.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Create account', onPress: navigate },
      ]
    );
  };

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
          onAddManual={() =>
            props.navigation.navigate('AddTransaction', { mode: 'expense' })
          }
          onScan={() => {
            const go = () =>
              props.navigation.navigate('ScreenshotScreen', {
                initialSource: 'camera',
              });
            if (isLocal)
              requireAccountForScan(() => props.navigation.navigate('Auth'));
            else go();
          }}
          onUpload={() => {
            const go = () =>
              props.navigation.navigate('ScreenshotScreen', {
                initialSource: 'upload',
              });
            if (isLocal)
              requireAccountForScan(() => props.navigation.navigate('Auth'));
            else go();
          }}
          onVoice={() => props.navigation.navigate('VoiceEntryScreen')}
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
  const { isLoading } = useAuth();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('hasOnboarded').then((val) =>
      setHasOnboarded(val === 'true')
    );
  }, []);

  if (isLoading || hasOnboarded === null) return null;

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        // A tap that cold-started the app is handled once navigation is ready
        // (§6.14). Listeners cover foreground/background taps.
        handleColdStartNotification();
      }}
    >
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
          ) : (
            // ── App (offline-first) ───────────────────────────────────────────
            // Once onboarded the app is always available — a cloud session is
            // optional and only enables sync. Sign-in lives in the `Auth` modal,
            // opened from Settings.
            <>
              <Stack.Screen name="Tabs" component={TabNavigator} />

              <Stack.Screen
                name="Auth"
                component={AuthModalScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />

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
                name="VoiceEntryScreen"
                component={VoiceEntryScreen}
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
              <Stack.Screen
                name="FinancialEducation"
                component={FinancialEducationScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="RecurringIncome"
                component={RecurringIncomeScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="RecurringBills"
                component={RecurringBillsScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="CashFlow"
                component={CashFlowScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Categories"
                component={CategoryScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="Accounts"
                component={AccountsScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="NotificationPriming"
                component={NotificationPrimingScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="AccountSettings"
                component={AccountSettingsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="NotificationSettings"
                component={NotificationSettingsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="CurrencySettings"
                component={CurrencySettingsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="LanguageSettings"
                component={LanguageSettingsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="TransactionDetail"
                component={TransactionDetailScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="SankeyFullscreen"
                component={SankeyFullscreenScreen}
                options={{
                  headerShown: false,
                  presentation: 'fullScreenModal',
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </Suspense>
    </NavigationContainer>
  );
}
