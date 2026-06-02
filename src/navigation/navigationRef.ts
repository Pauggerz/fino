import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

/**
 * Global navigation ref so non-component code (notification tap handlers, cold
 * start) can navigate without a React context. Attached to NavigationContainer
 * in RootNavigator.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
