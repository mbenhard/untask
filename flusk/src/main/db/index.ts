import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import * as schema from './schema';

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'flusk.db');
}

export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  const dbPath = getDbPath();
  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');

  _db = drizzle({ client: _sqlite, schema });
  return _db;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

export function closeDatabase(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
