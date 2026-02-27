import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { getMainWindow } from '../window/summonController';
import path from 'node:path';
import { readdir, realpath, stat, unlink } from 'node:fs/promises';
import {
  IPC_CHANNELS,
  type BackupImportRequest,
  type BackupOffsiteReadManifestRequest,
  type BackupOffsiteRestoreRequest,
  type BackupOffsiteManifestPayload,
  type BackupSettingsPayload,
  type BackupSetSettingsRequest,
  type BackupPickDestinationFolderResponse,
  type BackupPickOffsiteFileResponse,
  type BackupListWithManifestsResponse,
  type BackupListWithManifestsEntry,
  type BackupDeleteRequest,
  type BackupRevealRequest,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  backupImportRequestSchema,
  backupOffsiteReadManifestRequestSchema,
  backupOffsiteRestoreRequestSchema,
  backupSettingsSchema,
  backupDeleteRequestSchema,
  backupRevealRequestSchema,
} from './schemas';
import {
  createBackup,
  createOffsiteBackup,
  importBackup,
  readBackupManifest,
  restoreOffsiteBackup,
  startBackupScheduler,
  stopBackupScheduler,
  type BackupMetadata,
} from '../services/backupService';
import { closeDatabase, initDatabase } from '../db';
import { runMigrations } from '../db/migrate';
import { initChatSearchFts, initNotesSearchFts, initSearchFts } from '../services/searchService';
import { refreshTodayBadge } from '../tray';
import {
  SETTING_KEY_BACKUP_DESTINATION,
  SETTING_KEY_BACKUP_FREQUENCY,
  SETTING_KEY_BACKUP_RETENTION,
} from '../defaultSettings';
import { getSettingWithDefault, setSetting } from '../services/settingsService';

const BACKUP_JOB_TIMEOUT_MS = 120_000;

// ─── Path safety ─────────────────────────────────────────────────────────────
// assertImportPathSafe: restricts BACKUP_IMPORT to the internal backups dir
// (the only source the settings list UI can pass).
//
// assertBackupFileSafe: used by BACKUP_DELETE, BACKUP_REVEAL, and
// BACKUP_OFFSITE_RESTORE — accepts files from either the internal backups dir
// OR the user-configured destination folder (which may be any path).

const getBackupDirPath = (): string =>
  path.join(app.getPath('userData'), 'backups');

const isWithinDir = (resolvedFile: string, dir: string): boolean => {
  const resolvedDir = path.resolve(dir);
  return (
    resolvedFile.startsWith(resolvedDir + path.sep) ||
    resolvedFile === resolvedDir
  );
};

const assertImportPathSafe = async (source: string): Promise<void> => {
  const resolved = await realpath(source);
  if (!isWithinDir(resolved, getBackupDirPath())) {
    throw new Error('Import source must be within the app backup directory.');
  }
};

const assertBackupFileSafe = async (filePath: string): Promise<void> => {
  const resolved = await realpath(filePath);
  const internalDir = getBackupDirPath();
  const configuredDestination = getBackupSettings().destination.trim();

  if (isWithinDir(resolved, internalDir)) return;
  if (configuredDestination && isWithinDir(resolved, configuredDestination)) return;

  throw new Error('Backup file must be within the configured backup folder.');
};

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const notifyBackupRestored = (): void => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.APP_BACKUP_RESTORED);
  }
};

const reinitializeDatabase = (): void => {
  initDatabase();
  runMigrations();
  initSearchFts();
  initChatSearchFts();
  initNotesSearchFts();
  refreshTodayBadge();
};

const restoreBackupAndReloadRuntime = async (request: BackupImportRequest): Promise<void> => {
  closeDatabase();

  try {
    await importBackup(request.source, request.passphrase);
  } catch (error) {
    // Keep runtime usable if restore attempt fails.
    reinitializeDatabase();
    throw error;
  }

  reinitializeDatabase();
  notifyBackupRestored();
};

const restoreOffsiteBackupAndReloadRuntime = async (request: BackupOffsiteRestoreRequest): Promise<void> => {
  closeDatabase();

  try {
    await restoreOffsiteBackup(request.source);
  } catch (error) {
    reinitializeDatabase();
    throw error;
  }

  reinitializeDatabase();
  notifyBackupRestored();
};

const getBackupSettings = (): BackupSettingsPayload => {
  const destination = (getSettingWithDefault(SETTING_KEY_BACKUP_DESTINATION) ?? '').trim();
  const rawFrequency = getSettingWithDefault(SETTING_KEY_BACKUP_FREQUENCY) ?? 'daily';
  const rawRetention = getSettingWithDefault(SETTING_KEY_BACKUP_RETENTION) ?? '10';
  const retention = Number.parseInt(rawRetention, 10);

  const settings = backupSettingsSchema.parse({
    destination,
    frequency: rawFrequency,
    retention: Number.isNaN(retention) ? 10 : retention,
  });

  const lastRunAt = getSettingWithDefault('backup.last_run_at');
  return {
    destination: settings.destination,
    frequency: settings.frequency,
    retention: settings.retention,
    lastRunAt: lastRunAt && lastRunAt.trim().length > 0 ? lastRunAt : null,
  };
};

