import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type QuickAddWindowPayload } from '../types/ipc';

export type QuickAddApi = {
  createTask: (input: Record<string, unknown>) => Promise<unknown>;
  hide: () => void;
  resize: (height: number) => void;
  navigateToTask: (taskId: string) => void;
  onPayload: (listener: (payload: QuickAddWindowPayload) => void) => () => void;
  getSetting: (key: string) => Promise<string | null>;
};

const quickAddApi: QuickAddApi = {
  createTask: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, input),

  hide: () => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_ADD_HIDE);
  },

  resize: (height: number) => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_ADD_RESIZE, height);
  },

  navigateToTask: (taskId: string) => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK, taskId);
  },

  onPayload: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      payload: QuickAddWindowPayload,
    ) => listener(payload);

    ipcRenderer.on(IPC_CHANNELS.QUICK_ADD_PAYLOAD, wrapped);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.QUICK_ADD_PAYLOAD, wrapped);
    };
  },

  getSetting: (key: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
};

contextBridge.exposeInMainWorld('quickAdd', quickAddApi);
