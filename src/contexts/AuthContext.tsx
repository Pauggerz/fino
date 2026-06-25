// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { deregisterPushToken } from '../services/pushTokens';
import { claimLocalData } from '../services/claimLocalData';
import { User } from '../types';

// Device-local identity (offline-first). Before the user creates a cloud
// account, every local row is stamped with this UUID and the app runs with no
// session. `@fino_currency` mirrors CurrencyContext's own key so the synthesized
// local profile doesn't fight it.
const LOCAL_USER_ID_KEY = '@fino_local_user_id';
const LOCAL_PROFILE_KEY = '@fino_local_profile';
const CURRENCY_KEY = '@fino_currency';

interface LocalProfile {
  name: string | null;
}

interface AuthContextData {
  session: Session | null;
  user: SupabaseUser | null;
  profile: User | null;
  /**
   * The active user id for *data* operations — the Supabase auth uid when
   * signed in, otherwise the device-local UUID. All local mutations stamp
   * `user_id` with this. Always populated once `isLoading` is false.
   */
  currentUserId: string;
  /** True while running on the device-local identity (no cloud session). */
  isLocal: boolean;
  isLoading: boolean;
  profileError: boolean;
  refreshProfile: () => Promise<void>;
  /** Persist the user's name into the device-local profile (offline). */
  setLocalName: (name: string) => Promise<void>;
  /**
   * Sign out with push cleanup: deactivates this device's push token (while the
   * session is still valid for RLS) and clears scheduled OS notifications +
   * badge so the device is clean if reused by another account (§6.13).
   */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  // ─── Device-local identity ───────────────────────────────────────────────
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [localName, setLocalNameState] = useState<string | null>(null);
  const [localCurrency, setLocalCurrency] = useState<string>('PHP');

  // Bootstrap the local identity once on mount: read (or mint) the local UUID
  // and load the cached name + currency. `localUserId === null` keeps the app
  // in its loading state so `currentUserId` is never empty when consumed.
  useEffect(() => {
    (async () => {
      try {
        let id = await AsyncStorage.getItem(LOCAL_USER_ID_KEY);
        if (!id) {
          id = Crypto.randomUUID();
          await AsyncStorage.setItem(LOCAL_USER_ID_KEY, id);
        }
        const [rawProfile, currency] = await Promise.all([
          AsyncStorage.getItem(LOCAL_PROFILE_KEY),
          AsyncStorage.getItem(CURRENCY_KEY),
        ]);
        if (rawProfile) {
          try {
            const parsed = JSON.parse(rawProfile) as LocalProfile;
            setLocalNameState(parsed.name ?? null);
          } catch {
            /* ignore corrupt cache */
          }
        }
        if (currency) setLocalCurrency(currency);
        setLocalUserId(id);
      } catch (err) {
        if (__DEV__)
          console.warn('[Auth] local identity bootstrap failed', err);
        // Last-resort in-memory id so the app still runs this session.
        setLocalUserId((prev) => prev ?? Crypto.randomUUID());
      }
    })();
  }, []);

  // Claim device-local data into the cloud account the first time a session
  // appears. Runs once per app launch; a no-op when there's no local data or
  // the account already has data (see claimLocalData for the fresh-account
  // guard).
  const claimedRef = React.useRef(false);
  useEffect(() => {
    const authUid = session?.user?.id;
    if (!authUid || !localUserId || claimedRef.current) return;
    claimedRef.current = true;
    claimLocalData(authUid, localUserId).catch((err) => {
      if (__DEV__) console.warn('[Auth] claim local data failed', err);
    });
  }, [session, localUserId]);

