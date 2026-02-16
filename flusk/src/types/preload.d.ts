import type {
  ChatModelCatalogResult,
  ChatKernelOrchestrationRequestPayload,
  ChatKernelOrchestrationResultPayload,
  ChatKernelStatusResultPayload,

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
  ChatExecuteChipActionRequest,
  ChatExecuteChipActionResponse,
  ChatFocusMessagePayload,
  IdentityContextSnapshotRequest,
  IdentityContextSnapshotResult,
  LaunchAtLoginResult,
  WindowDismissMode,
  WindowDismissModeResult,
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
  SettingsMemoryHistoryRequestPayload,
  SettingsMemoryHistoryResultPayload,
  SettingsMemoryUpdateRequestPayload,
  SettingsUndoMemoryEventRequestPayload,
  SettingsUndoMemoryEventResultPayload,
  SettingsReadJournalRequestPayload,
  SettingsReadJournalResultPayload,
  SettingsBootstrapState,
  TaskDeleteRequestPayload,
  TaskCompleteRequestPayload,
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
    getWindowDismissMode: () => Promise<WindowDismissModeResult>;
    setWindowDismissMode: (mode: WindowDismissMode) => Promise<WindowDismissModeResult>;
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
    list: (filter?: {
      status?: Exclude<Task['status'], null>;
      parentId?: string | null;
      today?: boolean;
      priority?: Task['priority'];
      client?: string;
      search?: string;
      limit?: number;
    }) => Promise<Task[]>;
    create: (input: Record<string, unknown>) => Promise<Task>;
    update: (input: Record<string, unknown>) => Promise<Task>;
    delete: (payload: TaskDeleteRequestPayload) => Promise<void>;
    reorder: (ids: string[]) => Promise<void>;
    complete: (payload: TaskCompleteRequestPayload) => Promise<Task>;
    toggleToday: (id: string) => Promise<Task>;
  };
  chat: {
    send: (message: ChatSendRequest) => Promise<ChatSendResult>;
    cancel: () => Promise<void>;
    onStreamEvent: (
      listener: (event: ChatStreamEventPayload) => void,
    ) => () => void;
    onFocusMessage: (
      listener: (payload: ChatFocusMessagePayload) => void,
    ) => () => void;
    history: () => Promise<ChatMessage[]>;
    clear: () => Promise<void>;
    getModels: () => Promise<ChatModelCatalogResult>;
    getSelectedModel: () => Promise<ChatSelectedModelResult>;
    setSelectedModel: (payload: ChatSetModelRequest) => Promise<ChatSelectedModelResult>;
    undoLastAction: (payload?: ChatUndoRequest) => Promise<ChatUndoResult>;
    getRetentionMode: () => Promise<ChatRetentionResult>;
    setRetentionMode: (payload: ChatSetRetentionRequest) => Promise<ChatRetentionResult>;

    getAutonomyMode: () => Promise<ChatAutonomyModeResult>;
    setAutonomyMode: (payload: ChatSetAutonomyModeRequest) => Promise<ChatAutonomyModeResult>;
    resolvePendingAction: (payload: ChatResolvePendingActionRequest) => Promise<ChatResolvePendingActionResponse>;
    listPendingActions: () => Promise<ChatListPendingActionsResponse>;
    executeChipAction: (payload: ChatExecuteChipActionRequest) => Promise<ChatExecuteChipActionResponse>;
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
    getMemoryHistory: (payload?: SettingsMemoryHistoryRequestPayload) => Promise<SettingsMemoryHistoryResultPayload>;
    undoMemoryEvent: (payload?: SettingsUndoMemoryEventRequestPayload) => Promise<SettingsUndoMemoryEventResultPayload>;
    readJournal: (payload?: SettingsReadJournalRequestPayload) => Promise<SettingsReadJournalResultPayload>;
  };
};

declare global {
  interface Window {
    flusk?: FluskApi;
  }
}

export {};
