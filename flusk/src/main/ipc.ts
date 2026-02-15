import { ipcMain } from 'electron';

import type {
  AssistantLiveContext,
  AssistantMemorySnapshot,
} from '../types/assistant';
import {
  type ChatKernelOrchestrationRequestPayload,
  type ChatKernelOrchestrationResultPayload,
  type ChatKernelStatusResultPayload,
  IPC_CHANNELS,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type MemoryPromotionConfirmRequestPayload,
  type MemoryPromotionConfirmResultPayload,
  type MemoryPromotionEvaluationRequestPayload,
  type MemoryPromotionEvaluationResultPayload,
  type ProactiveTriggerEvaluationRequestPayload,
  type ProactiveTriggerEvaluationResultPayload,
  type SettingsBootstrapState,
} from '../types/ipc';
import {
  compileIdentityContext,
  loadIdentityContracts,
} from './assistant/contextCompiler';
import {
  evaluateMemoryPromotion,
  resolveMemoryPromotionConfirmation,
} from './assistant/memoryPolicy';
import { evaluateProactiveTriggerPolicy } from './assistant/proactivePolicy';
import {
  getIdentityKernelStatus,
  orchestrateChatWithIdentityKernel,
} from './assistant/identityKernel';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  toggleToday,
  reorderTasks,
} from './services/taskService';
import { getChatHistory, saveChatMessage, clearChatHistory } from './services/chatService';
import { getScratchpad, saveScratchpad } from './services/scratchpadService';
import { getSetting, setSetting, getAllSettings } from './services/settingsService';

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

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_EVALUATE_MEMORY_PROMOTION,
    (
      _event,
      request: MemoryPromotionEvaluationRequestPayload,
    ): MemoryPromotionEvaluationResultPayload =>
      evaluateMemoryPromotion(request),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_CONFIRM_MEMORY_PROMOTION,
    (
      _event,
      request: MemoryPromotionConfirmRequestPayload,
    ): MemoryPromotionConfirmResultPayload =>
      resolveMemoryPromotionConfirmation(request),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_EVALUATE_PROACTIVE_TRIGGERS,
    (
      _event,
      request: ProactiveTriggerEvaluationRequestPayload,
    ): ProactiveTriggerEvaluationResultPayload =>
      evaluateProactiveTriggerPolicy(request),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_KERNEL_STATUS,
    async (): Promise<ChatKernelStatusResultPayload> => getIdentityKernelStatus(),
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ORCHESTRATE_WITH_KERNEL,
    async (
      _event,
      request: ChatKernelOrchestrationRequestPayload,
    ): Promise<ChatKernelOrchestrationResultPayload> =>
      orchestrateChatWithIdentityKernel(request),
  );

  // ─── Task handlers ────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.TASK_LIST, (_event, filter?) => {
    try { return listTasks(filter); }
    catch (e) { console.error('[ipc] TASK_LIST:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, (_event, input) => {
    try { return createTask(input); }
    catch (e) { console.error('[ipc] TASK_CREATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_UPDATE, (_event, input) => {
    try { return updateTask(input); }
    catch (e) { console.error('[ipc] TASK_UPDATE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_DELETE, (_event, id: string) => {
    try { deleteTask(id); }
    catch (e) { console.error('[ipc] TASK_DELETE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_REORDER, (_event, ids: string[]) => {
    try { reorderTasks(ids); }
    catch (e) { console.error('[ipc] TASK_REORDER:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_COMPLETE, (_event, id: string) => {
    try { return completeTask(id); }
    catch (e) { console.error('[ipc] TASK_COMPLETE:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.TASK_TOGGLE_TODAY, (_event, id: string) => {
    try { return toggleToday(id); }
    catch (e) { console.error('[ipc] TASK_TOGGLE_TODAY:', e); throw e; }
  });

  // ─── Chat handlers ───────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, (_event, message) => {
    try { return saveChatMessage(message); }
    catch (e) { console.error('[ipc] CHAT_SEND:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, () => {
    try { return getChatHistory(); }
    catch (e) { console.error('[ipc] CHAT_HISTORY:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR, () => {
    try { clearChatHistory(); }
    catch (e) { console.error('[ipc] CHAT_CLEAR:', e); throw e; }
  });

  // ─── Scratchpad handlers ─────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SCRATCHPAD_GET, () => {
    try { return getScratchpad(); }
    catch (e) { console.error('[ipc] SCRATCHPAD_GET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SCRATCHPAD_SAVE, (_event, content: string) => {
    try { return saveScratchpad(content); }
    catch (e) { console.error('[ipc] SCRATCHPAD_SAVE:', e); throw e; }
  });

  // ─── Settings handlers ───────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    try { return getSetting(key); }
    catch (e) { console.error('[ipc] SETTINGS_GET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: string) => {
    try { return setSetting(key, value); }
    catch (e) { console.error('[ipc] SETTINGS_SET:', e); throw e; }
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    try { return getAllSettings(); }
    catch (e) { console.error('[ipc] SETTINGS_GET_ALL:', e); throw e; }
  });
};
