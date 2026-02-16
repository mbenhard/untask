import { app } from 'electron';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { getDbPath, getRawDb } from '../db';

const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 30;
const ENCRYPTED_MAGIC = Buffer.from('FLUSK_ENC_V1');
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM recommended
const SALT_LENGTH = 16;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');

export type BackupMetadata = {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
};

function getBackupDir(): string {
  const dir = path.join(app.getPath('userData'), BACKUP_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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

export function createBackup(): BackupMetadata {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) {
    throw new Error('Database file not found.');
  }

  checkpointDatabaseWal();

  const backupDir = getBackupDir();
  const filename = `flusk-backup-${formatTimestamp()}.db`;
  const backupPath = path.join(backupDir, filename);

  copyFileSync(dbPath, backupPath);

  const stat = statSync(backupPath);
  pruneOldBackups(MAX_BACKUPS);

  return {
    filename,
    path: backupPath,
    createdAt: new Date().toISOString(),
    sizeBytes: stat.size,
  };
}

export function listBackups(): BackupMetadata[] {
  const backupDir = getBackupDir();

  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('flusk-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();

  return files.map((filename) => {
    const fullPath = path.join(backupDir, filename);
    const stat = statSync(fullPath);
    return {
      filename,
      path: fullPath,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    };
  });
}

export function pruneOldBackups(keep: number = MAX_BACKUPS): number {
  const backups = listBackups();

  if (backups.length <= keep) {
    return 0;
  }

  const toDelete = backups.slice(keep);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      unlinkSync(backup.path);
      deleted++;
    } catch {
      // Best-effort deletion
    }
  }

  return deleted;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export function exportBackup(
  destination: string,
  passphrase?: string,
): void {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) {
    throw new Error('Database file not found.');
  }

  checkpointDatabaseWal();

  if (!passphrase || passphrase.length === 0) {
    copyFileSync(dbPath, destination);
    return;
  }

  // Encrypted export: magic + salt + iv + authTag + ciphertext
  const plaintext = readFileSync(dbPath);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const output = Buffer.concat([ENCRYPTED_MAGIC, salt, iv, authTag, encrypted]);
  writeFileSync(destination, output);
}

function isEncryptedBackup(data: Buffer): boolean {
  if (data.length < ENCRYPTED_MAGIC.length) return false;
  return data.subarray(0, ENCRYPTED_MAGIC.length).equals(ENCRYPTED_MAGIC);
}

export function importBackup(
  source: string,
  passphrase?: string,
): void {
  if (!existsSync(source)) {
    throw new Error('Backup file not found.');
  }

  const dbPath = getDbPath();

  // Create safety backup of current DB
  const backupDir = getBackupDir();
  const safetyFilename = `flusk-safety-${formatTimestamp()}.db`;
  const safetyPath = path.join(backupDir, safetyFilename);

  if (existsSync(dbPath)) {
    copyFileSync(dbPath, safetyPath);
  }

  const data = readFileSync(source);

  if (isEncryptedBackup(data)) {
    if (!passphrase || passphrase.length === 0) {
      throw new Error('This backup is encrypted. Please provide a passphrase.');
    }

    const offset = ENCRYPTED_MAGIC.length;
    const salt = data.subarray(offset, offset + SALT_LENGTH);
    const iv = data.subarray(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(
      offset + SALT_LENGTH + IV_LENGTH,
      offset + SALT_LENGTH + IV_LENGTH + 16,
    );
    const ciphertext = data.subarray(offset + SALT_LENGTH + IV_LENGTH + 16);

    const key = deriveKey(passphrase, salt);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      assertValidSqliteDatabase(decrypted);
      writeFileSync(dbPath, decrypted);
    } catch {
      throw new Error('Decryption failed. Wrong passphrase or corrupted file.');
    }
  } else {
    assertValidSqliteDatabase(data);
    writeFileSync(dbPath, data);
  }
}

// ─── Scheduler ──────────────────────────────────────────────

let backupTimerId: ReturnType<typeof setTimeout> | null = null;

export function startDailyBackupScheduler(): void {
  if (backupTimerId !== null) {
    return;
  }

  const runBackup = (): void => {
    try {
      createBackup();
      pruneOldBackups(MAX_BACKUPS);
    } catch (error) {
      console.error('[backup] daily backup failed:', error);
    }
  };

  // Run initial backup if no recent backup exists
  const backups = listBackups();
  const hasRecentBackup =
    backups.length > 0 &&
    Date.now() - new Date(backups[0].createdAt).getTime() < 24 * 60 * 60 * 1000;

  if (!hasRecentBackup) {
    runBackup();
  }

  // Schedule next backup in 24 hours, repeat
  const scheduleNext = (): void => {
    backupTimerId = setTimeout(() => {
      runBackup();
      scheduleNext();
    }, 24 * 60 * 60 * 1000);
  };

  scheduleNext();
}

export function stopDailyBackupScheduler(): void {
  if (backupTimerId !== null) {
    clearTimeout(backupTimerId);
    backupTimerId = null;
  }
}
