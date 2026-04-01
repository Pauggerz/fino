import { ImageSourcePropType } from 'react-native';

export const ACCOUNT_LOGOS: Record<string, ImageSourcePropType> = {
  GCash:  require('../../assets/logos/gcash.png'),
  Maya:   require('../../assets/logos/maya.png'),
  BDO:    require('../../assets/logos/bdo.png'),
  BPI:    require('../../assets/logos/bpi.png'),
  GoTyme: require('../../assets/logos/gotyme.png'),
};

export const ACCOUNT_AVATAR_OVERRIDE: Record<string, string> = {
  Cash: '₱',
};