export const registerBackupHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_CREATE,
    withIpcLogging(
      'BACKUP_CREATE',
      async (): Promise<BackupMetadata> => {
        return await withTimeout(
          createBackup(),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup creation',
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_IMPORT,
    withIpcLogging(
      'BACKUP_IMPORT',
      async (_event: Electron.IpcMainInvokeEvent, request: BackupImportRequest): Promise<void> => {
        const validated = backupImportRequestSchema.parse(request ?? {});
        await assertImportPathSafe(validated.source);
        await withTimeout(
          restoreBackupAndReloadRuntime(validated),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup import',
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_OFFSITE_CREATE,
    withIpcLogging(
      'BACKUP_OFFSITE_CREATE',
      async (): Promise<BackupMetadata> => {
        const settings = getBackupSettings();
        if (!settings.destination) {
          throw new Error('Set backup destination before running offsite backup.');
        }
        return await withTimeout(
          createOffsiteBackup(settings.destination),
          BACKUP_JOB_TIMEOUT_MS,
          'Offsite backup creation',
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_OFFSITE_READ_MANIFEST,
    withIpcLogging(
      'BACKUP_OFFSITE_READ_MANIFEST',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: BackupOffsiteReadManifestRequest,
      ): Promise<BackupOffsiteManifestPayload> => {
        const validated = backupOffsiteReadManifestRequestSchema.parse(request ?? {});
        return await withTimeout(
          readBackupManifest(validated.source),
          BACKUP_JOB_TIMEOUT_MS,
          'Offsite backup manifest read',
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_OFFSITE_RESTORE,
    withIpcLogging(
      'BACKUP_OFFSITE_RESTORE',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: BackupOffsiteRestoreRequest,
      ): Promise<void> => {
        const validated = backupOffsiteRestoreRequestSchema.parse(request ?? {});
        await assertBackupFileSafe(validated.source);
        await withTimeout(
          restoreOffsiteBackupAndReloadRuntime(validated),
          BACKUP_JOB_TIMEOUT_MS,
          'Offsite backup restore',
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_GET_SETTINGS,
    withIpcLogging(
      'BACKUP_GET_SETTINGS',
      async (): Promise<BackupSettingsPayload> => {
        return getBackupSettings();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_SET_SETTINGS,
    withIpcLogging(
      'BACKUP_SET_SETTINGS',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: BackupSetSettingsRequest,
      ): Promise<BackupSettingsPayload> => {
        const validated = backupSettingsSchema.parse(request ?? {});
        setSetting(SETTING_KEY_BACKUP_DESTINATION, validated.destination.trim());
        setSetting(SETTING_KEY_BACKUP_FREQUENCY, validated.frequency);
        setSetting(SETTING_KEY_BACKUP_RETENTION, String(validated.retention));

        stopBackupScheduler();
        startBackupScheduler();

        return getBackupSettings();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_PICK_DESTINATION_FOLDER,
    withIpcLogging(
      'BACKUP_PICK_DESTINATION_FOLDER',
      async (event: Electron.IpcMainInvokeEvent): Promise<BackupPickDestinationFolderResponse> => {
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Choose backup destination folder',
          properties: ['openDirectory' as const, 'createDirectory' as const],
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        const destination = result.filePaths[0];
        if (result.canceled || !destination) {
          return { canceled: true };
        }
        return { canceled: false, destination };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_PICK_OFFSITE_FILE,
    withIpcLogging(
      'BACKUP_PICK_OFFSITE_FILE',
      async (event: Electron.IpcMainInvokeEvent): Promise<BackupPickOffsiteFileResponse> => {
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Select Untask backup',
          properties: ['openFile' as const],
          filters: [
            { name: 'Untask Offsite Backup', extensions: ['untaskbackup'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        const source = result.filePaths[0];
        if (result.canceled || !source) {
          return { canceled: true };
        }
        return { canceled: false, source };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_LIST_WITH_MANIFESTS,
    withIpcLogging(
      'BACKUP_LIST_WITH_MANIFESTS',
      async (): Promise<BackupListWithManifestsResponse> => {
        const settings = getBackupSettings();
        const dir = settings.destination || getBackupDirPath();
        let entries: string[];
        try {
          entries = (await readdir(dir)).filter((name) =>
            name.endsWith('.untaskbackup'),
          );
        } catch {
          return { backups: [] };
        }

        const backups: BackupListWithManifestsEntry[] = [];
        for (const name of entries) {
          const fullPath = path.join(dir, name);
          try {
            const fileStat = await stat(fullPath);
            const manifest = await readBackupManifest(fullPath);
            backups.push({
              path: fullPath,
              filename: name,
              createdAt: manifest.createdAt,
              sizeBytes: fileStat.size,
              taskCount: manifest.taskCount,
              noteCount: manifest.noteCount,
              attachmentCount: manifest.attachmentCount,
            });
          } catch {
            // Skip files with unreadable manifests.
          }
        }

        backups.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return { backups };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DELETE,
    withIpcLogging(
      'BACKUP_DELETE',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: BackupDeleteRequest,
      ): Promise<void> => {
        const validated = backupDeleteRequestSchema.parse(request ?? {});
        await assertBackupFileSafe(validated.path);
        await unlink(validated.path);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_REVEAL,
    withIpcLogging(
      'BACKUP_REVEAL',
      async (
        _event: Electron.IpcMainInvokeEvent,
        request: BackupRevealRequest,
      ): Promise<void> => {
        const validated = backupRevealRequestSchema.parse(request ?? {});
        await assertBackupFileSafe(validated.path);
        shell.showItemInFolder(validated.path);
      },
    ),
  );
};
