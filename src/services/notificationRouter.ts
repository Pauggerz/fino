import { navigationRef } from '@/navigation/navigationRef';
import type { NotificationData } from './notificationTypes';

/**
 * Single source of truth for turning a notification payload (push tap, cold
 * start, or in-app inbox card tap) into a navigation action. Both the OS tap
 * handler and NotificationsScreen route through here so behaviour is identical.
 *
 * Everything navigates via the global `navigationRef`, which is valid once the
 * NavigationContainer has mounted. Unknown / missing routes fall back to the
 * Notifications inbox so a tap never dead-ends.
 */

// Bottom-tab destinations live under the 'Tabs' navigator.
const TAB_ROUTES = new Set(['home', 'feed', 'stats', 'more']);

// Modal / stack routes that exist in RootStackParamList and are safe to target.
const MODAL_ROUTES = new Set([
  'RecurringBills',
  'RecurringIncome',
  'SavingsGoal',
  'Categories',
  'Accounts',
  'Notifications',
  'CashFlow',
  'UtangTracker',
  'BillSplitter',
  'FinancialEducation',
  'ChatScreen',
]);

export interface RoutableNotification {
  route?: string;
  params?: Record<string, unknown>;
}

/**
 * Navigate to the screen described by a notification. Safe to call before
 * navigation is ready — it no-ops if the container hasn't mounted yet (the
 * cold-start handler retries after the navigator is ready).
 */
export function routeFromNotification(data: RoutableNotification): void {
  if (!navigationRef.isReady()) return;
  const { route, params } = data;

  // The navigate() overloads can't be satisfied by a runtime-typed string +
  // params, so route through a loosely-typed shim (mirrors the `route as any`
  // pattern already used in NotificationsScreen / other screens).
  const go = (name: string, p?: Record<string, unknown>) => {
    (navigationRef.navigate as (n: string, prm?: object) => void)(name, p);
  };

  if (!route) {
    go('Notifications');
    return;
  }

  if (TAB_ROUTES.has(route)) {
    // Nested navigation into the tab navigator.
    go('Tabs', { screen: route, params });
    return;
  }

  if (route === 'AddTransaction') {
    go('AddTransaction', { mode: 'expense', ...params });
    return;
  }

  if (MODAL_ROUTES.has(route)) {
    go(route, params);
    return;
  }

  // Unknown route (e.g. a newer server payload) — land on the inbox.
  go('Notifications');
}

/** Project a NotificationData payload onto the routable subset. */
export function routeFromPayload(
  data: Partial<NotificationData> | undefined
): void {
  if (!data) return;
  routeFromNotification({ route: data.route, params: data.params });
}
