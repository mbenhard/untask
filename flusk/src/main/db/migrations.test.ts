import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
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
