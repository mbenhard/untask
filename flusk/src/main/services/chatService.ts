import { asc } from 'drizzle-orm';

import { getDb } from '../db';
import { chatMessages, type ChatMessage, type NewChatMessage } from '../db/schema';

export function getChatHistory(): ChatMessage[] {
  const db = getDb();
  return db.select().from(chatMessages).orderBy(asc(chatMessages.createdAt)).all();
}

export function saveChatMessage(message: Omit<NewChatMessage, 'id' | 'createdAt'>): ChatMessage {
  const db = getDb();
  const [created] = db.insert(chatMessages).values(message).returning().all();
  return created;
}

export function clearChatHistory(): void {
  const db = getDb();
  db.delete(chatMessages).run();
}
