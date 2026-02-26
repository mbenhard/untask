import { app } from 'electron';
import {
  access,
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import os from 'node:os';
import Database from 'better-sqlite3';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import { pipeline } from 'node:stream/promises';

import { getDbPath, getRawDb } from '../db';
import {
  SETTING_KEY_BACKUP_DESTINATION,
  SETTING_KEY_BACKUP_FREQUENCY,
  SETTING_KEY_BACKUP_RETENTION,
} from '../defaultSettings';
import { getSettingWithDefault, setSetting } from './settingsService';

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
 * Removes API-key settings from a database file in-place.
 * Used on backup copies so secrets are never included in exports/restores.
 */
function sanitizeDbFileInPlace(dbPath: string): void {
  const tempDb = new Database(dbPath);
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

/**
 * Creates a sanitized copy of the SQLite database at `sourcePath` and writes
 * it to `destPath`.
 */
async function writeSanitizedDbCopy(sourcePath: string, destPath: string): Promise<void> {
  await copyFile(sourcePath, destPath);
  sanitizeDbFileInPlace(destPath);
}

const BACKUP_DIR_NAME = 'backups';
const ATTACHMENTS_DIR_NAME = 'attachments';
const MAX_BACKUPS = 30;
const OFFSITE_BACKUP_EXTENSION = '.untaskbackup';
const SETTING_KEY_BACKUP_LAST_RUN_AT = 'backup.last_run_at';
const BACKUP_INTERVALS_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;
const ENCRYPTED_MAGIC = Buffer.from('UNTASK_ENC_V1');
const ENCRYPTED_MAGIC_LEGACY = Buffer.from('FLUSK_ENC_V1');
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM recommended
const SALT_LENGTH = 16;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');

const pbkdf2Async = promisify(crypto.pbkdf2);

export type BackupMetadata = {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
};

export type OffsiteBackupManifest = {
  version: 1;
  appVersion: string;
  createdAt: string;
  taskCount: number;
  noteCount: number;
  attachmentCount: number;
  dbSizeBytes: number;
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

function getAttachmentsDir(): string {
  return path.join(app.getPath('userData'), ATTACHMENTS_DIR_NAME);
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
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

const safeCount = (query: string, fallbackQuery: string): number => {
  try {
    const row = getRawDb().prepare(query).get() as { count: number } | undefined;
    return row?.count ?? 0;
  } catch {
    const row = getRawDb().prepare(fallbackQuery).get() as { count: number } | undefined;
    return row?.count ?? 0;
  }
};

const zipFilenameToSafePath = (root: string, zipFilename: string): string => {
  const normalized = path.posix.normalize(zipFilename);
  if (normalized.startsWith('../') || path.isAbsolute(normalized)) {
    throw new Error(`Unsafe zip entry path: ${zipFilename}`);
  }

  const resolved = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error(`Zip entry escapes extraction root: ${zipFilename}`);
  }
  return resolved;
};

export async function createOffsiteBackup(destinationDir: string): Promise<BackupMetadata> {
  if (!destinationDir.trim()) {
    throw new Error('Backup destination folder is required.');
  }

  await mkdir(destinationDir, { recursive: true });

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'untask-offsite-'));
  const tempDbPath = path.join(tempRoot, 'untask.db');
  const createdAt = new Date().toISOString();

  try {
    await getRawDb().backup(tempDbPath);
    sanitizeDbFileInPlace(tempDbPath);

    const attachmentsDir = getAttachmentsDir();
    const attachmentFiles = await pathExists(attachmentsDir)
      ? await listFilesRecursive(attachmentsDir)
      : [];

    const dbSizeBytes = (await stat(tempDbPath)).size;
    const manifest: OffsiteBackupManifest = {
      version: 1,
      appVersion: app.getVersion(),
      createdAt,
      taskCount: safeCount(
        'SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL',
        'SELECT COUNT(*) as count FROM tasks',
      ),
      noteCount: safeCount(
        'SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL',
        'SELECT COUNT(*) as count FROM notes',
      ),
      attachmentCount: attachmentFiles.length,
      dbSizeBytes,
    };

    const filename = `backup-${formatTimestamp()}${OFFSITE_BACKUP_EXTENSION}`;
    const zipPath = path.join(destinationDir, filename);

    const zip = new yazl.ZipFile();
    zip.addFile(tempDbPath, 'untask.db');
    for (const attachmentPath of attachmentFiles) {
      const relative = path.relative(attachmentsDir, attachmentPath).split(path.sep).join('/');
      zip.addFile(attachmentPath, `attachments/${relative}`);
    }
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), 'manifest.json');

    const writePromise = pipeline(zip.outputStream, createWriteStream(zipPath));
    zip.end();
    await writePromise;

    const fileStat = await stat(zipPath);
    return {
      filename,
      path: zipPath,
      createdAt,
      sizeBytes: fileStat.size,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function readBackupManifest(zipPath: string): Promise<OffsiteBackupManifest> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, file) => {
      if (error || !file) {
        reject(error ?? new Error('Unable to open backup file.'));
        return;
      }
      resolve(file);
    });
  });

  try {
    const manifestJson = await new Promise<string>((resolve, reject) => {
      const fail = (error: Error): void => {
        zip.close();
        reject(error);
      };

      zip.on('error', (error) => fail(error));
      zip.on('entry', (entry) => {
        if (entry.fileName !== 'manifest.json') {
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail(error ?? new Error('Failed to read backup manifest.'));
            return;
          }

          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          stream.on('error', (streamError) => fail(streamError));
          stream.on('end', () => {
            zip.close();
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        });
      });
      zip.on('end', () => fail(new Error('Backup manifest not found.')));
      zip.readEntry();
    });

    return JSON.parse(manifestJson) as OffsiteBackupManifest;
  } catch (error) {
    throw new Error(
      error instanceof Error ? `Invalid backup manifest: ${error.message}` : 'Invalid backup manifest.',
    );
  }
}

