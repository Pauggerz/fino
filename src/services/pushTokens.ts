import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

/**
 * Expo push-token lifecycle.
 *
 * Responsibilities:
 *  • Capture the device's Expo push token (once permission is granted) and
 *    upsert it into Supabase `push_tokens` keyed on (user_id, token).
 *  • Create the Android notification channels required on API 26+.
 *  • Deactivate the device's token on sign-out so dispatchers stop targeting it.
 *  • Survive transient network failures: a failed upsert is stashed in
 *    AsyncStorage and retried (call flushPendingTokenUpsert on foreground).
 *
 * NB: this module never auto-prompts for permission. The priming UI owns the
 * request (§5.2). We only read the *existing* permission state here.
 *
 * Web is a no-op — expo-notifications has no react-native-web push support.
 */

const TOKEN_CACHE_KEY = '@fino_push_token';
const PENDING_KEY = '@fino_pending_token_upsert';
const DEVICE_ID_KEY = '@fino_device_id';

// Skip a redundant network upsert if the same (user, token) synced this recently.
const UPSERT_TTL_MS = 24 * 60 * 60 * 1000;

type CachedToken = { key: string; ts: number };
type PendingUpsert = { userId: string; token: string };

export type PushChannelId =
  | 'bill-reminders'
  | 'budget-alerts'
  | 'weekly-digest'
  | 'general';

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants as any).easConfig?.projectId
  );
}

async function getStableDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Create the four Android notification channels. Required on Android 8+; iOS
 * ignores channels entirely. Idempotent — Android merges by channel id.
 *
 * Lockscreen visibility follows the finance-app privacy stance (§6.36): money
 * channels default to PRIVATE (content hidden when locked); the weekly digest
 * is harmless enough to show PUBLIC.
 */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('bill-reminders', {
    name: 'Bill reminders',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
  await Notifications.setNotificationChannelAsync('budget-alerts', {
    name: 'Budget alerts',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.setNotificationChannelAsync('weekly-digest', {
    name: 'Weekly digest',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync('general', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

async function upsertToken(userId: string, token: string): Promise<void> {
  const payload = {
    user_id: userId,
    token,
    platform: Platform.OS,
    device_id: await getStableDeviceId(),
    device_name: Device.deviceName ?? Device.modelName ?? null,
    app_version: Constants.expoConfig?.version ?? null,
    last_seen_at: new Date().toISOString(),
    is_active: true,
  };

  const { error } = await supabase
    .from('push_tokens')
    .upsert(payload, { onConflict: 'user_id,token' });

  if (error) {
    // Stash for retry on next foreground (§6.12).
    await AsyncStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ userId, token } satisfies PendingUpsert)
    );
    throw error;
  }

  await AsyncStorage.multiSet([
    [
      TOKEN_CACHE_KEY,
      JSON.stringify({
        key: `${userId}:${token}`,
        ts: Date.now(),
      } satisfies CachedToken),
    ],
  ]);
  await AsyncStorage.removeItem(PENDING_KEY);
}

async function shouldSkipUpsert(
  userId: string,
  token: string
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
  if (!raw) return false;
  try {
    const cached = JSON.parse(raw) as CachedToken;
    return (
      cached.key === `${userId}:${token}` &&
      Date.now() - cached.ts < UPSERT_TTL_MS
    );
  } catch {
    return false;
  }
}

/**
 * Capture and persist the device's Expo push token, if permission is already
 * granted. Returns the token, or null when push is unavailable (web,
 * simulator, permission not granted, missing projectId, or network error).
 */
export async function registerForPushNotificationsAsync(
  userId: string
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    if (__DEV__) console.warn('[pushTokens] Push requires a physical device.');
    return null;
  }

  await ensureAndroidChannels();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null; // priming UI owns the prompt (§5.2)

  const projectId = getProjectId();
  if (!projectId) {
    if (__DEV__) console.warn('[pushTokens] Missing EAS projectId.');
    return null;
  }

  let token: string;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    token = res.data;
  } catch (err) {
    if (__DEV__)
      console.warn('[pushTokens] getExpoPushTokenAsync failed:', err);
    return null;
  }

  if (await shouldSkipUpsert(userId, token)) return token;

  try {
    await upsertToken(userId, token);
  } catch (err) {
    if (__DEV__)
      console.warn('[pushTokens] token upsert failed (queued):', err);
  }
  return token;
}

async function readCachedTokenFor(userId: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as CachedToken;
    const idx = cached.key.indexOf(':');
    if (idx < 0) return null;
    const cachedUser = cached.key.slice(0, idx);
    const cachedToken = cached.key.slice(idx + 1);
    return cachedUser === userId && cachedToken ? cachedToken : null;
  } catch {
    return null;
  }
}

/**
 * Mark this device's token inactive so dispatchers stop targeting it. Called on
 * sign-out *before* the session is cleared (RLS needs auth.uid()). We keep the
 * row for audit but flip is_active=false. Uses the cached token — no extra
 * network round-trip, works offline.
 */
export async function deregisterPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const token = await readCachedTokenFor(userId);
  if (token) {
    try {
      await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('token', token);
    } catch (err) {
      if (__DEV__) console.warn('[pushTokens] deregister failed:', err);
    }
  }

  await AsyncStorage.multiRemove([TOKEN_CACHE_KEY, PENDING_KEY]);
}

/**
 * Retry a previously-failed token upsert. Wire to an AppState 'active'
 * listener so a token captured offline lands as soon as the network returns.
 */
export async function flushPendingTokenUpsert(): Promise<void> {
  if (Platform.OS === 'web') return;
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return;
  try {
    const { userId, token } = JSON.parse(raw) as PendingUpsert;
    if (userId && token) await upsertToken(userId, token);
  } catch (err) {
    if (__DEV__) console.warn('[pushTokens] pending flush failed:', err);
  }
}

/**
 * Listen for Expo rotating the push token (Android reinstall / iOS device
 * transfer) and re-upsert. Returns an unsubscribe function. Caller owns the
 * lifecycle (subscribe after sign-in, unsubscribe on sign-out).
 */
export function addTokenRotationListener(userId: string): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addPushTokenListener((tokenData) => {
    const token =
      typeof tokenData === 'string' ? tokenData : (tokenData?.data ?? null);
    if (!token) return;
    upsertToken(userId, token).catch((err) => {
      if (__DEV__) console.warn('[pushTokens] rotation upsert failed:', err);
    });
  });
  return () => sub.remove();
}
