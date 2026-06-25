import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import LoginScreen from './LoginScreen';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Modal wrapper around LoginScreen, opened from Settings when running on the
// device-local identity. Auto-dismisses once a session exists — the local→cloud
// data claim runs centrally in AuthContext.
export default function AuthModalScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigation.goBack();
  }, [session]);

  return (
    <View style={styles.root}>
      <LoginScreen />
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.close, { top: insets.top + 10 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={26} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: { position: 'absolute', right: 18 },
});
