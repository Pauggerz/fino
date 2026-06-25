import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { ShareIntentProvider } from 'expo-share-intent';
import { StyleSheet, Linking, AppState } from 'react-native';
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
import { SyncProvider, useSyncVersion } from './src/contexts/SyncContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { CurrencyProvider } from './src/contexts/CurrencyContext';
import { I18nProvider } from './src/contexts/I18nContext';
import { NotificationPrefsProvider } from './src/contexts/NotificationPrefsContext';
import { AppLockProvider } from './src/contexts/AppLockContext';
import { AppLockGate } from './src/components/AppLockGate';
import { supabase } from './src/services/supabase';
import { ACCOUNT_LOGOS } from './src/constants/accountLogos';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { database } from './src/db';
import {
  setForegroundNotificationHandler,
  attachNotificationListeners,
  registerNotificationCategories,
  syncBadgeCount,
} from './src/services/notificationHandlers';
import {
  ensureAndroidChannels,
  registerForPushNotificationsAsync,
  addTokenRotationListener,
  flushPendingTokenUpsert,
} from './src/services/pushTokens';
import { syncScheduledNotifications } from './src/services/localPushScheduler';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Install the foreground-presentation policy as early as possible so a push
// arriving before any component mounts is still handled (no-op on web).
setForegroundNotificationHandler();

/**
 * Drives the push-notification lifecycle from inside the provider tree:
 *  • foreground receive + tap listeners (once),
 *  • per-user token capture + rotation listener,
 *  • local-schedule reconciliation after each successful sync pull,
 *  • pending-token / badge refresh on foreground.
 * Renders nothing.
 */
function PushBootstrap() {
  const { user, currentUserId } = useAuth();
  const userId = user?.id; // cloud session uid — push-token registration only
  const syncVersion = useSyncVersion();
  const lastReconciledVersion = useRef(-1);

  // Foreground listeners + iOS categories — attach once for the app's lifetime.
  useEffect(() => {
    const detach = attachNotificationListeners();
    registerNotificationCategories();
    return detach;
  }, []);

  // Push-token registration requires a cloud session (server push rail).
  useEffect(() => {
    if (!userId) return undefined;
    let removeRotation = () => {};
    let cancelled = false;
    (async () => {
      await registerForPushNotificationsAsync(userId);
      if (cancelled) return;
      removeRotation = addTokenRotationListener(userId);
      await flushPendingTokenUpsert();
    })();
    return () => {
      cancelled = true;
      removeRotation();
    };
  }, [userId]);

  // Local OS schedule + badge work offline under the device-local identity, so
  // they key off `currentUserId` (local bill reminders still fire without an
  // account). New bills reschedule via scheduleReconcile in localMutations.
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      await ensureAndroidChannels();
      syncScheduledNotifications(currentUserId);
      syncBadgeCount();
    })();
  }, [currentUserId]);

  // Reconcile local schedules after each successful pull — newly-synced bills
  // and recurring rows get their reminders scheduled.
  useEffect(() => {
    if (!userId || syncVersion === lastReconciledVersion.current) return;
    lastReconciledVersion.current = syncVersion;
    syncScheduledNotifications(userId);
  }, [syncVersion, userId]);

  // Retry queued token upsert + refresh badge whenever the app foregrounds.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flushPendingTokenUpsert();
        syncBadgeCount();
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

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
              <I18nProvider>
                <SafeAreaProvider>
                  <AuthProvider>
                    <CurrencyProvider>
                      <NotificationPrefsProvider>
                        <AppLockProvider>
                          <SyncProvider>
                            <PushBootstrap />
                            <AppLockGate>
                              <RootNavigator />
                            </AppLockGate>
                            <StatusBar style="auto" />
                          </SyncProvider>
                        </AppLockProvider>
                      </NotificationPrefsProvider>
                    </CurrencyProvider>
                  </AuthProvider>
                </SafeAreaProvider>
              </I18nProvider>
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
