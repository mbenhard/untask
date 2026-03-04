import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import * as schema from '../db/schema';

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;

vi.mock('../db', () => ({
  getDb: () => db,
}));

import {
  getAttachmentCountsByTaskIds,
  getAttachmentsByTaskId,
} from './attachmentService';

const hasNativeSqlite = (() => {
  try {
    const probe = new Database(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
})();
const describeIfNativeSqlite = hasNativeSqlite ? describe : describe.skip;

const runSqlMigrations = (sqliteDb: Database.Database): void => {
  const migrationsDir = path.resolve(process.cwd(), 'drizzle');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const fileName of migrationFiles) {
    const raw = readFileSync(path.join(migrationsDir, fileName), 'utf8');
    const statements = raw
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      sqliteDb.exec(statement);
    }
  }
};

describeIfNativeSqlite('attachmentService task visibility filters', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle({ client: sqlite, schema });
    runSqlMigrations(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it('omits attachments for soft-deleted tasks in list/count queries', () => {
    const now = new Date().toISOString();
    const deletedAt = new Date(Date.now() - 60_000).toISOString();

    sqlite
      .prepare(
        `INSERT INTO tasks (id, title, status, "order", created_at, deleted_at, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('task-active', 'Active task', 'active', 0, now, null, '[]');
    sqlite
      .prepare(
        `INSERT INTO tasks (id, title, status, "order", created_at, deleted_at, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('task-deleted', 'Deleted task', 'active', 1, now, deletedAt, '[]');

    sqlite
      .prepare(
        `INSERT INTO attachments (id, task_id, stored_name, original_name, size, mime_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('att-active', 'task-active', 'active.png', 'active.png', 123, 'image/png', now);
    sqlite
      .prepare(
        `INSERT INTO attachments (id, task_id, stored_name, original_name, size, mime_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('att-deleted', 'task-deleted', 'deleted.png', 'deleted.png', 123, 'image/png', now);

    const activeAttachments = getAttachmentsByTaskId('task-active');
    const deletedAttachments = getAttachmentsByTaskId('task-deleted');
    const counts = getAttachmentCountsByTaskIds(['task-active', 'task-deleted']);

    expect(activeAttachments).toHaveLength(1);
    expect(activeAttachments[0]?.id).toBe('att-active');
    expect(deletedAttachments).toHaveLength(0);
    expect(counts.get('task-active')).toBe(1);
    expect(counts.has('task-deleted')).toBe(false);
  });
});
