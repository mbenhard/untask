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
  getMemoryState,
  listMemoryEvents,
  undoMemoryEvents,
  writeMemoryLayerValue,
} from './memoryService';

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

describeIfNativeSqlite('memoryService audit log', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle({ client: sqlite, schema });
    runSqlMigrations(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it('writes layer values and records memory events', () => {
    writeMemoryLayerValue('profile', '- prefers concise updates', 'user');

    const state = getMemoryState();
    const events = listMemoryEvents({ layer: 'profile', limit: 5 });

    expect(state.profile).toContain('prefers concise updates');
    expect(events).toHaveLength(1);
    expect(events[0]?.before).toBe('');
    expect(events[0]?.after).toContain('prefers concise updates');
    expect(events[0]?.source).toBe('user');
  });

  it('undoes the latest memory event by steps', () => {
    writeMemoryLayerValue('patterns', '- plans week on Monday', 'ai');
    writeMemoryLayerValue('patterns', '- plans week on Monday\n- blocks deep work', 'ai');

    const undoResult = undoMemoryEvents({ steps: 1 });

    expect(undoResult.revertedEventIds).toHaveLength(1);
    expect(getMemoryState().patterns).toBe('- plans week on Monday');
  });

  it('undoes a targeted memory event by id', () => {
    const first = writeMemoryLayerValue('soul', 'Direct and concise', 'user');
    writeMemoryLayerValue('soul', 'Direct, concise, and proactive', 'user');

    const initialEventId = first.event?.id;
    expect(initialEventId).toBeTruthy();

    undoMemoryEvents({ eventId: initialEventId });

    expect(getMemoryState().soul).toBe('');
  });
});
