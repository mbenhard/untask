import { asc, desc, eq, isNull, lt } from 'drizzle-orm';

import { getDb, getRawDb } from '../db';
import {
  chatMessages,
  conversations,
  settings,
  type ChatMessage,
  type Conversation,
  type NewChatMessage,
  type NewConversation,
} from '../db/schema';
import { SETTING_KEY_CHAT_RETENTION_MODE } from '../defaultSettings';

export type ChatRetentionMode = 'session' | '30d' | 'forever';

export type ListConversationsInput = {
  includeArchived?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  isAutoTitle: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  messageCount: number;
};

export type ListConversationsResult = {
  conversations: ConversationSummary[];
  total: number;
};

const CHAT_RETENTION_MODE_SETTING_KEY = SETTING_KEY_CHAT_RETENTION_MODE;
const SESSION_STARTED_AT = new Date().toISOString();
export const DEFAULT_CONVERSATION_TITLE = 'New Thread';

const resolveRetentionMode = (value: string | null): ChatRetentionMode => {
  if (value === 'session' || value === '30d' || value === 'forever') {
    return value;
  }
  return '30d';
};

const sanitizePagination = (value: number | undefined, fallback: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(max, Math.floor(value)));
};

const sanitizeSearchTerm = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const buildConversationSearchFilter = (search: string): string =>
  `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;

const nowIso = (): string => new Date().toISOString();

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

export function createConversation(
  input: {
    title?: string;
    isAutoTitle?: boolean;
  } = {},
): Conversation {
  const db = getDb();
  const createdAt = nowIso();
  const values: NewConversation = {
    title: input.title?.trim().length ? input.title.trim() : DEFAULT_CONVERSATION_TITLE,
    isAutoTitle: input.isAutoTitle ?? !input.title,
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
  };

  const [created] = db.insert(conversations).values(values).returning().all();
  return created;
}

export function getConversationById(conversationId: string): Conversation | null {
  const db = getDb();
  const [row] = db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
    .all();

  return row ?? null;
}

export function listConversations(
  input: ListConversationsInput = {},
): ListConversationsResult {
  sweepChatRetention();

  const includeArchived = input.includeArchived === true;
  const search = sanitizeSearchTerm(input.search);
  const limit = Math.max(1, sanitizePagination(input.limit, 20, 100));
  const offset = sanitizePagination(input.offset, 0, 10_000);

  const whereFragments: string[] = [];
  const whereParams: string[] = [];

  if (!includeArchived) {
    whereFragments.push('c.archived_at IS NULL');
  }

  if (search.length > 0) {
    whereFragments.push("LOWER(c.title) LIKE ? ESCAPE '\\'");
    whereParams.push(buildConversationSearchFilter(search));
  }

  const whereSql = whereFragments.length > 0 ? `WHERE ${whereFragments.join(' AND ')}` : '';
  const rawDb = getRawDb();

  const rows = rawDb
    .prepare(
      `
      SELECT
        c.id,
        c.title,
        c.is_auto_title,
        c.created_at,
        c.updated_at,
        c.archived_at,
        COUNT(m.id) AS message_count
      FROM conversations c
      LEFT JOIN chat_messages m ON m.conversation_id = c.id
      ${whereSql}
      GROUP BY c.id
      ORDER BY COALESCE(c.updated_at, c.created_at) DESC
      LIMIT ? OFFSET ?
      `,
    )
    .all(...whereParams, limit, offset) as Array<{
    id: string;
    title: string;
    is_auto_title: number | null;
    created_at: string | null;
    updated_at: string | null;
    archived_at: string | null;
    message_count: number;
  }>;

  const countRow = rawDb
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM conversations c
      ${whereSql}
      `,
    )
    .get(...whereParams) as { total: number };

  return {
    conversations: rows.map((row) => ({
      id: row.id,
      title: row.title,
      isAutoTitle: row.is_auto_title !== 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
      messageCount: Number(row.message_count ?? 0),
    })),
    total: Number(countRow.total ?? 0),
  };
}

