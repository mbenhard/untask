import { z } from 'zod';

import { getRawDb } from '../db';
import type { Task } from '../db/schema';

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).default(50),
});

export const searchChatQuerySchema = z.object({
  query: z.string().min(1).max(500),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export type SearchQueryInput = z.input<typeof searchQuerySchema>;
export type SearchChatQueryInput = z.input<typeof searchChatQuerySchema>;

export type SearchResultItem = {
  id: Task['id'];
  parentId: Task['parentId'];
  title: Task['title'];
  body: Task['body'];
  status: Task['status'];
  today: boolean;
  client: Task['client'];
  priority: Task['priority'];
  dueDate: Task['dueDate'];
  snippet: string;
};

export type SearchQueryResult = {
  results: SearchResultItem[];
  total: number;
};

export type ChatSearchResultItem = {
  id: string;
  conversationId: string | null;
  conversationTitle: string;
  role: 'user' | 'assistant';
  createdAt: string | null;
  snippet: string;
};

export type SearchChatQueryResult = {
  results: ChatSearchResultItem[];
  total: number;
};

export type NoteSearchResultItem = {
  id: string;
  title: string;
  content: string;
  snippet: string;
};

const buildFtsPrefixQuery = (query: string): string =>
  query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token}"*`)
    .join(' ');

/**
 * Initialize the task FTS5 virtual table and sync triggers.
 * Drops and recreates to eliminate corruption on every app start.
 */
export function initSearchFts(): void {
  const db = getRawDb();

  db.exec('DROP TABLE IF EXISTS tasks_fts;');

  db.exec(`
    CREATE VIRTUAL TABLE tasks_fts USING fts5(
      title,
      body,
      client,
      content='tasks',
      content_rowid='rowid'
    );
  `);

  db.exec('DROP TRIGGER IF EXISTS tasks_fts_insert;');
  db.exec(`
    CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(rowid, title, body, client)
      SELECT NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.body, ''), COALESCE(NEW.client, '')
      WHERE NEW.deleted_at IS NULL;
    END;
  `);

  db.exec('DROP TRIGGER IF EXISTS tasks_fts_update;');
  db.exec(`
    CREATE TRIGGER tasks_fts_update AFTER UPDATE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, body, client)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.title, ''), COALESCE(OLD.body, ''), COALESCE(OLD.client, ''));
      INSERT INTO tasks_fts(rowid, title, body, client)
      SELECT NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.body, ''), COALESCE(NEW.client, '')
      WHERE NEW.deleted_at IS NULL;
    END;
  `);

  db.exec('DROP TRIGGER IF EXISTS tasks_fts_delete;');
  db.exec(`
    CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, body, client)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.title, ''), COALESCE(OLD.body, ''), COALESCE(OLD.client, ''));
    END;
  `);

  rebuildSearchIndex();
}

/**
 * Initialize the chat message FTS5 virtual table and sync triggers.
 * Drops and recreates to eliminate corruption on every app start.
 */
export function initChatSearchFts(): void {
  const db = getRawDb();

  db.exec('DROP TABLE IF EXISTS chat_messages_fts;');

  db.exec(`
    CREATE VIRTUAL TABLE chat_messages_fts USING fts5(
      content,
      content='chat_messages',
      content_rowid='rowid'
    );
  `);

  db.exec('DROP TRIGGER IF EXISTS chat_messages_fts_insert;');
  db.exec(`
    CREATE TRIGGER chat_messages_fts_insert AFTER INSERT ON chat_messages BEGIN
      INSERT INTO chat_messages_fts(rowid, content)
      VALUES (NEW.rowid, COALESCE(NEW.content, ''));
    END;
  `);

  db.exec('DROP TRIGGER IF EXISTS chat_messages_fts_update;');
  db.exec(`
    CREATE TRIGGER chat_messages_fts_update AFTER UPDATE ON chat_messages BEGIN
      INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.content, ''));
      INSERT INTO chat_messages_fts(rowid, content)
      VALUES (NEW.rowid, COALESCE(NEW.content, ''));
    END;
  `);

  db.exec('DROP TRIGGER IF EXISTS chat_messages_fts_delete;');
  db.exec(`
    CREATE TRIGGER chat_messages_fts_delete AFTER DELETE ON chat_messages BEGIN
      INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.content, ''));
    END;
  `);

  rebuildChatSearchIndex();
}

export function initNotesSearchFts(): void {
  const db = getRawDb();

  db.exec('DROP TABLE IF EXISTS notes_fts;');

  db.exec(`
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      title,
      content,
      content='notes',
      content_rowid='rowid'
    );
  `);

  db.exec('DROP TRIGGER IF EXISTS notes_fts_insert;');
  db.exec(`
    CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content)
      SELECT NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.content, '')
      WHERE NEW.deleted_at IS NULL;
    END;
  `);

  db.exec('DROP TRIGGER IF EXISTS notes_fts_update;');
  db.exec(`
    CREATE TRIGGER notes_fts_update AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.title, ''), COALESCE(OLD.content, ''));
      INSERT INTO notes_fts(rowid, title, content)
      SELECT NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.content, '')
      WHERE NEW.deleted_at IS NULL;
    END;
  `);

  db.exec('DROP TRIGGER IF EXISTS notes_fts_delete;');
  db.exec(`
    CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.title, ''), COALESCE(OLD.content, ''));
    END;
  `);

  rebuildNotesSearchIndex();
}

export function rebuildSearchIndex(): void {
  const db = getRawDb();
  db.exec("INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild');");

  const deletedRows = db
    .prepare('SELECT rowid, title, body, client FROM tasks WHERE deleted_at IS NOT NULL')
    .all() as Array<{
    rowid: number;
    title: string | null;
    body: string | null;
    client: string | null;
  }>;

  const deleteRow = db.prepare(
    "INSERT INTO tasks_fts(tasks_fts, rowid, title, body, client) VALUES ('delete', ?, ?, ?, ?)",
  );
  for (const row of deletedRows) {
    deleteRow.run(row.rowid, row.title ?? '', row.body ?? '', row.client ?? '');
  }
}

export function rebuildChatSearchIndex(): void {
  const db = getRawDb();
  db.exec("INSERT INTO chat_messages_fts(chat_messages_fts) VALUES ('rebuild');");
}

export function rebuildNotesSearchIndex(): void {
  const db = getRawDb();
  db.exec("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');");

  const deletedRows = db
    .prepare('SELECT rowid, title, content FROM notes WHERE deleted_at IS NOT NULL')
    .all() as Array<{
    rowid: number;
    title: string | null;
    content: string | null;
  }>;

  const deleteRow = db.prepare(
    "INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', ?, ?, ?)",
  );
  for (const row of deletedRows) {
    deleteRow.run(row.rowid, row.title ?? '', row.content ?? '');
  }
}

/**
 * Search tasks using FTS5 full-text search.
 * Returns a flat list of results. On corruption, drops and rebuilds FTS then retries once.
 */
export function searchTasks(input: SearchQueryInput): SearchQueryResult {
  const validated = searchQuerySchema.parse(input);
  const sanitized = buildFtsPrefixQuery(validated.query);

  if (sanitized.length === 0) {
    return { results: [], total: 0 };
  }

  try {
    return executeTaskSearch(sanitized, validated.limit);
  } catch {
    initSearchFts();
    return executeTaskSearch(sanitized, validated.limit);
  }
}

/**
 * Search notes using FTS5 full-text search.
 * Returns active notes only. On corruption, drops and rebuilds FTS then retries once.
 */
export function searchNotes(input: SearchQueryInput): { results: NoteSearchResultItem[]; total: number } {
  const validated = searchQuerySchema.parse(input);
  const sanitized = buildFtsPrefixQuery(validated.query);

  if (sanitized.length === 0) {
    return { results: [], total: 0 };
  }

  try {
    return executeNoteSearch(sanitized, validated.limit);
  } catch {
    initNotesSearchFts();
    return executeNoteSearch(sanitized, validated.limit);
  }
}

function executeNoteSearch(sanitized: string, limit: number): { results: NoteSearchResultItem[]; total: number } {
  const db = getRawDb();

  const rows = db
    .prepare(
      `
      SELECT
        n.id, n.title, n.content,
        snippet(notes_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet
      FROM notes_fts
      JOIN notes n ON n.rowid = notes_fts.rowid
      WHERE notes_fts MATCH ?
      AND n.status = 'active'
      AND n.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?
      `,
    )
    .all(sanitized, limit) as Array<{
    id: string;
    title: string;
    content: string;
    snippet: string;
  }>;

  const results: NoteSearchResultItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    snippet: row.snippet,
  }));

  return { results, total: results.length };
}

