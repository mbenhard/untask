import { app } from 'electron';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import os from 'node:os';
import Database from 'better-sqlite3';

import { getDbPath, getRawDb } from '../db';

// ─── API key patterns to strip from exports ──────────────────
const API_KEY_SETTING_PATTERNS: readonly string[] = [
  'ai_openrouter_key',
  'ai_openai_key',
  'ai_anthropic_key',
  'api_key_migration_done',
];

// Matches any encrypted_ai_*_key pattern
const ENCRYPTED_KEY_PREFIX = 'encrypted_ai_';
const ENCRYPTED_KEY_SUFFIX = '_key';

function isSensitiveSetting(key: string): boolean {
  if (API_KEY_SETTING_PATTERNS.includes(key)) return true;
  if (key.startsWith(ENCRYPTED_KEY_PREFIX) && key.endsWith(ENCRYPTED_KEY_SUFFIX)) return true;
  return false;
}

/**
 * Creates a sanitized copy of the SQLite database at `sourcePath` and writes
 * it to `destPath`. All settings rows that match API key patterns are removed
 * from the copy so they are never included in exports.
 */
async function writeSanitizedDbCopy(sourcePath: string, destPath: string): Promise<void> {
  await copyFile(sourcePath, destPath);

  const tempDb = new Database(destPath);
  try {
    // Check whether the settings table exists before touching it
    const tableExists = tempDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();

    if (tableExists) {
      const rows = tempDb.prepare('SELECT key FROM settings').all() as { key: string }[];
      const keysToDelete = rows.map((r) => r.key).filter(isSensitiveSetting);

      if (keysToDelete.length > 0) {
        const deleteStmt = tempDb.prepare('DELETE FROM settings WHERE key = ?');
        const deleteAll = tempDb.transaction(() => {
          for (const key of keysToDelete) {
            deleteStmt.run(key);
          }
        });
        deleteAll();
        // Compact the file so the deleted data is not recoverable in the copy
        tempDb.pragma('wal_checkpoint(TRUNCATE)');
        tempDb.exec('VACUUM');
      }
    }
  } finally {
    tempDb.close();
  }
}

const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 30;
const ENCRYPTED_MAGIC = Buffer.from('UNTASK_ENC_V1');
const ENCRYPTED_MAGIC_LEGACY = Buffer.from('FLUSK_ENC_V1');
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM recommended
const SALT_LENGTH = 16;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');
const DAILY_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const pbkdf2Async = promisify(crypto.pbkdf2);

export type BackupMetadata = {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

async function getBackupDir(): Promise<string> {
  const dir = path.join(app.getPath('userData'), BACKUP_DIR_NAME);
  await mkdir(dir, { recursive: true });
  return dir;
}

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function checkpointDatabaseWal(): void {
  try {
    getRawDb().pragma('wal_checkpoint(TRUNCATE)');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[backup] failed to checkpoint WAL before snapshot', error);
  }
}

function assertValidSqliteDatabase(data: Buffer): void {
  if (
    data.length < SQLITE_MAGIC.length ||
    !data.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)
  ) {
    throw new Error('Invalid backup file: not a valid SQLite database.');
  }
}

export async function createBackup(): Promise<BackupMetadata> {
  const dbPath = getDbPath();
  if (!(await pathExists(dbPath))) {
    throw new Error('Database file not found.');
  }

  checkpointDatabaseWal();

  const backupDir = await getBackupDir();
  const filename = `untask-backup-${formatTimestamp()}.db`;
  const backupPath = path.join(backupDir, filename);

  await copyFile(dbPath, backupPath);

  const fileStat = await stat(backupPath);
  await pruneOldBackups(MAX_BACKUPS);

  return {
    filename,
    path: backupPath,
    createdAt: new Date().toISOString(),
    sizeBytes: fileStat.size,
  };
}

export async function listBackups(): Promise<BackupMetadata[]> {
  const backupDir = await getBackupDir();

  const files = (await readdir(backupDir))
    .filter((f) => (f.startsWith('untask-backup-') || f.startsWith('flusk-backup-')) && f.endsWith('.db'))
    .sort()
    .reverse();

  const stats = await Promise.all(
    files.map(async (filename) => {
      const fullPath = path.join(backupDir, filename);
      const fileStat = await stat(fullPath);
      return {
        filename,
        path: fullPath,
        createdAt: fileStat.mtime.toISOString(),
        sizeBytes: fileStat.size,
      };
    }),
  );

  return stats;
}