export async function detectCloudFolders(): Promise<string[]> {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
    path.join(home, 'Dropbox'),
    path.join(home, 'Google Drive'),
    path.join(home, 'OneDrive'),
  ];

  const existing: string[] = [];
  for (const dir of candidates) {
    if (await pathExists(dir)) {
      existing.push(dir);
    }
  }

  return existing;
}

export async function pruneOffsiteBackups(dir: string, keep: number): Promise<number> {
  const safeKeep = Math.max(1, keep);
  if (!(await pathExists(dir))) {
    return 0;
  }

  const entries = (await readdir(dir))
    .filter((name) => name.endsWith(OFFSITE_BACKUP_EXTENSION));

  const backups = await Promise.all(entries.map(async (name) => {
    const fullPath = path.join(dir, name);
    const fileStat = await stat(fullPath);
    return { fullPath, mtimeMs: fileStat.mtimeMs };
  }));

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toDelete = backups.slice(safeKeep);

  let deleted = 0;
  for (const entry of toDelete) {
    try {
      await unlink(entry.fullPath);
      deleted += 1;
    } catch {
      // Best-effort prune.
    }
  }

  return deleted;
}

export async function restoreOffsiteBackup(zipPath: string): Promise<void> {
  if (!(await pathExists(zipPath))) {
    throw new Error('Backup file not found.');
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'untask-restore-'));
  const extractedDbPath = path.join(tempRoot, 'untask.db');
  const extractedAttachmentsPath = path.join(tempRoot, 'attachments');

  try {
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (error, file) => {
        if (error || !file) {
          reject(error ?? new Error('Unable to open backup file.'));
          return;
        }
        resolve(file);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        zip.close();
        reject(error);
      };

      zip.on('error', (error) => fail(error));
      zip.on('entry', (entry) => {
        let destination: string;
        try {
          destination = zipFilenameToSafePath(tempRoot, entry.fileName);
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Unsafe backup entry path.'));
          return;
        }

        if (entry.fileName.endsWith('/')) {
          void mkdir(destination, { recursive: true })
            .then(() => zip.readEntry())
            .catch((error) => fail(error instanceof Error ? error : new Error('Extraction failed.')));
          return;
        }

        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail(error ?? new Error(`Failed reading zip entry: ${entry.fileName}`));
            return;
          }

          void mkdir(path.dirname(destination), { recursive: true })
            .then(() => pipeline(stream, createWriteStream(destination)))
            .then(() => zip.readEntry())
            .catch((streamError) =>
              fail(streamError instanceof Error ? streamError : new Error('Extraction failed.')),
            );
        });
      });
      zip.on('end', () => {
        zip.close();
        resolve();
      });
      zip.readEntry();
    });

    if (!(await pathExists(extractedDbPath))) {
      throw new Error('Invalid backup: untask.db is missing.');
    }

    const dbPath = getDbPath();
    const backupDir = await getBackupDir();
    const safetyPath = path.join(backupDir, `untask-safety-${formatTimestamp()}.db`);
    if (await pathExists(dbPath)) {
      await copyFile(dbPath, safetyPath);
    }

    await copyFile(extractedDbPath, dbPath);
    stripApiKeysFromRestoredDb(dbPath);

    const attachmentsDir = getAttachmentsDir();
    await rm(attachmentsDir, { recursive: true, force: true });
    if (await pathExists(extractedAttachmentsPath)) {
      await cp(extractedAttachmentsPath, attachmentsDir, { recursive: true });
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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
  try {
    sanitizeDbFileInPlace(dbPath);
  } catch {
    // Best-effort cleanup on restored databases.
  }
}

