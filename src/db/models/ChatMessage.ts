import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export type ChatRole = 'user' | 'ai';

/**
 * Local-only chat history row for the Fino chatbot.
 *
 * NOT synced to Supabase — `chat_messages` is intentionally absent from
 * SYNCED_TABLES in src/services/watermelonSync.ts, so conversations live on
 * the device only. That's why there's no updated_at/deleted_at here (those
 * exist purely to serve the sync engine, which never touches this table).
 */
export default class ChatMessage extends Model {
  static table = 'chat_messages';

  @text('user_id') userId!: string;

  // 'user' for the person, 'ai' for Fino.
  @text('role') role!: ChatRole;

  // The bubble text. Empty string for card-only messages (e.g. the
  // "Transaction Logged" confirmation), whose data lives in `payload`.
  @text('text') text!: string;

  // JSON blob for non-text message shapes (currently the TxConfirmCard's
  // txData). Null/undefined for plain text messages.
  @text('payload') payload?: string;

  // Epoch ms — drives chronological ordering of the thread.
  @field('created_at') createdAt!: number;
}
