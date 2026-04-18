import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';

WebBrowser.maybeCompleteAuthSession();

const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

type Mode = 'login' | 'signup';

interface Props {
  isActive: boolean;
  onComplete: () => void;
}

export default function AuthSlide({ isActive, onComplete }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  // Entrance animations
  const logoA  = useRef(new Animated.Value(0)).current;
  const logoY  = useRef(new Animated.Value(20)).current;
  const cardA  = useRef(new Animated.Value(0)).current;
  const cardY  = useRef(new Animated.Value(24)).current;
  const socialA = useRef(new Animated.Value(0)).current;
  const socialY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (Platform.OS === 'ios' && !IS_EXPO_GO) {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    [logoA, cardA, socialA].forEach(v => v.setValue(0));
    [logoY, cardY, socialY].forEach(v => v.setValue(20));

    Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(logoA, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(350),
      Animated.parallel([
        Animated.timing(cardA, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(cardY, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(550),
      Animated.parallel([
        Animated.timing(socialA, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(socialY, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, [isActive]);

  const resetForm = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    resetForm();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) { setError('Please enter your email and password.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Please enter a valid email address.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Please enter your name.'); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (err) throw err;
        onComplete();
      } else {
        const { error: err } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { data: { name: name.trim() } },
        });
        if (err) throw err;
        setSuccess('Check your email to confirm your account, then sign in.');
        setMode('login');
        setPassword('');
        setName('');
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    resetForm();
    setGoogleLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'fino://', skipBrowserRedirect: true },
      });
      if (err || !data.url) throw err ?? new Error('Google sign-in unavailable');
      const result = await WebBrowser.openAuthSessionAsync(data.url, 'fino://');
      if (result.type === 'success') {
        const fragment = result.url.split('#')[1] ?? result.url.split('?')[1] ?? '';
        const params = Object.fromEntries(new URLSearchParams(fragment));
        if (params.access_token && params.refresh_token) {
          await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
          onComplete();
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    resetForm();
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
      const { error: err } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (err) throw err;
      onComplete();
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        setError(err.message ?? 'Apple sign-in failed. Please try again.');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    Keyboard.dismiss();
    resetForm();
    const trimmed = forgotEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: 'fino://reset-password' });
      if (err) throw err;
      setSuccess('Password reset email sent. Check your inbox.');
      setForgotMode(false);
      setForgotEmail('');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <View style={s.root}>
      {/* Background */}
      <LinearGradient
        colors={['#050d08', '#071209', '#050d08']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Subtle green radial glow top-left */}
      <View pointerEvents="none" style={[s.bgGlow, { top: -80, left: -60, backgroundColor: 'rgba(30,90,52,0.28)' }]} />
      <View pointerEvents="none" style={[s.bgGlow, { bottom: -60, right: -60, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(20,70,40,0.20)' }]} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View style={[s.brand, { opacity: logoA, transform: [{ translateY: logoY }] }]}>
            <LinearGradient
              colors={['#3a6b50', '#5B8C6E', '#7ab896']}
              start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.logoBox}
            >
              <Text style={s.logoF}>f</Text>
            </LinearGradient>
            <Text style={s.appName}>fino</Text>
            <Text style={s.tagline}>Your personal finance companion</Text>
          </Animated.View>

          {/* Auth card */}
          <Animated.View style={[s.card, { opacity: cardA, transform: [{ translateY: cardY }] }]}>
            {/* Mode toggle */}
            <View style={s.modeToggle}>
              {(['login', 'signup'] as Mode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[s.modeBtn, mode === m && s.modeBtnActive]}
                  onPress={() => { setMode(m); resetForm(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.modeBtnText, mode === m && s.modeBtnTextActive]}>
                    {m === 'login' ? 'Sign In' : 'Sign Up'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Success */}
            {success && (
              <View style={s.successBox}>
                <Ionicons name="checkmark-circle" size={16} color="#5B8C6E" />
                <Text style={s.successText}>{success}</Text>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#E8856A" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Name (signup) */}
            {mode === 'signup' && (
              <View style={s.fieldWrap}>
                <Text style={s.label}>Name</Text>
                <TextInput
                  ref={nameRef}
                  style={s.input}
                  placeholder="Your name"
                  placeholderTextColor="rgba(168,213,181,0.3)"
                  value={name}
                  onChangeText={setName}
                  returnKeyType="next"
                  autoCapitalize="words"
                  textContentType="name"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>
            )}

            {/* Email */}
            <View style={s.fieldWrap}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor="rgba(168,213,181,0.3)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                textContentType="emailAddress"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {/* Password */}
            <View style={s.fieldWrap}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordWrap}>
                <TextInput
                  ref={passwordRef}
                  style={s.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(168,213,181,0.3)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  textContentType={mode === 'login' ? 'password' : 'newPassword'}
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(168,213,181,0.5)" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#5B8C6E', '#3a6b50']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitGradient}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={s.submitText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Forgot password */}
            {mode === 'login' && !forgotMode && (
              <TouchableOpacity onPress={() => { setForgotMode(true); resetForm(); }} style={s.forgotLink}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {mode === 'login' && forgotMode && (
              <View style={s.forgotBox}>
                <Text style={s.label}>Enter your email to receive a reset link</Text>
                <TextInput
                  style={s.input}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(168,213,181,0.3)"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="send"
                  onSubmitEditing={handleForgotPassword}
                />
                <View style={s.forgotActions}>
                  <TouchableOpacity onPress={() => { setForgotMode(false); setForgotEmail(''); resetForm(); }} style={s.forgotCancelBtn}>
                    <Text style={s.forgotCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.forgotSendBtn, forgotLoading && { opacity: 0.7 }]} onPress={handleForgotPassword} disabled={forgotLoading}>
                    <LinearGradient colors={['#5B8C6E', '#3a6b50']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitGradient}>
                      {forgotLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitText}>Send Link</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Social */}
          <Animated.View style={[{ opacity: socialA, transform: [{ translateY: socialY }] }]}>
            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or continue with</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.socialRow}>
              <TouchableOpacity
                style={s.socialBtn}
                onPress={handleGoogleSignIn}
                disabled={googleLoading || appleLoading}
                activeOpacity={0.8}
                accessibilityLabel="Sign in with Google"
              >
                {googleLoading ? <ActivityIndicator size="small" color="rgba(168,213,181,0.6)" /> : (
                  <>
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                    <Text style={s.socialBtnText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {appleAvailable && (
                <TouchableOpacity
                  style={s.socialBtn}
                  onPress={handleAppleSignIn}
                  disabled={googleLoading || appleLoading}
                  activeOpacity={0.8}
                  accessibilityLabel="Sign in with Apple"
                >
                  {appleLoading ? <ActivityIndicator size="small" color="rgba(168,213,181,0.6)" /> : (
                    <>
                      <Ionicons name="logo-apple" size={22} color="white" />
                      <Text style={s.socialBtnText}>Apple</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={s.footer}>Your data is private and encrypted.</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050d08' },
  bgGlow: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },

  brand: { alignItems: 'center', marginBottom: 28 },
  logoBox: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#5B8C6E', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  logoF: { fontFamily: 'Nunito_900Black', fontSize: 36, color: 'white', lineHeight: 44 },
  appName: { fontFamily: 'Nunito_800ExtraBold', fontSize: 28, color: 'white', letterSpacing: -1, marginBottom: 4 },
  tagline: { fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(168,213,181,0.5)' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20, padding: 20, gap: 14,
    borderWidth: 1, borderColor: 'rgba(168,213,181,0.10)',
    marginBottom: 20,
  },
  modeToggle: {
    flexDirection: 'row', borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 4, gap: 4,
  },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#5B8C6E' },
  modeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: 'rgba(168,213,181,0.45)' },
  modeBtnTextActive: { color: 'white' },

  successBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(91,140,110,0.15)', borderRadius: 10, padding: 12 },
  successText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: '#A8D5B5', lineHeight: 18 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(232,133,106,0.12)', borderRadius: 10, padding: 12 },
  errorText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: '#E8856A', lineHeight: 18 },

  fieldWrap: { gap: 6 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 13, color: 'rgba(168,213,181,0.5)' },
  input: {
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(168,213,181,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: 'Inter_400Regular', fontSize: 15,
    color: 'white',
  },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(168,213,181,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14, paddingVertical: 13, gap: 8,
  },
  passwordInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: 'white', padding: 0 },

  submitBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  submitGradient: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#fff' },

  forgotLink: { alignItems: 'center', marginTop: -4 },
  forgotText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: 'rgba(168,213,181,0.5)' },
  forgotBox: { gap: 10, marginTop: -4 },
  forgotActions: { flexDirection: 'row', gap: 10 },
  forgotCancelBtn: { flex: 1, borderWidth: 1, borderColor: 'rgba(168,213,181,0.15)', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  forgotCancelText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: 'rgba(168,213,181,0.5)' },
  forgotSendBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(168,213,181,0.10)' },
  dividerText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(168,213,181,0.35)' },

  socialRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(168,213,181,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, paddingVertical: 14,
  },
  socialBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: 'white' },

  footer: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(168,213,181,0.25)' },
});
