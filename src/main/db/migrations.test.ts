import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

const executeMigrationFile = (sqlite: Database.Database, relativePath: string): void => {
  const sql = readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    sqlite.exec(statement);
  }
};

const executeMigrationsUpTo = (sqlite: Database.Database, maxFileName: string): void => {
  const files = readdirSync(path.resolve(process.cwd(), 'drizzle'))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => file <= maxFileName);

  for (const file of files) {
    executeMigrationFile(sqlite, `drizzle/${file}`);
  }
};

describeIfNativeSqlite('drizzle migration 0001_task_integrity_memory_audit', () => {
  it('repairs orphaned subtasks and logs repair events', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = OFF');

    executeMigrationFile(sqlite, 'drizzle/0000_parched_otto_octavius.sql');

    sqlite
      .prepare(
        `
          INSERT INTO tasks (
            id, parent_id, title, status, priority, today, effort, "order", created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        'child-orphan',
        'missing-parent',
        'Orphan child',
        'active',
        'none',
        0,
        'unknown',
        0,
        new Date().toISOString(),
      );

    executeMigrationFile(sqlite, 'drizzle/0001_task_integrity_memory_audit.sql');

    const orphanCount = sqlite
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks t
          LEFT JOIN tasks p ON p.id = t.parent_id
          WHERE t.parent_id IS NOT NULL
            AND p.id IS NULL
        `,
      )
      .get() as { count: number };

    const repairedParent = sqlite
      .prepare('SELECT parent_id FROM tasks WHERE id = ?')
      .get('child-orphan') as { parent_id: string | null } | undefined;

    const repairEvents = sqlite
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM task_events
          WHERE task_id = ?
            AND action = 'update'
        `,
      )
      .get('child-orphan') as { count: number };

    expect(orphanCount.count).toBe(0);
    expect(repairedParent?.parent_id ?? null).toBeNull();
    expect(repairEvents.count).toBeGreaterThan(0);

    sqlite.close();
  });
});

describeIfNativeSqlite('drizzle migration 0011_add_soft_delete_columns', () => {
  it('adds deleted_at columns and indexes without dropping existing data', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    executeMigrationsUpTo(sqlite, '0010_add_notes_is_pinned.sql');

    sqlite
      .prepare(
        `
          INSERT INTO tasks (id, title, status, "order", created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run('task-before-0011', 'Task before migration', 'active', 0, new Date().toISOString());

    sqlite
      .prepare(
        `
          INSERT INTO notes (id, title, content, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        'note-before-0011',
        'Note before migration',
        'hello',
        'active',
        new Date().toISOString(),
        new Date().toISOString(),
      );

    executeMigrationFile(sqlite, 'drizzle/0011_add_soft_delete_columns.sql');

    const taskColumns = sqlite
      .prepare(`PRAGMA table_info('tasks')`)
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const noteColumns = sqlite
      .prepare(`PRAGMA table_info('notes')`)
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const taskIndexes = sqlite
      .prepare(`PRAGMA index_list('tasks')`)
      .all() as Array<{ name: string }>;
    const noteIndexes = sqlite
      .prepare(`PRAGMA index_list('notes')`)
      .all() as Array<{ name: string }>;

    expect(taskColumns.some((column) => column.name === 'deleted_at' && column.type === 'TEXT')).toBe(
      true,
    );
    expect(noteColumns.some((column) => column.name === 'deleted_at' && column.type === 'TEXT')).toBe(
      true,
    );
    expect(taskIndexes.some((index) => index.name === 'tasks_deleted_at_idx')).toBe(true);
    expect(noteIndexes.some((index) => index.name === 'notes_deleted_at_idx')).toBe(true);

    const taskRow = sqlite
      .prepare(`SELECT id, deleted_at FROM tasks WHERE id = ?`)
      .get('task-before-0011') as { id: string; deleted_at: string | null } | undefined;
    const noteRow = sqlite
      .prepare(`SELECT id, deleted_at FROM notes WHERE id = ?`)
      .get('note-before-0011') as { id: string; deleted_at: string | null } | undefined;

    expect(taskRow?.id).toBe('task-before-0011');
    expect(taskRow?.deleted_at ?? null).toBeNull();
    expect(noteRow?.id).toBe('note-before-0011');
    expect(noteRow?.deleted_at ?? null).toBeNull();

    sqlite.close();
  });
});
