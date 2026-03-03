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
  TaskNavigatePayload,
  IdentityContextSnapshotRequest,
  IdentityContextSnapshotResult,
  LaunchAtLoginResult,
  DockMode,
  DockModeResult,
  UiScale,
  UiScaleResult,
  MemoryPromotionConfirmRequestPayload,
  MemoryPromotionConfirmResultPayload,
  MemoryPromotionEvaluationRequestPayload,
  MemoryPromotionEvaluationResultPayload,
  BackupImportRequest,
  BackupOffsiteManifestPayload,
  BackupOffsiteReadManifestRequest,
  BackupOffsiteRestoreRequest,
  BackupSettingsPayload,
  BackupSetSettingsRequest,
  BackupPickDestinationFolderResponse,
  BackupPickOffsiteFileResponse,
  BackupListWithManifestsResponse,
  BackupDeleteRequest,
  BackupRevealRequest,
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
  TaskUndoResultPayload,
  SettingsGetAiEnabledResult,
  SettingsSetAiEnabledResult,
  ApiKeysHasResult,
  ApiKeysValidateResult,
  UpdateInfo,
  AttachmentSaveRequest,
  AttachmentIdRequest,
  AttachmentPickAndSaveResult,
  NotificationPermissionResult,
  RemindersStatusResult,
  RemindersSyncStatusPayload,
  RemindersSyncFilter,
  ShortcutRegistrationStatusResult,
  OllamaStatusResult,
  OllamaPullRequest,
  OllamaPullResult,
  OllamaPullProgressPayload,
  OllamaWarmupRequest,
  OllamaWarmupResult,
} from './ipc';

import type { Task, TaskStatusConfig, ChatMessage, Note, Setting } from './models';

export type UntaskApi = {
  // ─── App/window lifecycle APIs ──────────────────────────
  app: {
    requestHide: () => Promise<void>;
    escapeLayerExit: () => Promise<void>;
    onBackupRestored: (listener: () => void) => () => void;
    getLaunchAtLogin: () => Promise<LaunchAtLoginResult>;
    setLaunchAtLogin: (enabled: boolean) => Promise<LaunchAtLoginResult>;
    getDockMode: () => Promise<DockModeResult>;
    setDockMode: (mode: DockMode) => Promise<DockModeResult>;
    getUiScale: () => Promise<UiScaleResult>;
    setUiScale: (scale: UiScale) => Promise<UiScaleResult>;
    getVersion: () => Promise<string>;
    onMenuNewTask: (listener: () => void) => () => void;
    onMenuNewNote: (listener: () => void) => () => void;
    onMenuSettings: (listener: () => void) => () => void;
    checkForUpdates: () => Promise<UpdateInfo>;
    getUpdateInfo: () => Promise<UpdateInfo | null>;
    onUpdateAvailable: (listener: (info: UpdateInfo) => void) => () => void;
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
    onTaskNavigate: (listener: (payload: TaskNavigatePayload) => void) => () => void;
    onTaskDataChanged: (listener: () => void) => () => void;
    getStatuses: () => Promise<TaskStatusConfig>;
    setStatuses: (config: TaskStatusConfig) => Promise<TaskStatusConfig>;
    undoLastUserAction: () => Promise<TaskUndoResultPayload>;
    redoLastUserAction: () => Promise<TaskUndoResultPayload>;
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
    getOllamaStatus: () => Promise<OllamaStatusResult>;
    pullOllamaModel: (request: OllamaPullRequest) => Promise<OllamaPullResult>;
    cancelOllamaPull: () => Promise<void>;
    warmupOllama: (request: OllamaWarmupRequest) => Promise<OllamaWarmupResult>;
    onOllamaPullProgress: (listener: (event: OllamaPullProgressPayload) => void) => () => void;
  };
  backup: {
    create: () => Promise<void>;
    import: (request: BackupImportRequest) => Promise<void>;
    offsiteCreate: () => Promise<void>;
    readOffsiteManifest: (request: BackupOffsiteReadManifestRequest) => Promise<BackupOffsiteManifestPayload>;
    restoreOffsite: (request: BackupOffsiteRestoreRequest) => Promise<void>;
    getSettings: () => Promise<BackupSettingsPayload>;
    setSettings: (request: BackupSetSettingsRequest) => Promise<BackupSettingsPayload>;
    pickDestinationFolder: () => Promise<BackupPickDestinationFolderResponse>;
    pickOffsiteFile: () => Promise<BackupPickOffsiteFileResponse>;
    listWithManifests: () => Promise<BackupListWithManifestsResponse>;
    delete: (request: BackupDeleteRequest) => Promise<void>;
    reveal: (request: BackupRevealRequest) => Promise<void>;
  };
  search: {
    query: (request: SearchQueryRequest) => Promise<SearchQueryResponse>;
  };
  notes: {
    list: () => Promise<{ active: Note[]; archived: Note[] }>;
    get: (id: string) => Promise<Note | undefined>;
    create: () => Promise<Note>;
    save: (id: string, content: string) => Promise<Note | undefined>;
    archive: (id: string) => Promise<Note | undefined>;
    restore: (id: string) => Promise<Note | undefined>;
    permanentDelete: (id: string) => Promise<boolean>;
    pin: (id: string) => Promise<Note | undefined>;
    unpin: (id: string) => Promise<Note | undefined>;
    duplicate: (id: string) => Promise<Note | undefined>;
  };
  shortcuts: {
    reRegister: () => Promise<void>;
    getRegistrationStatus: () => Promise<ShortcutRegistrationStatusResult>;
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
    getBootstrapCompleted: () => Promise<{ completed: boolean }>;
    markBootstrapCompleted: () => Promise<void>;
    setUserName: (name: string) => Promise<void>;
    setIdentity: (identity: string) => Promise<void>;
  };
  apiKeys: {
    has: (provider: string) => Promise<ApiKeysHasResult>;
    set: (provider: string, key: string) => Promise<void>;
    delete: (provider: string) => Promise<void>;
    validate: (provider: string, key: string) => Promise<ApiKeysValidateResult>;
  };
  attachments: {
    save: (request: AttachmentSaveRequest) => Promise<string>;
    open: (request: AttachmentIdRequest) => Promise<void>;
    reveal: (request: AttachmentIdRequest) => Promise<void>;
    delete: (request: AttachmentIdRequest) => Promise<void>;
    read: (request: AttachmentIdRequest) => Promise<string>;
    pickAndSave: () => Promise<AttachmentPickAndSaveResult>;
  };
  notifications: {
    fireTest: () => Promise<NotificationPermissionResult>;
    probePermission: () => Promise<NotificationPermissionResult>;
    openSettings: () => Promise<void>;
  };
  reminders: {
    getStatus: () => Promise<RemindersStatusResult>;
    toggle: (enabled: boolean) => Promise<void>;
    setFilter: (filter: RemindersSyncFilter) => Promise<void>;
    setImport: (enabled: boolean) => Promise<void>;
    requestAccess: () => Promise<{ granted: boolean }>;
    forceSync: () => Promise<void>;
    pullOnly: () => Promise<void>;
    onSyncStatus: (listener: (payload: RemindersSyncStatusPayload) => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openInTerminal: (command: string) => Promise<void>;
  };
};

declare global {
  interface Window {
    untask?: UntaskApi;
  }
}

export { };