  const setLocalName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    setLocalNameState(trimmed || null);
    await AsyncStorage.setItem(
      LOCAL_PROFILE_KEY,
      JSON.stringify({ name: trimmed || null } satisfies LocalProfile)
    );
  }, []);

  const fetchProfile = async (
    userId: string,
    userMeta?: Record<string, any>
  ) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error?.code === 'PGRST116') {
        // No profile row yet (new user, or DB trigger hasn't run).
        // Create it here as a fallback — the seed_user_defaults trigger on
        // public.users will automatically create the default Cash account
        // and expense categories.
        const name = userMeta?.name ?? userMeta?.full_name ?? null;
        const { data: created, error: insertErr } = await supabase
          .from('users')
          .insert({
            id: userId,
            name,
            currency: 'PHP',
            auth_mode: 'cloud',
            total_budget: null,
          })
          .select()
          .single();
        if (!insertErr && created) {
          setProfile(created as User);
          setProfileError(false);
        } else {
          if (__DEV__)
            console.warn('Failed to create user profile:', insertErr?.message);
          setProfileError(true);
        }
      } else if (error) {
        if (__DEV__)
          console.warn('Error fetching user profile:', error.message);
        setProfileError(true);
      } else {
        setProfile(data as User);
        setProfileError(false);
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch profile', error);
      setProfileError(true);
    }
  };

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user]);

  const signOut = useCallback(async () => {
    // Deregister the push token first — RLS on push_tokens needs auth.uid(),
    // which disappears once supabase.auth.signOut() resolves.
    try {
      if (user?.id) await deregisterPushToken(user.id);
    } catch (err) {
      if (__DEV__) console.warn('[Auth] push deregister failed:', err);
    }
    try {
      if (Platform.OS !== 'web') {
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.setBadgeCountAsync(0);
      }
    } catch (err) {
      if (__DEV__) console.warn('[Auth] notification cleanup failed:', err);
    }
    await supabase.auth.signOut();
  }, [user]);

  useEffect(() => {
    // `getSession` and `onAuthStateChange` both fire on mount with the same
    // session, which used to race the PGRST116 insert-fallback and could
    // attempt a duplicate user-row insert under slow network. `didInit`
    // ensures only the first arrival triggers the initial profile fetch.
    const didInit = { current: false };

    const handleSession = async (sess: Session | null) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        await fetchProfile(sess.user.id, sess.user.user_metadata);
      } else {
        setProfile(null);
        setProfileError(false);
      }
      setSessionLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (didInit.current) return;
      didInit.current = true;
      handleSession(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Initial mount: skip if getSession already handled it.
        if (event === 'INITIAL_SESSION') {
          if (didInit.current) return;
          didInit.current = true;
        }
        await handleSession(session);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const isLocal = !session;
  const currentUserId = user?.id ?? localUserId ?? '';
  // Hold the app in its loading state until BOTH the session check and the
  // local-identity bootstrap resolve, so `currentUserId` is never empty when
  // a consumer reads it.
  const isLoading = sessionLoading || localUserId === null;

  // When signed in, `profile` is the server row. When local, synthesize one
  // from the cached name + currency so existing `profile?.name`/`?.currency`
  // consumers keep working unchanged.
  const effectiveProfile = useMemo<User | null>(() => {
    if (session) return profile;
    if (!localUserId) return null;
    return {
      id: localUserId,
      name: localName,
      currency: localCurrency,
      auth_mode: 'local',
      total_budget: null,
      created_at: new Date().toISOString(),
    };
  }, [session, profile, localUserId, localName, localCurrency]);

  // Memoized so every sync / unrelated re-render in the tree above us doesn't
  // recreate the value object and cascade re-renders through every useAuth()
  // consumer (and their children).
  const value = useMemo<AuthContextData>(
    () => ({
      session,
      user,
      profile: effectiveProfile,
      currentUserId,
      isLocal,
      isLoading,
      profileError,
      refreshProfile,
      setLocalName,
      signOut,
    }),
    [
      session,
      user,
      effectiveProfile,
      currentUserId,
      isLocal,
      isLoading,
      profileError,
      refreshProfile,
      setLocalName,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