/**
 * Search chat history across all conversations with optional date bounds.
 */
export function searchChatMessages(input: SearchChatQueryInput): SearchChatQueryResult {
  const validated = searchChatQuerySchema.parse(input);
  const sanitized = buildFtsPrefixQuery(validated.query);

  if (sanitized.length === 0) {
    return { results: [], total: 0 };
  }

  try {
    return executeChatSearch({
      sanitized,
      limit: validated.limit,
      dateFrom: validated.dateFrom,
      dateTo: validated.dateTo,
    });
  } catch {
    initChatSearchFts();
    return executeChatSearch({
      sanitized,
      limit: validated.limit,
      dateFrom: validated.dateFrom,
      dateTo: validated.dateTo,
    });
  }
}

function executeTaskSearch(sanitized: string, limit: number): SearchQueryResult {
  const db = getRawDb();

  const rows = db
    .prepare(
      `
      SELECT
        t.id, t.parent_id, t.title, t.body, t.status, t.today, t.client, t.priority, t.due_date,
        snippet(tasks_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet
      FROM tasks_fts
      JOIN tasks t ON t.rowid = tasks_fts.rowid
      WHERE tasks_fts MATCH ?
      AND t.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?
      `,
    )
    .all(sanitized, limit) as Array<{
    id: string;
    parent_id: string | null;
    title: string;
    body: string | null;
    status: string | null;
    today: number | null;
    client: string | null;
    priority: string | null;
    due_date: string | null;
    snippet: string;
  }>;

  const results: SearchResultItem[] = rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    body: row.body,
    status: row.status as Task['status'],
    today: Boolean(row.today),
    client: row.client,
    priority: row.priority as Task['priority'],
    dueDate: row.due_date,
    snippet: row.snippet,
  }));

  return { results, total: results.length };
}

