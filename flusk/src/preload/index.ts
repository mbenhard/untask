import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type SettingsBootstrapState } from '../types/ipc';

const fluskApi = {
  getBootstrapState: (): Promise<SettingsBootstrapState> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE),
};

contextBridge.exposeInMainWorld('flusk', fluskApi);
