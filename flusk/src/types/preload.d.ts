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
  ChatAutonomyModeResult,
  ChatSetAutonomyModeRequest,
  ChatResolvePendingActionRequest,
  ChatResolvePendingActionResponse,
  ChatListPendingActionsResponse,
  IdentityContextSnapshotRequest,
  IdentityContextSnapshotResult,
  LaunchAtLoginResult,
  MemoryPromotionConfirmRequestPayload,
  MemoryPromotionConfirmResultPayload,
  MemoryPromotionEvaluationRequestPayload,
  MemoryPromotionEvaluationResultPayload,
  ProactiveTriggerEvaluationRequestPayload,
  ProactiveTriggerEvaluationResultPayload,
  BackupExportRequest,
  BackupExportDialogRequest,
  BackupExportDialogResponse,
  BackupImportRequest,
  BackupImportDialogRequest,
  BackupImportDialogResponse,
  BackupListResponse,
  BackupMetadataPayload,
  QuickAddPayload,
  SearchQueryRequest,
  SearchQueryResponse,
  SettingsMemoryStatePayload,
  SettingsMemoryUpdateRequestPayload,
  SettingsReadJournalRequestPayload,
  SettingsReadJournalResultPayload,
  SettingsBootstrapState,
} from './ipc';

import type { Task, ChatMessage, Scratchpad, Setting } from './models';

export type FluskApi = {
  // ─── App/window lifecycle APIs ──────────────────────────
  app: {
    requestHide: () => Promise<void>;
    escapeLayerExit: () => Promise<void>;
    onQuickAddPayload: (listener: (payload: QuickAddPayload) => void) => () => void;
    onBackupRestored: (listener: () => void) => () => void;
    getLaunchAtLogin: () => Promise<LaunchAtLoginResult>;
    setLaunchAtLogin: (enabled: boolean) => Promise<LaunchAtLoginResult>;
  };

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
    cancel: () => Promise<void>;
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
    getAutonomyMode: () => Promise<ChatAutonomyModeResult>;
    setAutonomyMode: (payload: ChatSetAutonomyModeRequest) => Promise<ChatAutonomyModeResult>;
    resolvePendingAction: (payload: ChatResolvePendingActionRequest) => Promise<ChatResolvePendingActionResponse>;
    listPendingActions: () => Promise<ChatListPendingActionsResponse>;
  };
  backup: {
    list: () => Promise<BackupListResponse>;
    create: () => Promise<BackupMetadataPayload>;
    export: (request: BackupExportRequest) => Promise<void>;
    exportWithDialog: (request?: BackupExportDialogRequest) => Promise<BackupExportDialogResponse>;
    import: (request: BackupImportRequest) => Promise<void>;
    importWithDialog: (request?: BackupImportDialogRequest) => Promise<BackupImportDialogResponse>;
  };
  search: {
    query: (request: SearchQueryRequest) => Promise<SearchQueryResponse>;
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
