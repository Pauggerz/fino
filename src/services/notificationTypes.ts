import type { NotificationType } from '@/db/models/Notification';

/**
 * Push/local payload contract shared by the scheduler, the receive/tap
 * handlers, and the router. Server dispatchers emit the same shape.
 *
 * `v` is the payload schema version (§6.10): the receive handler switches on it
 * so the payload can evolve without breaking app versions still in the wild.
 * Bump it on any breaking change to this interface.
 */
export const PAYLOAD_VERSION = 1;

export interface NotificationData {
  /** Payload schema version. */
  v: number;
  /** Deterministic idempotency / dedupe key. */
  kind: string;
  /** Inbox notification type used when materialising an inbox row. */
  notification_type?: NotificationType;
  /** Deep-link target route name (a RootStackParamList key). */
  route?: string;
  /** Params for routes that need them (e.g. { id } for SavingsGoal). */
  params?: Record<string, unknown>;
  /** When true the receive handler inserts/updates the local inbox row. */
  inboxInsert?: boolean;
  /** Inbox row copy (falls back to the OS notification title/body). */
  title?: string;
  body?: string;
  actionLabel?: string;
  /** Domain entity this notification tracks (bill id, goal id, …). */
  entityId?: string;
  /** Intended local fire time (ms) — lets the scheduler diff without re-deriving. */
  fireAt?: number;
  /** Marks a locally-scheduled notification owned by localPushScheduler. */
  managedBy?: 'fino-scheduler';
  /** iOS 15+ interruption level (§6.23). */
  interruptionLevel?: 'active' | 'timeSensitive' | 'passive';
  /** Optional rich-notification image (Android inline; iOS NSE deferred). */
  imageUrl?: string;
}

/**
 * Is `hour` inside the [start, end) quiet window? Handles wrap-around windows
 * (e.g. 22 → 7 spans midnight). start === end means "no quiet hours".
 */
export function isHourInQuietWindow(
  hour: number,
  start: number,
  end: number
): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
