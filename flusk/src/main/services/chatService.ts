import { asc, desc, eq, lt } from 'drizzle-orm';

import { getDb } from '../db';
import {
  chatMessages,
  settings,
  type ChatMessage,
  type NewChatMessage,
} from '../db/schema';

export type ChatRetentionMode = 'session' | '30d' | 'forever';

const CHAT_RETENTION_MODE_SETTING_KEY = 'chat_retention_mode';
const SESSION_STARTED_AT = new Date().toISOString();

const resolveRetentionMode = (value: string | null): ChatRetentionMode => {
  if (value === 'session' || value === '30d' || value === 'forever') {
    return value;
  }
  return '30d';
};

export function getChatRetentionMode(): ChatRetentionMode {
  const db = getDb();
  const [row] = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, CHAT_RETENTION_MODE_SETTING_KEY))
    .all();

  return resolveRetentionMode(row?.value ?? null);
}

export function setChatRetentionMode(mode: ChatRetentionMode): ChatRetentionMode {
  const db = getDb();

  db.insert(settings)
    .values({ key: CHAT_RETENTION_MODE_SETTING_KEY, value: mode })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: mode },
    })
    .run();

  return mode;
}

export function sweepChatRetention(): number {
  const db = getDb();
  const mode = getChatRetentionMode();

  if (mode === 'forever') {
    return 0;
  }

  const threshold =
    mode === 'session'
      ? SESSION_STARTED_AT
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const result = db.delete(chatMessages).where(lt(chatMessages.createdAt, threshold)).run();
  return result.changes;
}

export function getChatHistory(): ChatMessage[] {
  const db = getDb();
  sweepChatRetention();
  return db.select().from(chatMessages).orderBy(asc(chatMessages.createdAt)).all();
}

export function getRecentChatMessages(limit = 12): ChatMessage[] {
  const db = getDb();
  sweepChatRetention();

  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = db
    .select()
    .from(chatMessages)
    .orderBy(desc(chatMessages.createdAt))
    .limit(boundedLimit)
    .all();

  return rows.reverse();
}

export function saveChatMessage(message: Omit<NewChatMessage, 'id' | 'createdAt'>): ChatMessage {
  const db = getDb();
  sweepChatRetention();
  const [created] = db.insert(chatMessages).values(message).returning().all();
  return created;
}

export function clearChatHistory(): void {
  const db = getDb();
  db.delete(chatMessages).run();
}
