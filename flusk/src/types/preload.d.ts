import type {
  ChatKernelOrchestrationRequestPayload,
  ChatKernelOrchestrationResultPayload,
  ChatKernelStatusResultPayload,
  IdentityContextSnapshotRequest,
  IdentityContextSnapshotResult,
  MemoryPromotionConfirmRequestPayload,
  MemoryPromotionConfirmResultPayload,
  MemoryPromotionEvaluationRequestPayload,
  MemoryPromotionEvaluationResultPayload,
  ProactiveTriggerEvaluationRequestPayload,
  ProactiveTriggerEvaluationResultPayload,
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
    send: (message: { content: string; toolCalls?: string }) => Promise<ChatMessage>;
    history: () => Promise<ChatMessage[]>;
    clear: () => Promise<void>;
  };
  scratchpad: {
    get: () => Promise<Scratchpad>;
    save: (content: string) => Promise<Scratchpad>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<Setting>;
    getAll: () => Promise<Setting[]>;
  };
};

declare global {
  interface Window {
    flusk?: FluskApi;
  }
}

export {};
