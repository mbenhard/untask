import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import { registerAppHandlers } from './app';
import { registerTaskHandlers } from './tasks';
import { registerChatHandlers } from './chat';
import { registerNotesHandlers } from './notes';
import { registerBackupHandlers } from './backup';
import { registerSettingsHandlers } from './settings';
import { registerApiKeyHandlers } from './apiKeys';
import { registerAttachmentHandlers } from './attachments';
import { registerReminderHandlers } from './reminders';
import { registerNotificationHandlers } from './notifications';
import { registerSearchHandlers } from './search';

export const registerIpcHandlers = (): void => {
  if (ipcMain.listenerCount(IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE) > 0) {
    return;
  }

  registerAppHandlers();
  registerTaskHandlers();
  registerChatHandlers();
  registerNotesHandlers();
  registerBackupHandlers();
  registerSettingsHandlers();
  registerApiKeyHandlers();
  registerAttachmentHandlers();
  registerReminderHandlers();
  registerNotificationHandlers();
  registerSearchHandlers();
};
