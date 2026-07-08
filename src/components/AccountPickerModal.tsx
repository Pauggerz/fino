import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatTx } from '@/intelligence';

export type AccountItem = {
  id: string;
  name: string;
  letter_avatar: string;
  brand_colour: string;
  balance: number;
};

export function AccountPickerModal({
  visible,
  accounts,
  pendingTx,
  onSelect,
  onDismiss,
  colors,
  isDark,
  insetBottom,
}: {
  visible: boolean;
  accounts: AccountItem[];
  pendingTx: ChatTx | null;
  onSelect: (accountId: string) => void;
  onDismiss: () => void;
  colors: any;
  isDark: boolean;
  insetBottom: number;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Stay mounted through the slide-out animation, then unmount once it settles.
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible]);

  if (!rendered) return null;

  const fmt = (n: number) =>
    n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      {/* Backdrop */}
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          opacity: backdropOpacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: Math.max(insetBottom, 24),
          transform: [{ translateY: slideAnim }],
          // iOS shadow
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          // Android
          elevation: 20,
        }}
      >
        {/* Handle */}
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: isDark ? '#444' : '#DDD',
            alignSelf: 'center',
            marginBottom: 20,
          }}
        />

        {/* Title */}
        <Text
          style={{
            fontFamily: 'Nunito_800ExtraBold',
            fontSize: 17,
            color: colors.textPrimary,
            marginBottom: 4,
          }}
        >
          Which account?
        </Text>
        {pendingTx && (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 13,
              color: colors.textSecondary,
              marginBottom: 20,
            }}
          >
            Logging{' '}
            <Text
              style={{
                fontFamily: 'Inter_600SemiBold',
                color: colors.textPrimary,
              }}
            >
              {pendingTx.displayName ?? 'transaction'}
            </Text>{' '}
            for{' '}
            <Text
              style={{
                fontFamily: 'DMMono_500Medium',
                color: colors.expenseRed,
              }}
            >
              ₱
              {pendingTx.amount?.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
              }) ?? '—'}
            </Text>
          </Text>
        )}

        {/* Account list */}
        <View style={{ gap: 10 }}>
          {accounts.map((acc) => (
            <TouchableOpacity
              key={acc.id}
              activeOpacity={0.75}
              onPress={() => onSelect(acc.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(0,0,0,0.03)',
                borderWidth: 1,
                borderColor: isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.07)',
                borderRadius: 14,
                padding: 14,
                gap: 14,
              }}
            >
              {/* Avatar */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: acc.brand_colour || colors.chatAILabel,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Nunito_800ExtraBold',
                    fontSize: 16,
                    color: '#fff',
                  }}
                >
                  {acc.letter_avatar || acc.name[0]}
                </Text>
              </View>

              {/* Name + balance */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 15,
                    color: colors.textPrimary,
                  }}
                >
                  {acc.name}
                </Text>
                <Text
                  style={{
                    fontFamily: 'DMMono_500Medium',
                    fontSize: 12,
                    color: colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  ₱{fmt(acc.balance)}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel */}
        <TouchableOpacity
          onPress={onDismiss}
          style={{
            marginTop: 16,
            alignItems: 'center',
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontFamily: 'Inter_600SemiBold',
              fontSize: 14,
              color: colors.textSecondary,
            }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}
