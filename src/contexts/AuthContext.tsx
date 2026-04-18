// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { User } from '../types';

interface AuthContextData {
  session: Session | null;
  user: SupabaseUser | null;
  profile: User | null;
  isLoading: boolean;
  profileError: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const fetchProfile = async (userId: string, userMeta?: Record<string, any>) => {
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
          .insert({ id: userId, name, currency: 'PHP', auth_mode: 'cloud', total_budget: null })
          .select()
          .single();
        if (!insertErr && created) {
          setProfile(created as User);
          setProfileError(false);
        } else {
          if (__DEV__) console.warn('Failed to create user profile:', insertErr?.message);
          setProfileError(true);
        }
      } else if (error) {
        if (__DEV__) console.warn('Error fetching user profile:', error.message);
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

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.user_metadata).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id, session.user.user_metadata);
        } else {
          setProfile(null);
          setProfileError(false);
        }
        setIsLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, isLoading, profileError, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);