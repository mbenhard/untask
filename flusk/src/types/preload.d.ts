import type {
  ChatModelCatalogResult,
  ChatKernelOrchestrationRequestPayload,
  ChatKernelOrchestrationResultPayload,
  ChatKernelStatusResultPayload,
  ChatLiveThoughtResult,
  ChatRetentionResult,
  ChatSelectedModelResult,
  ChatSendRequest,
  ChatSendResult,
  ChatSetModelRequest,
  ChatSetRetentionRequest,
  ChatStreamEventPayload,
  ChatUndoRequest,
  ChatUndoResult,
  IdentityContextSnapshotRequest,
  IdentityContextSnapshotResult,
  MemoryPromotionConfirmRequestPayload,
  MemoryPromotionConfirmResultPayload,
  MemoryPromotionEvaluationRequestPayload,
  MemoryPromotionEvaluationResultPayload,
  ProactiveTriggerEvaluationRequestPayload,
  ProactiveTriggerEvaluationResultPayload,
  SettingsMemoryStatePayload,
  SettingsMemoryUpdateRequestPayload,
  SettingsReadJournalRequestPayload,
  SettingsReadJournalResultPayload,
  SettingsBootstrapState,
} from './ipc';

import type { Task, ChatMessage, Scratchpad, Setting } from './models';

export type FluskApi = {
  // ─── Existing kernel APIs ───────────────────────────────
  getBootstrapState: () => Promise<SettingsBootstrapState>;
  getIdentityContextSnapshot: (
    request?: IdentityContextSnapshotRequest,
  ) => Promise<IdentityContextSnapshotResult>;
  evaluateMemoryPromotion: (
    request: MemoryPromotionEvaluationRequestPayload,
  ) => Promise<MemoryPromotionEvaluationResultPayload>;
  confirmMemoryPromotion: (
    request: MemoryPromotionConfirmRequestPayload,
  ) => Promise<MemoryPromotionConfirmResultPayload>;
  evaluateProactiveTriggers: (
    request: ProactiveTriggerEvaluationRequestPayload,
  ) => Promise<ProactiveTriggerEvaluationResultPayload>;
  getChatKernelStatus: () => Promise<ChatKernelStatusResultPayload>;
  orchestrateChatWithKernel: (
    request: ChatKernelOrchestrationRequestPayload,
  ) => Promise<ChatKernelOrchestrationResultPayload>;

  // ─── Database domain APIs ─────────────────────────────────
  tasks: {
    list: (filter?: { status?: string; parentId?: string | null; today?: boolean }) => Promise<Task[]>;
    create: (input: Record<string, unknown>) => Promise<Task>;
    update: (input: Record<string, unknown>) => Promise<Task>;
    delete: (id: string) => Promise<void>;
    reorder: (ids: string[]) => Promise<void>;
    complete: (id: string) => Promise<Task>;
    toggleToday: (id: string) => Promise<Task>;
  };
  chat: {
    send: (message: ChatSendRequest) => Promise<ChatSendResult>;
    onStreamEvent: (
      listener: (event: ChatStreamEventPayload) => void,
    ) => () => void;
    history: () => Promise<ChatMessage[]>;
    clear: () => Promise<void>;
    getModels: () => Promise<ChatModelCatalogResult>;
    getSelectedModel: () => Promise<ChatSelectedModelResult>;
    setSelectedModel: (payload: ChatSetModelRequest) => Promise<ChatSelectedModelResult>;
    undoLastAction: (payload?: ChatUndoRequest) => Promise<ChatUndoResult>;
    getRetentionMode: () => Promise<ChatRetentionResult>;
    setRetentionMode: (payload: ChatSetRetentionRequest) => Promise<ChatRetentionResult>;
    getLiveThought: () => Promise<ChatLiveThoughtResult>;
  };
  scratchpad: {
    get: () => Promise<Scratchpad>;
    save: (content: string) => Promise<Scratchpad>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<Setting>;
    getAll: () => Promise<Setting[]>;
    getMemoryState: () => Promise<SettingsMemoryStatePayload>;
    updateMemoryState: (payload: SettingsMemoryUpdateRequestPayload) => Promise<SettingsMemoryStatePayload>;
    resetSoul: () => Promise<SettingsMemoryStatePayload>;
    readJournal: (payload?: SettingsReadJournalRequestPayload) => Promise<SettingsReadJournalResultPayload>;
  };
};

declare global {
  interface Window {
    flusk?: FluskApi;
  }
}

export {};
