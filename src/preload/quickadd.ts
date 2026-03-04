import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type QuickAddWindowPayload } from '../types/ipc';
import { PREDEFINED_STATUSES } from '../types/models';

export type QuickAddApi = {
  createTask: (input: Record<string, unknown>) => Promise<unknown>;
  hide: () => void;
  resize: (height: number) => void;
  navigateToTask: (taskId: string) => void;
  onPayload: (listener: (payload: QuickAddWindowPayload) => void) => () => void;
  getSetting: (key: string) => Promise<string | null>;
  getTags: () => Promise<{ tag: string; count: number }[]>;
  getStatuses: () => Promise<{ id: string; label: string }[]>;
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

  getTags: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_TAGS),

  getStatuses: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_STATUSES).then(
      (config: { enabled: string[]; order: string[] }) => {
        return config.enabled
          .filter((id: string) => {
            const def = PREDEFINED_STATUSES.find((s) => s.id === id);
            return def && !def.terminal;
          })
          .map((id: string) => {
            const def = PREDEFINED_STATUSES.find((s) => s.id === id);
            return { id, label: def?.label ?? id };
          });
      }
    ),
};

contextBridge.exposeInMainWorld('quickAdd', quickAddApi);
