import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { supabase } from '../services/supabase';
import { useTheme } from '../contexts/ThemeContext';

// Apple Sign In is incompatible with Expo Go (wrong bundle ID in id_token audience).
// It only works in a development build or production build.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS === 'ios' && !IS_EXPO_GO) {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  const resetForm = () => {
    setError(null);
    setSuccess(null);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'fino://', skipBrowserRedirect: true },
      });
      if (error || !data.url)
        throw error ?? new Error('Google sign-in unavailable');

      const result = await WebBrowser.openAuthSessionAsync(data.url, 'fino://');
      if (result.type === 'success') {
        const fragment =
          result.url.split('#')[1] ?? result.url.split('?')[1] ?? '';
        const params = Object.fromEntries(new URLSearchParams(fragment));
        if (params.access_token && params.refresh_token) {
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
        }
      }
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (
        msg.includes('provider is not enabled') ||
        msg.includes('validation_failed')
      ) {
        setError(
          'Google sign-in is not configured yet. Enable the Google provider in your Supabase Dashboard → Authentication → Providers.'
        );
      } else {
        setError(msg || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setSuccess(null);
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken)
        throw new Error('Apple did not return an identity token.');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
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
    setError(null);
    setSuccess(null);
    const trimmed = forgotEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: 'fino://reset-password',
      });
      if (error) throw error;
      setSuccess('Password reset email sent. Check your inbox.');
      setForgotMode(false);
      setForgotEmail('');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password;

    if (!trimmedEmail || !trimmedPassword) {
      setError('Please enter your email and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (trimmedPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (error) throw error;
        // Auth state change in AuthContext will redirect automatically
      } else {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            data: { name: name.trim() },
          },
        });
        if (error) throw error;
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

  const inputBg = isDark ? '#1C1C1E' : '#F7F5F2';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: isDark ? '#0A0A0F' : colors.background,
      }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View
            style={[styles.logoCircle, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="leaf" size={32} color="#fff" />
          </View>
          <Text style={[styles.appName, { color: colors.textPrimary }]}>
            fino
          </Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Your personal finance companion
          </Text>
        </View>

        {/* Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? '#1C1C1E' : '#fff' },
          ]}
        >
          {/* Mode toggle */}
          <View
            style={[
              styles.modeToggle,
              { backgroundColor: isDark ? '#2C2C2E' : colors.primaryLight },
            ]}
          >
            {(['login', 'signup'] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.modeBtn,
                  mode === m && { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  setMode(m);
                  resetForm();
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: mode === m ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {m === 'login' ? 'Sign In' : 'Sign Up'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Success message */}
          {success && (
            <View style={[styles.successBox, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          {/* Error message */}
          {error && (
            <View style={[styles.errorBox, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Name field (sign up only) */}
          {mode === 'signup' && (
            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Name
              </Text>
              <TextInput
                ref={nameRef}
                style={[
                  styles.input,
                  {
                    backgroundColor: inputBg,
                    borderColor,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Your name"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                autoCapitalize="words"
                textContentType="name"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
          )}

          {/* Email field */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: inputBg,
                  borderColor,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSecondary}
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

          {/* Password field */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Password
            </Text>
            <View
              style={[
                styles.passwordWrap,
                { backgroundColor: inputBg, borderColor },
              ]}
            >
              <TextInput
                ref={passwordRef}
                style={[styles.passwordInput, { color: colors.textPrimary }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: colors.primary },
              loading && { opacity: 0.7 },
            ]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Forgot password */}
          {mode === 'login' && !forgotMode && (
            <TouchableOpacity
              onPress={() => {
                setForgotMode(true);
                setError(null);
                setSuccess(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.forgotLink}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          )}

          {mode === 'login' && forgotMode && (
            <View
              style={[
                styles.forgotBox,
                {
                  backgroundColor: isDark ? '#2C2C2E' : '#F7F5F2',
                  borderColor,
                },
              ]}
            >
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Enter your email to receive a reset link
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: inputBg,
                    borderColor,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                value={forgotEmail}
                onChangeText={setForgotEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                textContentType="emailAddress"
                onSubmitEditing={handleForgotPassword}
              />
              <View style={styles.forgotActions}>
                <TouchableOpacity
                  onPress={() => {
                    setForgotMode(false);
                    setForgotEmail('');
                    setError(null);
                  }}
                  style={[styles.forgotCancelBtn, { borderColor }]}
                >
                  <Text
                    style={[
                      styles.forgotCancelText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.forgotSendBtn,
                    { backgroundColor: colors.primary },
                    forgotLoading && { opacity: 0.7 },
                  ]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                  activeOpacity={0.85}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitText}>Send Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Social sign-in */}
        <View style={styles.dividerRow}>
          <View
            style={[
              styles.dividerLine,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.1)',
              },
            ]}
          />
          <Text style={[styles.dividerText, { color: colors.textSecondary }]}>
            or continue with
          </Text>
          <View
            style={[
              styles.dividerLine,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.1)',
              },
            ]}
          />
        </View>

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[
              styles.socialBtn,
              {
                backgroundColor: isDark ? '#1C1C1E' : '#fff',
                borderColor: isDark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.1)',
              },
            ]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || appleLoading}
            activeOpacity={0.8}
            accessibilityLabel="Sign in with Google"
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <Text
                  style={[styles.socialBtnText, { color: colors.textPrimary }]}
                >
                  Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {appleAvailable && (
            <TouchableOpacity
              style={[
                styles.socialBtn,
                {
                  backgroundColor: isDark ? '#1C1C1E' : '#fff',
                  borderColor: isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)',
                },
              ]}
              onPress={handleAppleSignIn}
              disabled={googleLoading || appleLoading}
              activeOpacity={0.8}
              accessibilityLabel="Sign in with Apple"
            >
              {appleLoading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <>
                  <Ionicons
                    name="logo-apple"
                    size={22}
                    color={isDark ? '#fff' : '#000'}
                  />
                  <Text
                    style={[
                      styles.socialBtnText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Apple
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          Your data is private and encrypted.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  appName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 34,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
  },
  successText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#065F46',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    padding: 0,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  footer: {
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 20,
  },
  forgotLink: {
    alignItems: 'center',
    marginTop: -4,
  },
  forgotText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  forgotBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginTop: -4,
  },
  forgotActions: {
    flexDirection: 'row',
    gap: 10,
  },
  forgotCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  forgotCancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  forgotSendBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  socialBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});
