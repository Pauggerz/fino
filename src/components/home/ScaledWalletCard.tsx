import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import WalletCard, { CARD_WIDTH, CARD_HEIGHT } from '@/components/WalletCard';

export const CARD_SCALE = 0.78;
export const SCALED_CARD_W = Math.round(CARD_WIDTH * CARD_SCALE);
export const SCALED_CARD_H = Math.round(CARD_HEIGHT * CARD_SCALE);

const SCALED_RADIUS = Math.round(22 * CARD_SCALE);
const SCALED_OFFSET_X = -Math.round((CARD_WIDTH * (1 - CARD_SCALE)) / 2);
const SCALED_OFFSET_Y = -Math.round((CARD_HEIGHT * (1 - CARD_SCALE)) / 2);

type ScaledWalletCardProps = {
  account: any;
  isPrivacyMode: boolean;
  onPress: () => void;
};

export const ScaledWalletCard = React.memo(
  ({ account, isPrivacyMode, onPress }: ScaledWalletCardProps) => (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${account?.name ?? 'wallet'} account`}
    >
      <View
        style={{
          width: SCALED_CARD_W,
          height: SCALED_CARD_H,
          overflow: 'hidden',
          borderRadius: SCALED_RADIUS,
        }}
      >
        <View
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            transform: [{ scale: CARD_SCALE }],
            left: SCALED_OFFSET_X,
            top: SCALED_OFFSET_Y,
          }}
        >
          <WalletCard account={account} isPrivacyMode={isPrivacyMode} />
        </View>
      </View>
    </TouchableOpacity>
  ),
  (prev, next) =>
    prev.account.id === next.account.id &&
    prev.account.balance === next.account.balance &&
    prev.account.name === next.account.name &&
    prev.account.type === next.account.type &&
    prev.isPrivacyMode === next.isPrivacyMode,
);
