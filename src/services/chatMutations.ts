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

// Strictly-monotonic timestamp source. `created_at` is the ONLY sort key the
// thread is ordered by (loadChatHistory), and a plain Date.now() hands two
// messages saved in the same millisecond identical timestamps — which then
// reorder unpredictably on reload. Clamping to a strictly-increasing value
// keeps a rapid pair (a log + its confirmation card, a question + its reply)
// in insertion order.
let lastCreatedAt = 0;
function nextCreatedAt(): number {
  const now = Date.now();
  lastCreatedAt = now > lastCreatedAt ? now : lastCreatedAt + 1;
  return lastCreatedAt;
}

/** Append one message to the thread. Watermelon auto-generates the row id. */
export async function saveChatMessage(input: NewChatMessage): Promise<void> {
  await database.write(async () => {
    await chatMessages().create((m) => {
      m.userId = input.userId;
      m.role = input.role;
      m.text = input.text;
      m.payload = input.payload ?? undefined;
      m.createdAt = nextCreatedAt();
    });
  });
}

/** How many of the most recent messages to hydrate on open. Bounds memory +
 *  render cost for long-lived threads (the screen renders them in a ScrollView,
 *  not a virtualized list). */
export const HISTORY_LIMIT = 100;

/** Load a user's most recent `HISTORY_LIMIT` messages, oldest-first for render. */
export async function loadChatHistory(
  userId: string
): Promise<ChatMessageModel[]> {
  const recent = await chatMessages()
    .query(
      Q.where('user_id', userId),
      Q.sortBy('created_at', Q.desc),
      Q.take(HISTORY_LIMIT)
    )
    .fetch();
  return recent.reverse();
}

/** Wipe a user's entire chat history (handy when re-testing the UI). */
export async function clearChatHistory(userId: string): Promise<void> {
  const rows = await chatMessages().query(Q.where('user_id', userId)).fetch();
  if (rows.length === 0) return;
  await database.write(async () => {
    await database.batch(...rows.map((r) => r.prepareDestroyPermanently()));
  });
}