function executeChatSearch(input: {
  sanitized: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
}): SearchChatQueryResult {
  const db = getRawDb();

  const whereParts = ['chat_messages_fts MATCH ?'];
  const params: Array<string | number> = [input.sanitized];

  if (input.dateFrom) {
    whereParts.push('cm.created_at >= ?');
    params.push(input.dateFrom);
  }

  if (input.dateTo) {
    whereParts.push('cm.created_at <= ?');
    params.push(input.dateTo);
  }

  const rows = db
    .prepare(
      `
      SELECT
        cm.id,
        cm.conversation_id,
        COALESCE(c.title, 'Unknown Thread') AS conversation_title,
        cm.role,
        cm.created_at,
        snippet(chat_messages_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet
      FROM chat_messages_fts
      JOIN chat_messages cm ON cm.rowid = chat_messages_fts.rowid
      LEFT JOIN conversations c ON c.id = cm.conversation_id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY cm.created_at DESC
      LIMIT ?
      `,
    )
    .all(...params, input.limit) as Array<{
    id: string;
    conversation_id: string | null;
    conversation_title: string;
    role: string;
    created_at: string | null;
    snippet: string;
  }>;

  const results: ChatSearchResultItem[] = rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    conversationTitle: row.conversation_title,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    createdAt: row.created_at,
    snippet: row.snippet,
  }));

  return {
    results,
    total: results.length,
  };
}
