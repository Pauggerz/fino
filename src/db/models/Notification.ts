import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export type NotificationType =
  | 'warning'
  | 'tip'
  | 'insight'
  | 'reminder'
  | 'achievement';

export default class Notification extends Model {
  static table = 'notifications';

  @text('user_id') userId!: string;

  // Stable dedupe key — e.g. "overspend:Shopping:2026-05", "no-tx-2d:2026-05-15".
  // Insight generator skips inserting if a row with the same kind already exists
  // (and is still unread/undismissed) so we don't repeat the same warning hourly.
  @text('kind') kind!: string;

  @text('type') type!: NotificationType;

  @text('title') title!: string;

  @text('message') message!: string;

  @text('action_route') actionRoute?: string;

  @text('action_label') actionLabel?: string;

  @field('is_read') isRead!: boolean;

  @field('is_dismissed') isDismissed!: boolean;

  // Snooze (§6.25): epoch ms until which this row is hidden from the inbox.
  // A one-off local notification re-surfaces it when the time arrives.
  @field('snoozed_until') snoozedUntil?: number;

  @field('created_at') createdAt!: number;
}
