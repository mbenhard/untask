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
  completeTask,
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  undoLastUserTaskEvent,
} from './taskService';

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

describeIfNativeSqlite('taskService hierarchy integrity', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle({ client: sqlite, schema });
    runSqlMigrations(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it('rejects deleting a parent with active subtasks unless cascade is true', () => {
    const parent = createTask({ title: 'Parent task', status: 'active' });
    createTask({ title: 'Child task', parentId: parent.id, status: 'active' });

    expect(() => deleteTask(parent.id)).toThrow(/active subtask/i);
    expect(getTaskById(parent.id)).not.toBeNull();
  });

  it('deletes descendant subtasks when cascade is true', () => {
    const parent = createTask({ title: 'Parent task', status: 'active' });
    const child = createTask({ title: 'Child task', parentId: parent.id, status: 'active' });

    deleteTask(parent.id, 'user', { cascade: true });

    expect(getTaskById(parent.id)).toBeNull();
    expect(getTaskById(child.id)).toBeNull();
  });

  it('soft-deletes rows and undo clears deleted_at on the same task id', () => {
    const task = createTask({ title: 'Recoverable task', status: 'active' });

    deleteTask(task.id);
    expect(getTaskById(task.id)).toBeNull();

    const deletedRow = sqlite
      .prepare('SELECT id, deleted_at FROM tasks WHERE id = ?')
      .get(task.id) as { id: string; deleted_at: string | null } | undefined;
    expect(deletedRow?.id).toBe(task.id);
    expect(deletedRow?.deleted_at).not.toBeNull();

    const undoResult = undoLastUserTaskEvent();
    expect(undoResult?.undone).toBe(true);
    expect(getTaskById(task.id)).not.toBeNull();

    const restoredRow = sqlite
      .prepare('SELECT deleted_at FROM tasks WHERE id = ?')
      .get(task.id) as { deleted_at: string | null } | undefined;
    expect(restoredRow?.deleted_at).toBeNull();
  });

  it('reparents completed subtasks when deleting parent without cascade', () => {
    const parent = createTask({ title: 'Parent task', status: 'active' });
    const child = createTask({ title: 'Child task', parentId: parent.id, status: 'done' });

    deleteTask(parent.id);

    const persistedChild = getTaskById(child.id);
    expect(persistedChild).not.toBeNull();
    expect(persistedChild?.parentId).toBeNull();
  });

  it('rejects completing parent with active subtasks unless completeChildren is true', () => {
    const parent = createTask({ title: 'Parent task', status: 'active' });
    const child = createTask({ title: 'Child task', parentId: parent.id, status: 'active' });

    expect(() => completeTask(parent.id)).toThrow(/active subtask/i);

    completeTask(parent.id, 'user', { completeChildren: true });

    expect(getTaskById(parent.id)?.status).toBe('done');
    expect(getTaskById(child.id)?.status).toBe('done');
  });

  it('undos completeChildren atomically for descendants', () => {
    const parent = createTask({ title: 'Parent task', status: 'active' });
    const childA = createTask({ title: 'Child A', parentId: parent.id, status: 'active' });
    const childB = createTask({ title: 'Child B', parentId: parent.id, status: 'active' });

    completeTask(parent.id, 'user', { completeChildren: true });

    expect(getTaskById(parent.id)?.status).toBe('done');
    expect(getTaskById(childA.id)?.status).toBe('done');
    expect(getTaskById(childB.id)?.status).toBe('done');

    const undoResult = undoLastUserTaskEvent();
    expect(undoResult?.undone).toBe(true);
    expect(undoResult?.originalAction).toBe('complete');

    expect(getTaskById(parent.id)?.status).toBe('active');
    expect(getTaskById(childA.id)?.status).toBe('active');
    expect(getTaskById(childB.id)?.status).toBe('active');
  });
});

describeIfNativeSqlite('taskService SQL filtering', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle({ client: sqlite, schema });
    runSqlMigrations(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it('applies client/search/limit filters in listTasks', () => {
    createTask({
      title: 'Send invoice follow-up',
      status: 'active',
      client: 'Acme Corp',
      order: 0,
    });
    createTask({
      title: 'Draft meeting agenda',
      status: 'active',
      client: 'Acme Corp',
      order: 1,
    });
    createTask({
      title: 'Send invoice reminder',
      status: 'active',
      client: 'Beta LLC',
      order: 2,
    });

    const results = listTasks({
      client: 'acme',
      search: 'invoice',
      limit: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.client).toBe('Acme Corp');
    expect(results[0]?.title.toLowerCase()).toContain('invoice');
  });
});
