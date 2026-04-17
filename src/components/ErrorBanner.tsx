import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  message: string;
  onRetry?: () => void;
}

/**
 * Thin banner shown at the top of a screen when a network/data fetch failed
 * but cached data is still rendered below. Non-blocking.
 */
export function ErrorBanner({ message, onRetry }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: `${colors.syncOffline}18`, borderColor: colors.syncOffline },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.syncOffline} />
      <Text
        style={[styles.text, { color: colors.textPrimary }]}
        numberOfLines={2}
      >
        {message}
      </Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading data"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.retry, { color: colors.syncOffline }]}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  retry: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
});

export default ErrorBanner;
