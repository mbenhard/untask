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

describeIfNativeSqlite('drizzle migration 0013_add_attachments_table', () => {
  it('creates attachments table with correct columns and index', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    executeMigrationsUpTo(sqlite, '0013_add_attachments_table.sql');

    // Verify table exists with correct columns
    const columns = sqlite
      .prepare(`PRAGMA table_info('attachments')`)
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>;

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('task_id');
    expect(columnNames).toContain('stored_name');
    expect(columnNames).toContain('original_name');
    expect(columnNames).toContain('size');
    expect(columnNames).toContain('mime_type');
    expect(columnNames).toContain('created_at');

    // Verify PK
    const pkCol = columns.find((c) => c.name === 'id');
    expect(pkCol?.pk).toBe(1);

    // Verify NOT NULL constraints
    expect(columns.find((c) => c.name === 'task_id')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'stored_name')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'original_name')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'size')?.notnull).toBe(1);

    // Verify index exists
    const indexes = sqlite
      .prepare(`PRAGMA index_list('attachments')`)
      .all() as Array<{ name: string }>;
    expect(indexes.some((i) => i.name === 'attachments_task_id_idx')).toBe(true);

    // Verify FK cascade - insert a task, then an attachment, delete task, attachment should cascade
    const now = new Date().toISOString();
    sqlite
      .prepare(`INSERT INTO tasks (id, title, status, "order", created_at) VALUES (?, ?, ?, ?, ?)`)
      .run('test-task', 'Test', 'active', 0, now);
    sqlite
      .prepare(
        `INSERT INTO attachments (id, task_id, stored_name, original_name, size, mime_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('att-1', 'test-task', 'abc123.pdf', 'report.pdf', 12345, 'application/pdf', now);

    sqlite.prepare(`DELETE FROM tasks WHERE id = ?`).run('test-task');

    const remaining = sqlite
      .prepare(`SELECT COUNT(*) as count FROM attachments WHERE task_id = ?`)
      .get('test-task') as { count: number };
    expect(remaining.count).toBe(0);

    sqlite.close();
  });
});

describeIfNativeSqlite('attachment data migration (post-0013)', () => {
  it('extracts file/image blocks from task bodies into attachments table', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    executeMigrationsUpTo(sqlite, '0013_add_attachments_table.sql');

    const now = new Date().toISOString();

    // Task with mixed body: text + image + file blocks
    const mixedBody = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
      { type: 'image', props: { url: 'untask-file://abc123.png' } },
      { type: 'file', props: { url: 'untask-file://def456.pdf' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'More text' }] },
    ]);

    // Task with only file blocks (body should become null)
    const fileOnlyBody = JSON.stringify([
      { type: 'image', props: { url: 'untask-file://ghi789.jpg' } },
    ]);

    // Task with no file blocks (should be unchanged)
    const textOnlyBody = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Just text' }] },
    ]);

    sqlite
      .prepare(
        `INSERT INTO tasks (id, title, body, status, "order", created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('task-mixed', 'Mixed', mixedBody, 'active', 0, now);
    sqlite
      .prepare(
        `INSERT INTO tasks (id, title, body, status, "order", created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('task-file-only', 'File only', fileOnlyBody, 'active', 1, now);
    sqlite
      .prepare(
        `INSERT INTO tasks (id, title, body, status, "order", created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('task-text-only', 'Text only', textOnlyBody, 'active', 2, now);

    // Simulate the migration logic (we can't import the actual function in test
    // because it depends on electron app, but we test the SQL patterns)

    // Verify attachments table is empty before migration
    const beforeCount = sqlite
      .prepare(`SELECT COUNT(*) as count FROM attachments`)
      .get() as { count: number };
    expect(beforeCount.count).toBe(0);

    // Manually simulate what migrateAttachments.ts does:
    // 1. Parse body, find file/image blocks
    // 2. Insert into attachments table
    // 3. Update body to remove file/image blocks
    const allTasks = sqlite
      .prepare(`SELECT id, body FROM tasks WHERE body IS NOT NULL`)
      .all() as Array<{ id: string; body: string }>;

    for (const task of allTasks) {
      const blocks = JSON.parse(task.body) as Array<{
        type?: string;
        props?: { url?: string };
        content?: Array<{ type?: string; text?: string }>;
      }>;
      const fileBlocks = blocks.filter(
        (b) => b.type === 'image' || b.type === 'file',
      );

      if (fileBlocks.length === 0) continue;

      for (const block of fileBlocks) {
        const url = block.props?.url ?? '';
        const storedName = url.replace('untask-file://', '');
        sqlite
          .prepare(
            `INSERT INTO attachments (id, task_id, stored_name, original_name, size, mime_type, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            crypto.randomUUID(),
            task.id,
            storedName,
            storedName,
            0,
            null,
            now,
          );
      }

      const remaining = blocks.filter(
        (b) => b.type !== 'image' && b.type !== 'file',
      );
      const isEmpty = remaining.every((b) => {
        if (b.type !== 'paragraph') return false;
        if (!b.content || b.content.length === 0) return true;
        return b.content.every(
          (c) => c.type === 'text' && (!c.text || c.text.trim() === ''),
        );
      });

      sqlite
        .prepare(`UPDATE tasks SET body = ? WHERE id = ?`)
        .run(isEmpty ? null : JSON.stringify(remaining), task.id);
    }

    // Verify: 3 attachments created
    const afterCount = sqlite
      .prepare(`SELECT COUNT(*) as count FROM attachments`)
      .get() as { count: number };
    expect(afterCount.count).toBe(3);

    // Verify: task-mixed body has 2 text blocks, no file/image blocks
    const mixedTask = sqlite
      .prepare(`SELECT body FROM tasks WHERE id = ?`)
      .get('task-mixed') as { body: string };
    const mixedBlocks = JSON.parse(mixedTask.body) as Array<{
      type?: string;
    }>;
    expect(mixedBlocks.length).toBe(2);
    expect(mixedBlocks.every((b) => b.type === 'paragraph')).toBe(true);

    // Verify: task-file-only body is null
    const fileOnlyTask = sqlite
      .prepare(`SELECT body FROM tasks WHERE id = ?`)
      .get('task-file-only') as { body: string | null };
    expect(fileOnlyTask.body).toBeNull();

    // Verify: task-text-only body unchanged
    const textOnlyTask = sqlite
      .prepare(`SELECT body FROM tasks WHERE id = ?`)
      .get('task-text-only') as { body: string };
    expect(textOnlyTask.body).toBe(textOnlyBody);

    sqlite.close();
  });
});

describeIfNativeSqlite('drizzle migration 0012_replace_client_with_tags', () => {
  it('converts client values to tags arrays and drops client column', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    executeMigrationsUpTo(sqlite, '0011_add_soft_delete_columns.sql');

    // Insert tasks with various client values
    const insert = sqlite.prepare(
      `INSERT INTO tasks (id, title, status, client, "order", created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    insert.run('task-with-client', 'Has client', 'active', 'Acme Corp', 0, now);
    insert.run('task-empty-client', 'Empty client', 'active', '', 0, now);
    insert.run('task-null-client', 'Null client', 'active', null, 0, now);

    executeMigrationFile(sqlite, 'drizzle/0012_replace_client_with_tags.sql');

    // Verify tags column exists and client column is gone
    const columns = sqlite
      .prepare(`PRAGMA table_info('tasks')`)
      .all() as Array<{ name: string }>;
    expect(columns.some((c) => c.name === 'tags')).toBe(true);
    expect(columns.some((c) => c.name === 'client')).toBe(false);

    // Verify data migration
    const withClient = sqlite
      .prepare(`SELECT tags FROM tasks WHERE id = ?`)
      .get('task-with-client') as { tags: string };
    const emptyClient = sqlite
      .prepare(`SELECT tags FROM tasks WHERE id = ?`)
      .get('task-empty-client') as { tags: string };
    const nullClient = sqlite
      .prepare(`SELECT tags FROM tasks WHERE id = ?`)
      .get('task-null-client') as { tags: string };

    expect(JSON.parse(withClient.tags)).toEqual(['acme corp']);
    expect(JSON.parse(emptyClient.tags)).toEqual([]);
    expect(JSON.parse(nullClient.tags)).toEqual([]);

    sqlite.close();
  });

  it('drops legacy task FTS triggers before dropping client column', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    executeMigrationsUpTo(sqlite, '0011_add_soft_delete_columns.sql');

    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO tasks (id, title, status, client, "order", created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('task-with-client-and-trigger', 'Has trigger', 'active', 'Acme Corp', 0, now);

    // Recreate a pre-0012 style FTS table + trigger that references NEW.client.
    sqlite.exec(`
      CREATE VIRTUAL TABLE tasks_fts USING fts5(
        title,
        body,
        client,
        content='tasks',
        content_rowid='rowid'
      );
    `);
    sqlite.exec(`
      CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts(rowid, title, body, client)
        SELECT NEW.rowid, COALESCE(NEW.title, ''), COALESCE(NEW.body, ''), COALESCE(NEW.client, '')
        WHERE NEW.deleted_at IS NULL;
      END;
    `);

    expect(() => executeMigrationFile(sqlite, 'drizzle/0012_replace_client_with_tags.sql')).not.toThrow();

    const columns = sqlite
      .prepare(`PRAGMA table_info('tasks')`)
      .all() as Array<{ name: string }>;
    expect(columns.some((c) => c.name === 'client')).toBe(false);
    expect(columns.some((c) => c.name === 'tags')).toBe(true);

    const triggerRows = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'tasks_fts_%'`)
      .all() as Array<{ name: string }>;
    expect(triggerRows).toHaveLength(0);

    sqlite.close();
  });
});
