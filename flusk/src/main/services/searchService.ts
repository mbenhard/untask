import { z } from 'zod';

import { getRawDb } from '../db';
import type { Task } from '../db/schema';

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).default(50),
});

export type SearchQueryInput = z.input<typeof searchQuerySchema>;

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

/**
 * Initialize the FTS5 virtual table and sync triggers.
 * Drops and recreates to eliminate corruption on every app start.
 */
export function initSearchFts(): void {
  const db = getRawDb();

  // Drop first to eliminate any corruption
  db.exec(`DROP TABLE IF EXISTS tasks_fts;`);

  db.exec(`
    CREATE VIRTUAL TABLE tasks_fts USING fts5(
      title,
      body,
      client,
      content='tasks',
      content_rowid='rowid'
    );
  `);

  // Sync triggers — recreate to ensure they're current
  db.exec(`DROP TRIGGER IF EXISTS tasks_fts_insert;`);
  db.exec(`
    CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(rowid, title, body, client)
      VALUES (NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.body, ''), COALESCE(NEW.client, ''));
    END;
  `);

  db.exec(`DROP TRIGGER IF EXISTS tasks_fts_update;`);
  db.exec(`
    CREATE TRIGGER tasks_fts_update AFTER UPDATE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, body, client)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.title, ''), COALESCE(OLD.body, ''), COALESCE(OLD.client, ''));
      INSERT INTO tasks_fts(rowid, title, body, client)
      VALUES (NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.body, ''), COALESCE(NEW.client, ''));
    END;
  `);

  db.exec(`DROP TRIGGER IF EXISTS tasks_fts_delete;`);
  db.exec(`
    CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, body, client)
      VALUES ('delete', OLD.rowid, COALESCE(OLD.title, ''), COALESCE(OLD.body, ''), COALESCE(OLD.client, ''));
    END;
  `);

  rebuildSearchIndex();
}

/**
 * Full rebuild of the FTS index from the tasks table.
 */
export function rebuildSearchIndex(): void {
  const db = getRawDb();

  db.exec(`INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild');`);
}

/**
 * Search tasks using FTS5 full-text search.
 * Returns a flat list of results. On corruption, drops and rebuilds FTS then retries once.
 */
export function searchTasks(input: SearchQueryInput): SearchQueryResult {
  const validated = searchQuerySchema.parse(input);

  const sanitized = validated.query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token}"*`)
    .join(' ');

  if (sanitized.length === 0) {
    return { results: [], total: 0 };
  }

  try {
    return executeSearch(sanitized, validated.limit);
  } catch {
    // Corruption or malformed FTS — drop+rebuild and retry once
    initSearchFts();
    return executeSearch(sanitized, validated.limit);
  }
}

function executeSearch(sanitized: string, limit: number): SearchQueryResult {
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