// ─── Scheduler ──────────────────────────────────────────────

let backupTimerId: ReturnType<typeof setTimeout> | null = null;
let backupSchedulerStopped = false;

type BackupFrequency = keyof typeof BACKUP_INTERVALS_MS;

const getConfiguredBackupFrequency = (): BackupFrequency => {
  const value = getSettingWithDefault(SETTING_KEY_BACKUP_FREQUENCY);
  if (value === 'hourly' || value === 'daily' || value === 'weekly') {
    return value;
  }
  return 'daily';
};

const getConfiguredOffsiteDestination = (): string => {
  return (getSettingWithDefault(SETTING_KEY_BACKUP_DESTINATION) ?? '').trim();
};

const getConfiguredOffsiteRetention = (): number => {
  const raw = getSettingWithDefault(SETTING_KEY_BACKUP_RETENTION) ?? '10';
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return 10;
  }
  return Math.min(50, Math.max(1, parsed));
};

const getConfiguredIntervalMs = (): number =>
  BACKUP_INTERVALS_MS[getConfiguredBackupFrequency()];

const runScheduledBackup = async (): Promise<void> => {
  try {
    await createBackup();
    await pruneOldBackups(MAX_BACKUPS);

    const offsiteDestination = getConfiguredOffsiteDestination();
    if (offsiteDestination.length > 0) {
      await createOffsiteBackup(offsiteDestination);
      await pruneOffsiteBackups(offsiteDestination, getConfiguredOffsiteRetention());
    }

    setSetting(SETTING_KEY_BACKUP_LAST_RUN_AT, new Date().toISOString());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[backup] scheduled backup failed:', error);
  }
};

const scheduleNextBackup = (delayMs?: number): void => {
  if (backupSchedulerStopped) return;
  backupTimerId = setTimeout(() => {
    void runScheduledBackup();
    scheduleNextBackup();
  }, delayMs ?? getConfiguredIntervalMs());
};

export function startBackupScheduler(): void {
  if (backupTimerId !== null) {
    return;
  }

  backupSchedulerStopped = false;

  void (async () => {
    const intervalMs = getConfiguredIntervalMs();
    const lastRunRaw = getSettingWithDefault(SETTING_KEY_BACKUP_LAST_RUN_AT);
    const lastRunMs = lastRunRaw ? Date.parse(lastRunRaw) : Number.NaN;
    const elapsedMs = Number.isFinite(lastRunMs) ? Date.now() - lastRunMs : Number.POSITIVE_INFINITY;

    if (elapsedMs >= intervalMs) {
      await runScheduledBackup();
      scheduleNextBackup();
      return;
    }

    scheduleNextBackup(Math.max(1000, intervalMs - elapsedMs));
  })();
}

export function stopBackupScheduler(): void {
  backupSchedulerStopped = true;
  if (backupTimerId !== null) {
    clearTimeout(backupTimerId);
    backupTimerId = null;
  }
}

// Back-compat exports while callers migrate to the configurable scheduler names.
export const startDailyBackupScheduler = startBackupScheduler;
export const stopDailyBackupScheduler = stopBackupScheduler;
