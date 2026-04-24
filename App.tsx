import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { ShareIntentProvider } from 'expo-share-intent';
import { StyleSheet, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Asset } from 'expo-asset';

import {
  useFonts,
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

import DatabaseProvider from '@nozbe/watermelondb/react/DatabaseProvider';

import RootNavigator from './src/navigation/RootNavigator';
import { SyncProvider } from './src/contexts/SyncContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { supabase } from './src/services/supabase';
import { ACCOUNT_LOGOS } from './src/constants/accountLogos';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { database } from './src/db';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);

  // 11 → 9 fonts. Nunito_400/600 dropped as unused after consolidating
  // one-off call sites onto already-loaded Inter weights. Each font is a
  // network fetch + parse on cold start; fewer loads = faster time-to-paint.
  const [fontsLoaded] = useFonts({
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
        if (__DEV__) console.warn('Session check failed, signing out:', error);
        await supabase.auth.signOut();
      } finally {
        setIsAuthReady(true);
      }
    }
    prepareSession();
  }, []);

  // Handle deep links — email confirmation + password reset.
  // Supabase redirects to fino://#access_token=...&refresh_token=...&type=signup|recovery
  useEffect(() => {
    const handleUrl = async (url: string) => {
      // Tokens can be in the hash fragment (#) or query string (?) depending on
      // Supabase version / platform.
      const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
      const params = Object.fromEntries(new URLSearchParams(fragment));
      const { access_token, refresh_token } = params;
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    };

    // App opened via deep link (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // App brought to foreground via deep link (warm start)
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // Fire-and-forget asset warm-up. The logos are require()'d so they're
  // already in the JS bundle; Asset.loadAsync only primes the file-system
  // cache for Image rendering. Not worth blocking splash on — first paint of
  // Home doesn't render all 5 logos simultaneously anyway.
  useEffect(() => {
    const imageAssets = Object.values(ACCOUNT_LOGOS) as number[];
    Asset.loadAsync(imageAssets).catch((error) => {
      console.warn('Asset pre-loading failed:', error);
    });
  }, []);

  // Determine if all required resources are loaded
  const isAppReady = fontsLoaded && isAuthReady;

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
    <ShareIntentProvider>
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <DatabaseProvider database={database}>
          <ThemeProvider>
            <SafeAreaProvider>
              <AuthProvider>
                <SyncProvider>
                  <RootNavigator />
                  <StatusBar style="auto" />
                </SyncProvider>
              </AuthProvider>
            </SafeAreaProvider>
          </ThemeProvider>
        </DatabaseProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