export function getMostRecentConversation(
  includeArchived = false,
): Conversation | null {
  sweepChatRetention();

  const db = getDb();
  const rows = includeArchived
    ? db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt))
        .limit(1)
        .all()
    : db
        .select()
        .from(conversations)
        .where(isNull(conversations.archivedAt))
        .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt))
        .limit(1)
        .all();

  return rows[0] ?? null;
}

export function archiveConversation(conversationId: string): Conversation | null {
  const db = getDb();
  const timestamp = nowIso();
  const [updated] = db
    .update(conversations)
    .set({ archivedAt: timestamp, updatedAt: timestamp })
    .where(eq(conversations.id, conversationId))
    .returning()
    .all();

  return updated ?? null;
}

export function deleteConversation(conversationId: string): void {
  const db = getDb();
  db.delete(conversations).where(eq(conversations.id, conversationId)).run();
}

export function ensureConversation(conversationId?: string | null): Conversation {
  if (conversationId) {
    const existing = getConversationById(conversationId);
    if (existing) {
      return existing;
    }
  }

  const latest = getMostRecentConversation(false);
  if (latest) {
    return latest;
  }

  return createConversation();
}

export function getConversationMessages(conversationId: string): ChatMessage[] {
  const db = getDb();
  sweepChatRetention();
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .all();
}

export function getRecentConversationMessages(
  conversationId: string,
  limit = 12,
): ChatMessage[] {
  const db = getDb();
  sweepChatRetention();

  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(boundedLimit)
    .all();

  return rows.reverse();
}

export function getConversationMessageCount(conversationId: string): number {
  const rawDb = getRawDb();
  const row = rawDb
    .prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE conversation_id = ?')
    .get(conversationId) as { count: number };

  return Number(row.count ?? 0);
}

const touchConversation = (
  conversationId: string,
  updatedAt: string,
  options: { unarchive?: boolean } = {},
): void => {
  const db = getDb();
  db.update(conversations)
    .set({
      updatedAt,
      ...(options.unarchive ? { archivedAt: null } : {}),
    })
    .where(eq(conversations.id, conversationId))
    .run();
};

export function saveChatMessage(
  message: Omit<NewChatMessage, 'id' | 'createdAt'> & { conversationId: string },
): ChatMessage {
  const db = getDb();
  sweepChatRetention();

  const conversation = getConversationById(message.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${message.conversationId}`);
  }

  const [created] = db.insert(chatMessages).values(message).returning().all();
  touchConversation(message.conversationId, created.createdAt ?? nowIso(), {
    unarchive: true,
  });
  return created;
}

export function setConversationTitle(
  conversationId: string,
  title: string,
  isAutoTitle: boolean,
): Conversation | null {
  const normalizedTitle = title.trim();
  if (normalizedTitle.length === 0) {
    return null;
  }

  const db = getDb();
  const [updated] = db
    .update(conversations)
    .set({
      title: normalizedTitle,
      isAutoTitle,
      updatedAt: nowIso(),
    })
    .where(eq(conversations.id, conversationId))
    .returning()
    .all();

  return updated ?? null;
}

export function canAutoTitleConversation(conversationId: string): boolean {
  const conversation = getConversationById(conversationId);
  if (!conversation) {
    return false;
  }

  if (conversation.archivedAt) {
    return false;
  }

  if (conversation.isAutoTitle === false) {
    return false;
  }

  return conversation.title.trim().toLowerCase() === DEFAULT_CONVERSATION_TITLE.toLowerCase();
}

// Back-compat helpers while renderer/main complete thread migration.
export function getChatHistory(): ChatMessage[] {
  const latest = getMostRecentConversation(false);
  if (!latest) {
    return [];
  }

  return getConversationMessages(latest.id);
}

export function getRecentChatMessages(limit = 12): ChatMessage[] {
  const latest = getMostRecentConversation(false);
  if (!latest) {
    return [];
  }

  return getRecentConversationMessages(latest.id, limit);
}

export function clearChatHistory(): void {
  const db = getDb();
  db.delete(chatMessages).run();
}
