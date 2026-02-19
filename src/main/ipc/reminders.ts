import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type RemindersStatusResult,
} from '../../types/ipc';
import { withIpcLogging } from './helpers';
import {
  getRemindersStatus,
  toggleRemindersSync,
  setRemindersSyncFilter,
  setRemindersImportEnabled,
  requestRemindersAccess,
  forceRemindersSync,
  pullRemindersOnly,
} from '../services/remindersSync';

export const registerReminderHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_GET_STATUS,
    withIpcLogging(
      'REMINDERS_GET_STATUS',
      async (): Promise<RemindersStatusResult> => {
        return await getRemindersStatus();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_TOGGLE,
    withIpcLogging(
      'REMINDERS_TOGGLE',
      (_event: Electron.IpcMainInvokeEvent, enabled: boolean) => {
        toggleRemindersSync(enabled);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_SET_FILTER,
    withIpcLogging(
      'REMINDERS_SET_FILTER',
      (_event: Electron.IpcMainInvokeEvent, filter: string) => {
        setRemindersSyncFilter(filter);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_SET_IMPORT,
    withIpcLogging(
      'REMINDERS_SET_IMPORT',
      (_event: Electron.IpcMainInvokeEvent, enabled: boolean) => {
        setRemindersImportEnabled(enabled);
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_REQUEST_ACCESS,
    withIpcLogging(
      'REMINDERS_REQUEST_ACCESS',
      async () => {
        return await requestRemindersAccess();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_FORCE_SYNC,
    withIpcLogging(
      'REMINDERS_FORCE_SYNC',
      async () => {
        await forceRemindersSync();
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDERS_PULL_ONLY,
    withIpcLogging(
      'REMINDERS_PULL_ONLY',
      async () => {
        await pullRemindersOnly();
      },
    ),
  );
};
