import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Asset } from 'expo-asset';

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
import { ACCOUNT_LOGOS } from './src/constants/accountLogos';
import { ThemeProvider } from './src/contexts/ThemeContext';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAssetsReady, setIsAssetsReady] = useState(false);

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

  // Check Supabase session on mount
  useEffect(() => {
    async function prepareSession() {
      try {
        await supabase.auth.getSession();
      } catch (error) {
        console.warn('Session check failed, signing out:', error);
        await supabase.auth.signOut();
      } finally {
        // Always mark auth as ready, whether session exists, is empty, or failed
        setIsAuthReady(true);
      }
    }

    prepareSession();
  }, []);

  // Pre-load local image assets
  useEffect(() => {
    async function prepareAssets() {
      try {
        // Cast the values to number[] to satisfy the TypeScript compiler
        const imageAssets = Object.values(ACCOUNT_LOGOS) as number[];
        await Asset.loadAsync(imageAssets);
      } catch (error) {
        console.warn('Asset pre-loading failed:', error);
      } finally {
        setIsAssetsReady(true);
      }
    }

    prepareAssets();
  }, []);

  // Determine if all required resources are loaded
  const isAppReady = fontsLoaded && isAuthReady && isAssetsReady;

  useEffect(() => {
    if (isAppReady) {
      // Hide the splash screen once everything is ready
      SplashScreen.hideAsync().catch(console.warn);
    }
  }, [isAppReady]);

  // Return null to keep the splash screen visible until ready
  if (!isAppReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <SafeAreaProvider>
          <SyncProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </SyncProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
