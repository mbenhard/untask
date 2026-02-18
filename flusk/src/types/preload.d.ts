import type {
  ChatModelCatalogResult,
  ChatKernelOrchestrationRequestPayload,
  ChatKernelOrchestrationResultPayload,
  ChatKernelStatusResultPayload,

  ChatHistoryRequest,
  ChatListThreadsRequest,
  ChatListThreadsResult,
  ChatCreateThreadRequest,
  ChatCreateThreadResult,
  ChatArchiveThreadRequest,
  ChatDeleteThreadRequest,
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
  SettingsGetAiEnabledResult,
  SettingsSetAiEnabledResult,
  ApiKeysHasResult,
  ApiKeysValidateResult,
} from './ipc';

import type { Task, TaskStatusConfig, ChatMessage, Note, Setting } from './models';

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
    cancel: (id: string) => Promise<Task>;
    reopen: (id: string) => Promise<Task>;
    toggleToday: (id: string) => Promise<Task>;
    getStatuses: () => Promise<TaskStatusConfig>;
    setStatuses: (config: TaskStatusConfig) => Promise<TaskStatusConfig>;
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
    history: (payload: ChatHistoryRequest) => Promise<ChatMessage[]>;
    clear: () => Promise<void>;
    listThreads: (payload?: ChatListThreadsRequest) => Promise<ChatListThreadsResult>;
    createThread: (payload?: ChatCreateThreadRequest) => Promise<ChatCreateThreadResult>;
    archiveThread: (payload: ChatArchiveThreadRequest) => Promise<void>;
    deleteThread: (payload: ChatDeleteThreadRequest) => Promise<void>;
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
  notes: {
    list: () => Promise<{ active: Note[]; archived: Note[] }>;
    get: (id: string) => Promise<Note | undefined>;
    create: (title?: string) => Promise<Note>;
    save: (id: string, content: string, title?: string) => Promise<Note | undefined>;
    archive: (id: string) => Promise<Note | undefined>;
    delete: (id: string) => Promise<void>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<Setting>;
    getAll: () => Promise<Setting[]>;
    getMemoryState: () => Promise<SettingsMemoryStatePayload>;
    updateMemoryState: (payload: SettingsMemoryUpdateRequestPayload) => Promise<SettingsMemoryStatePayload>;
    getMemoryHistory: (payload?: SettingsMemoryHistoryRequestPayload) => Promise<SettingsMemoryHistoryResultPayload>;
    undoMemoryEvent: (payload?: SettingsUndoMemoryEventRequestPayload) => Promise<SettingsUndoMemoryEventResultPayload>;
    readJournal: (payload?: SettingsReadJournalRequestPayload) => Promise<SettingsReadJournalResultPayload>;
    getAiEnabled: () => Promise<SettingsGetAiEnabledResult>;
    setAiEnabled: (enabled: boolean) => Promise<SettingsSetAiEnabledResult>;
  };
  apiKeys: {
    has: (provider: string) => Promise<ApiKeysHasResult>;
    set: (provider: string, key: string) => Promise<void>;
    delete: (provider: string) => Promise<void>;
    validate: (provider: string, key: string) => Promise<ApiKeysValidateResult>;
  };
};

declare global {
  interface Window {
    flusk?: FluskApi;
  }
}

export {};
