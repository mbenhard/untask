import { ipcMain } from 'electron';

import { IPC_CHANNELS, type SettingsBootstrapState } from '../types/ipc';

export const registerIpcHandlers = (): void => {
  if (ipcMain.listenerCount(IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE) > 0) {
    return;
  }

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE,
    (): SettingsBootstrapState => ({
      status: 'ready',
    }),
  );
};
