import { Q } from '@nozbe/watermelondb';

import { database } from '../db';
import type ChatMessageModel from '../db/models/ChatMessage';
import type { ChatRole } from '../db/models/ChatMessage';

/**
 * Persistence helpers for the offline Fino chatbot's local-only history.
 *
 * `chat_messages` is intentionally absent from SYNCED_TABLES
 * (src/services/watermelonSync.ts), so nothing written here ever reaches
 * Supabase — there's no background sync to trigger. Screens go through these
 * helpers rather than calling `database.write` directly (per CLAUDE.md).
 */

const chatMessages = () => database.get<ChatMessageModel>('chat_messages');

export type NewChatMessage = {
  userId: string;
  role: ChatRole;
  text: string;
  /** Pre-serialized JSON for card messages (e.g. TxConfirmCard data). */
  payload?: string | null;
};

/** Append one message to the thread. Watermelon auto-generates the row id. */
export async function saveChatMessage(input: NewChatMessage): Promise<void> {
  await database.write(async () => {
    await chatMessages().create((m) => {
      m.userId = input.userId;
      m.role = input.role;
      m.text = input.text;
      m.payload = input.payload ?? undefined;
      m.createdAt = Date.now();
    });
  });
}

/** Load a user's full thread, oldest first. */
export async function loadChatHistory(
  userId: string
): Promise<ChatMessageModel[]> {
  return chatMessages()
    .query(Q.where('user_id', userId), Q.sortBy('created_at', Q.asc))
    .fetch();
}

/** Wipe a user's entire chat history (handy when re-testing the UI). */
export async function clearChatHistory(userId: string): Promise<void> {
  const rows = await chatMessages().query(Q.where('user_id', userId)).fetch();
  if (rows.length === 0) return;
  await database.write(async () => {
    await database.batch(...rows.map((r) => r.prepareDestroyPermanently()));
  });
}
