import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { getMainWindow } from '../window/summonController';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import {
  IPC_CHANNELS,
  type BackupListResponse,
  type BackupMetadataPayload,
  type BackupExportRequest,
  type BackupImportRequest,
  type BackupExportDialogRequest,
  type BackupExportDialogResponse,
  type BackupImportDialogRequest,
  type BackupImportDialogResponse,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  backupExportRequestSchema,
  backupImportRequestSchema,
  backupDialogRequestSchema,
} from './schemas';
import {
  createBackup,
  exportBackup,
  importBackup,
  listBackups,
} from '../services/backupService';
import { closeDatabase, initDatabase } from '../db';
import { runMigrations } from '../db/migrate';
import { initChatSearchFts, initNotesSearchFts, initSearchFts } from '../services/searchService';
import { refreshTodayBadge } from '../tray';

const BACKUP_JOB_TIMEOUT_MS = 120_000;

// ─── Path safety ─────────────────────────────────────────────────────────────
// The non-dialog BACKUP_IMPORT handler is used by the settings UI to restore
// from the app's own backup list. Restrict it to the backup directory.
// The non-dialog BACKUP_EXPORT handler restricts to common user directories.

const SAFE_EXPORT_DIRS = ['documents', 'downloads', 'desktop'] as const;

const getBackupDirPath = (): string =>
  path.join(app.getPath('userData'), 'backups');

const assertImportPathSafe = async (source: string): Promise<void> => {
  const resolved = await realpath(source);
  const backupDir = path.resolve(getBackupDirPath());
  if (!resolved.startsWith(backupDir + path.sep) && resolved !== backupDir) {
    throw new Error('Import source must be within the app backup directory.');
  }
};

const assertExportPathSafe = (destination: string): void => {
  const resolved = path.resolve(destination);
  const allowed = SAFE_EXPORT_DIRS.map((dir) => path.resolve(app.getPath(dir)));
  if (!allowed.some((dir) => resolved.startsWith(dir + path.sep))) {
    throw new Error('Export destination must be within Documents, Downloads, or Desktop.');
  }
};

const backupTimestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');

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

export const registerBackupHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_LIST,
    withIpcLogging(
      'BACKUP_LIST',
      async (): Promise<BackupListResponse> => {
        return {
          backups: await withTimeout(
            listBackups(),
            BACKUP_JOB_TIMEOUT_MS,
            'Backup listing',
          ),
        };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_CREATE,
    withIpcLogging(
      'BACKUP_CREATE',
      async (): Promise<BackupMetadataPayload> => {
        return await withTimeout(
          createBackup(),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup creation',
        );
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_EXPORT,
    withIpcLogging(
      'BACKUP_EXPORT',
      async (_event: Electron.IpcMainInvokeEvent, request: BackupExportRequest): Promise<void> => {
        const validated = backupExportRequestSchema.parse(request ?? {});
        assertExportPathSafe(validated.destination);
        await withTimeout(
          exportBackup(validated.destination, validated.passphrase),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup export',
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
    IPC_CHANNELS.BACKUP_EXPORT_DIALOG,
    withIpcLogging(
      'BACKUP_EXPORT_DIALOG',
      async (
        event: Electron.IpcMainInvokeEvent,
        request?: BackupExportDialogRequest,
      ): Promise<BackupExportDialogResponse> => {
        const validated = backupDialogRequestSchema.parse(request ?? {});
        const extension = validated.passphrase?.trim() ? 'taskdb.enc' : 'taskdb';
        const defaultPath = path.join(
          app.getPath('documents'),
          `untask-backup-${backupTimestamp()}.${extension}`,
        );
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Export Untask backup',
          defaultPath,
          filters: [
            { name: 'Untask Backup', extensions: ['taskdb', 'enc', 'db'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        };
        const result = owner
          ? await dialog.showSaveDialog(owner, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions);

        if (result.canceled || !result.filePath) {
          return { canceled: true };
        }

        await withTimeout(
          exportBackup(result.filePath, validated.passphrase?.trim() || undefined),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup export',
        );
        return { canceled: false, destination: result.filePath };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_IMPORT_DIALOG,
    withIpcLogging(
      'BACKUP_IMPORT_DIALOG',
      async (
        event: Electron.IpcMainInvokeEvent,
        request?: BackupImportDialogRequest,
      ): Promise<BackupImportDialogResponse> => {
        const validated = backupDialogRequestSchema.parse(request ?? {});
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions = {
          title: 'Import Untask backup',
          properties: ['openFile' as const],
          filters: [
            { name: 'Untask Backup', extensions: ['taskdb', 'enc', 'db'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        const source = result.filePaths[0];
        if (result.canceled || !source) {
          return { canceled: true, restored: false };
        }

        await withTimeout(
          restoreBackupAndReloadRuntime({
            source,
            passphrase: validated.passphrase?.trim() || undefined,
          }),
          BACKUP_JOB_TIMEOUT_MS,
          'Backup import',
        );
        return { canceled: false, source, restored: true };
      },
    ),
  );
};
