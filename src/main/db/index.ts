import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import * as schema from './schema';

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

/**
 * Migrate data from the legacy "Flusk" app directory to the new "Untask" directory.
 * Copies DB, attachments, and backups. Copies (not moves) so rollback is safe.
 */
function migrateLegacyData(newDbPath: string): void {
  if (existsSync(newDbPath)) return;

  const newDataDir = app.getPath('userData');
  const legacyDir = path.join(path.dirname(newDataDir), 'Flusk');
  const legacyDb = path.join(legacyDir, 'flusk.db');
  if (!existsSync(legacyDb)) return;

  // Copy database
  copyFileSync(legacyDb, newDbPath);

  // Copy attachments directory
  const legacyAttachments = path.join(legacyDir, 'attachments');
  const newAttachments = path.join(newDataDir, 'attachments');
  if (existsSync(legacyAttachments) && !existsSync(newAttachments)) {
    cpSync(legacyAttachments, newAttachments, { recursive: true });
  }

  // Copy backups directory
  const legacyBackups = path.join(legacyDir, 'backups');
  const newBackups = path.join(newDataDir, 'backups');
  if (existsSync(legacyBackups) && !existsSync(newBackups)) {
    cpSync(legacyBackups, newBackups, { recursive: true });
  }
}

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  const dbPath = path.join(userDataPath, 'untask.db');
  migrateLegacyData(dbPath);
  return dbPath;
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

export function getRawDb(): Database.Database {
  if (!_sqlite) throw new Error('Database not initialized. Call initDatabase() first.');
  return _sqlite;
}

export function closeDatabase(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