export async function pruneOldBackups(keep: number = MAX_BACKUPS): Promise<number> {
  const backups = await listBackups();

  if (backups.length <= keep) {
    return 0;
  }

  const toDelete = backups.slice(keep);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      await unlink(backup.path);
      deleted += 1;
    } catch {
      // Best-effort deletion
    }
  }

  return deleted;
}

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return pbkdf2Async(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export async function exportBackup(
  destination: string,
  passphrase?: string,
): Promise<void> {
  const dbPath = getDbPath();
  if (!(await pathExists(dbPath))) {
    throw new Error('Database file not found.');
  }

  checkpointDatabaseWal();

  // Build a sanitized (API-key-free) temporary copy of the database
  const tempPath = path.join(os.tmpdir(), `untask-export-${formatTimestamp()}.db`);
  try {
    await writeSanitizedDbCopy(dbPath, tempPath);

    if (!passphrase || passphrase.length === 0) {
      await copyFile(tempPath, destination);
      return;
    }

    // Encrypted export: magic + salt + iv + authTag + ciphertext
    const plaintext = await readFile(tempPath);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await deriveKey(passphrase, salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const output = Buffer.concat([ENCRYPTED_MAGIC, salt, iv, authTag, encrypted]);
    await writeFile(destination, output);
  } finally {
    // Always clean up the temp file regardless of success or failure
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort cleanup
    }
  }
}

function isEncryptedBackup(data: Buffer): boolean {
  if (data.length >= ENCRYPTED_MAGIC.length &&
      data.subarray(0, ENCRYPTED_MAGIC.length).equals(ENCRYPTED_MAGIC)) {
    return true;
  }
  // Backward compatibility: accept old FLUSK_ENC_V1 magic
  if (data.length >= ENCRYPTED_MAGIC_LEGACY.length &&
      data.subarray(0, ENCRYPTED_MAGIC_LEGACY.length).equals(ENCRYPTED_MAGIC_LEGACY)) {
    return true;
  }
  return false;
}

function getEncryptedMagicLength(data: Buffer): number {
  if (data.length >= ENCRYPTED_MAGIC.length &&
      data.subarray(0, ENCRYPTED_MAGIC.length).equals(ENCRYPTED_MAGIC)) {
    return ENCRYPTED_MAGIC.length;
  }
  return ENCRYPTED_MAGIC_LEGACY.length;
}

export async function importBackup(
  source: string,
  passphrase?: string,
): Promise<void> {
  if (!(await pathExists(source))) {
    throw new Error('Backup file not found.');
  }

  const dbPath = getDbPath();

  // Create safety backup of current DB
  const backupDir = await getBackupDir();
  const safetyFilename = `untask-safety-${formatTimestamp()}.db`;
  const safetyPath = path.join(backupDir, safetyFilename);

  if (await pathExists(dbPath)) {
    await copyFile(dbPath, safetyPath);
  }

  const data = await readFile(source);

  if (isEncryptedBackup(data)) {
    if (!passphrase || passphrase.length === 0) {
      throw new Error('This backup is encrypted. Please provide a passphrase.');
    }

    const offset = getEncryptedMagicLength(data);
    const salt = data.subarray(offset, offset + SALT_LENGTH);
    const iv = data.subarray(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(
      offset + SALT_LENGTH + IV_LENGTH,
      offset + SALT_LENGTH + IV_LENGTH + 16,
    );
    const ciphertext = data.subarray(offset + SALT_LENGTH + IV_LENGTH + 16);

    const key = await deriveKey(passphrase, salt);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      assertValidSqliteDatabase(decrypted);
      await writeFile(dbPath, decrypted);
    } catch {
      throw new Error('Decryption failed. Wrong passphrase or corrupted file.');
    }
  } else {
    assertValidSqliteDatabase(data);
    await writeFile(dbPath, data);
  }

  // Defensive cleanup: remove any API keys that may have been present in the
  // backup file (e.g. older backups created before this guard was added).
  // Encrypted keys from one machine cannot be decrypted on another anyway, but
  // we remove them to avoid confusion and to keep the live DB clean.
  stripApiKeysFromRestoredDb(dbPath);
  // eslint-disable-next-line no-console
  console.info(
    '[backup] API keys are not included in backups. Please re-enter your API key in Settings.',
  );
}

/**
 * Opens the database at `dbPath` directly (not through the app connection) and
 * deletes any settings rows whose keys match API key patterns. Used as a
 * defensive post-restore cleanup.
 */
function stripApiKeysFromRestoredDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();

    if (!tableExists) return;

    const rows = db.prepare('SELECT key FROM settings').all() as { key: string }[];
    const keysToDelete = rows.map((r) => r.key).filter(isSensitiveSetting);

    if (keysToDelete.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM settings WHERE key = ?');
      const deleteAll = db.transaction(() => {
        for (const key of keysToDelete) {
          deleteStmt.run(key);
        }
      });
      deleteAll();
    }
  } finally {
    db.close();
  }
}

// ─── Scheduler ──────────────────────────────────────────────

let backupTimerId: ReturnType<typeof setTimeout> | null = null;
let backupSchedulerStopped = false;

export function startDailyBackupScheduler(): void {
  if (backupTimerId !== null) {
    return;
  }

  backupSchedulerStopped = false;

  const runBackup = async (): Promise<void> => {
    try {
      await createBackup();
      await pruneOldBackups(MAX_BACKUPS);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[backup] daily backup failed:', error);
    }
  };

  const scheduleNext = (): void => {
    if (backupSchedulerStopped) return;
    backupTimerId = setTimeout(() => {
      void runBackup();
      scheduleNext();
    }, DAILY_BACKUP_INTERVAL_MS);
  };

  void (async () => {
    const backups = await listBackups();
    const hasRecentBackup =
      backups.length > 0 &&
      Date.now() - new Date(backups[0].createdAt).getTime() < DAILY_BACKUP_INTERVAL_MS;

    if (!hasRecentBackup) {
      await runBackup();
    }

    scheduleNext();
  })();
}

export function stopDailyBackupScheduler(): void {
  backupSchedulerStopped = true;
  if (backupTimerId !== null) {
    clearTimeout(backupTimerId);
    backupTimerId = null;
  }
}
