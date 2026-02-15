import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type SettingsBootstrapState,
} from '../types/ipc';

const fluskApi = {
  getBootstrapState: (): Promise<SettingsBootstrapState> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_BOOTSTRAP_STATE),
  getIdentityContextSnapshot: (
    request?: IdentityContextSnapshotRequest,
  ): Promise<IdentityContextSnapshotResult> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT,
      request,
    ),
};

contextBridge.exposeInMainWorld('flusk', fluskApi);
