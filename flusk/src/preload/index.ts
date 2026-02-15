import { contextBridge, ipcRenderer } from 'electron';

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
  evaluateMemoryPromotion: (
    request: MemoryPromotionEvaluationRequestPayload,
  ): Promise<MemoryPromotionEvaluationResultPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_EVALUATE_MEMORY_PROMOTION, request),
  confirmMemoryPromotion: (
    request: MemoryPromotionConfirmRequestPayload,
  ): Promise<MemoryPromotionConfirmResultPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CONFIRM_MEMORY_PROMOTION, request),
  evaluateProactiveTriggers: (
    request: ProactiveTriggerEvaluationRequestPayload,
  ): Promise<ProactiveTriggerEvaluationResultPayload> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SETTINGS_EVALUATE_PROACTIVE_TRIGGERS,
      request,
    ),
  getChatKernelStatus: (): Promise<ChatKernelStatusResultPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_KERNEL_STATUS),
  orchestrateChatWithKernel: (
    request: ChatKernelOrchestrationRequestPayload,
  ): Promise<ChatKernelOrchestrationResultPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_ORCHESTRATE_WITH_KERNEL, request),
  // ─── Database domain APIs ─────────────────────────────────
  tasks: {
    list: (filter?: { status?: string; parentId?: string | null; today?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, filter),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, input),
    update: (input: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, input),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, id),
    reorder: (ids: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_REORDER, ids),
    complete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_COMPLETE, id),
    toggleToday: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_TOGGLE_TODAY, id),
  },
  chat: {
    send: (message: { content: string; toolCalls?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, { role: 'user', ...message }),
    history: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CLEAR),
  },
  scratchpad: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SCRATCHPAD_GET),
    save: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.SCRATCHPAD_SAVE, content),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  },
};

contextBridge.exposeInMainWorld('flusk', fluskApi);
