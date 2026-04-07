import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';

import RootNavigator from './src/navigation/RootNavigator';
import { SyncProvider } from './src/contexts/SyncContext';
import { supabase } from './src/services/supabase';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // DEV ONLY: reset onboarding flag so the flow is always visible
  useEffect(() => {
    AsyncStorage.removeItem('hasOnboarded');
  }, []);

  useEffect(() => {
    // When a coworker invalidates sessions on the Supabase dashboard, the
    // stored refresh token becomes orphaned. Calling getSession() surfaces
    // the error so we can cleanly sign out and clear AsyncStorage, stopping
    // the unhandled AuthApiError from propagating.
    supabase.auth.getSession().catch(() => {
      supabase.auth.signOut();
    });
  }, []);

  if (!fontsLoaded) return null;

  return (
    // 👇 Wrap the app in SafeAreaProvider
  <SafeAreaProvider>
        <SyncProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </SyncProvider>
      </SafeAreaProvider>
  );
}
