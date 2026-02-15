import { ipcMain } from 'electron';

import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
} from '../types/assistant';
import {
  IPC_CHANNELS,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type SettingsBootstrapState,
} from '../types/ipc';
import {
  compileIdentityContext,
  loadIdentityContracts,
} from './assistant/contextCompiler';

const EMPTY_MEMORY: AssistantMemorySnapshot = {
  profile: '',
  patterns: '',
  journalEntries: [],
};

const EMPTY_LIVE_CONTEXT: AssistantLiveContext = {
  tasks: [],
  inboxCount: 0,
};

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

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT,
    async (
      _event,
      request?: IdentityContextSnapshotRequest,
    ): Promise<IdentityContextSnapshotResult> => {
      const contracts = await loadIdentityContracts(process.cwd());
      const memory: AssistantMemorySnapshot = {
        ...EMPTY_MEMORY,
        ...request?.memory,
        journalEntries: request?.memory?.journalEntries ?? EMPTY_MEMORY.journalEntries,
      };
      const liveContext: AssistantLiveContext = {
        ...EMPTY_LIVE_CONTEXT,
        ...request?.liveContext,
        tasks: request?.liveContext?.tasks ?? EMPTY_LIVE_CONTEXT.tasks,
      };

      return compileIdentityContext({
        contracts,
        memory,
        liveContext,
        request: request?.request,
        tokenBudget: request?.tokenBudget,
      });
    },
  );
};
