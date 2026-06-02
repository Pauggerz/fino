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
import * as Notifications from 'expo-notifications';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { deregisterPushToken } from '../services/pushTokens';
import { User } from '../types';

interface AuthContextData {
  session: Session | null;
  user: SupabaseUser | null;
  profile: User | null;
  isLoading: boolean;
  profileError: boolean;
  refreshProfile: () => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

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
      setIsLoading(false);
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

  // Memoized so every sync / unrelated re-render in the tree above us doesn't
  // recreate the value object and cascade re-renders through every useAuth()
  // consumer (and their children).
  const value = useMemo<AuthContextData>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      profileError,
      refreshProfile,
      signOut,
    }),
    [session, user, profile, isLoading, profileError, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
