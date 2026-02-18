import { contextBridge, ipcRenderer } from 'electron';

import {
  type ChatModelCatalogResult,
  type ChatKernelOrchestrationRequestPayload,
  type ChatKernelOrchestrationResultPayload,
  type ChatKernelStatusResultPayload,

  type ChatHistoryRequest,
  type ChatListThreadsRequest,
  type ChatListThreadsResult,
  type ChatCreateThreadRequest,
  type ChatCreateThreadResult,
  type ChatArchiveThreadRequest,
  type ChatDeleteThreadRequest,
  type ChatRetentionResult,
  type ChatSelectedModelResult,
  type ChatSendRequest,
  type ChatSendResult,
  type ChatSetModelRequest,
  type ChatSetRetentionRequest,
  type ChatStreamEventPayload,
  type ChatUndoRequest,
  type ChatUndoResult,
  type ChatAutonomyModeResult,
  type ChatSetAutonomyModeRequest,
  type ChatResolvePendingActionRequest,
  type ChatResolvePendingActionResponse,
  type ChatListPendingActionsResponse,
  type ChatFocusMessagePayload,
  IPC_CHANNELS,
  type IdentityContextSnapshotRequest,
  type IdentityContextSnapshotResult,
  type LaunchAtLoginResult,
  type WindowDismissMode,
  type WindowDismissModeResult,
  type MemoryPromotionConfirmRequestPayload,
  type MemoryPromotionConfirmResultPayload,
  type MemoryPromotionEvaluationRequestPayload,
  type MemoryPromotionEvaluationResultPayload,
  type BackupExportRequest,
  type BackupExportDialogRequest,
  type BackupExportDialogResponse,
  type BackupImportRequest,
  type BackupImportDialogRequest,
  type BackupImportDialogResponse,
  type BackupListResponse,
  type BackupMetadataPayload,
  type QuickAddPayload,
  type SearchQueryRequest,
  type SearchQueryResponse,
  type TaskDeleteRequestPayload,
  type TaskCompleteRequestPayload,
  type SettingsMemoryStatePayload,
  type SettingsMemoryHistoryRequestPayload,
  type SettingsMemoryHistoryResultPayload,
  type SettingsMemoryUpdateRequestPayload,
  type SettingsUndoMemoryEventRequestPayload,
  type SettingsUndoMemoryEventResultPayload,
  type SettingsReadJournalRequestPayload,
  type SettingsReadJournalResultPayload,
  type SettingsBootstrapState,
  type SettingsGetAiEnabledResult,
  type SettingsSetAiEnabledResult,
  type ApiKeysHasResult,
  type ApiKeysValidateResult,
  type AttachmentSaveRequest,
  type AttachmentIdRequest,
  type AttachmentPickAndSaveResult,
} from '../types/ipc';
import type { Task, TaskStatusConfig } from '../types/models';
import type { UntaskApi } from '../types/preload';

const untaskApi: UntaskApi = {
  // ─── App/window lifecycle APIs ──────────────────────────
  app: {
    requestHide: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_REQUEST_HIDE),
    escapeLayerExit: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_ESCAPE_LAYER_EXIT),
    onQuickAddPayload: (
      listener: (payload: QuickAddPayload) => void,
    ): (() => void) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: QuickAddPayload,
      ) => listener(payload);

      ipcRenderer.on(IPC_CHANNELS.APP_QUICK_ADD_PAYLOAD, wrapped);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.APP_QUICK_ADD_PAYLOAD, wrapped);
      };
    },
    onBackupRestored: (listener: () => void): (() => void) => {
      const wrapped = (): void => listener();

      ipcRenderer.on(IPC_CHANNELS.APP_BACKUP_RESTORED, wrapped);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.APP_BACKUP_RESTORED, wrapped);
      };
    },
    getLaunchAtLogin: (): Promise<LaunchAtLoginResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_LAUNCH_AT_LOGIN),
    setLaunchAtLogin: (enabled: boolean): Promise<LaunchAtLoginResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_LAUNCH_AT_LOGIN, enabled),
    getWindowDismissMode: (): Promise<WindowDismissModeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_WINDOW_DISMISS_MODE),
    setWindowDismissMode: (mode: WindowDismissMode): Promise<WindowDismissModeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_WINDOW_DISMISS_MODE, mode),
  },

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
  getChatKernelStatus: (): Promise<ChatKernelStatusResultPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_KERNEL_STATUS),
  orchestrateChatWithKernel: (
    request: ChatKernelOrchestrationRequestPayload,
  ): Promise<ChatKernelOrchestrationResultPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_ORCHESTRATE_WITH_KERNEL, request),
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
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, filter),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, input),
    update: (input: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, input),
    delete: (payload: TaskDeleteRequestPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, payload),
    reorder: (ids: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_REORDER, ids),
    complete: (payload: TaskCompleteRequestPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_COMPLETE, payload),
    cancel: (id: string): Promise<Task> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_CANCEL, id),
    reopen: (id: string): Promise<Task> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_REOPEN, id),
    toggleToday: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_TOGGLE_TODAY, id),
    getStatuses: (): Promise<TaskStatusConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_STATUSES),
    setStatuses: (config: TaskStatusConfig): Promise<TaskStatusConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_SET_STATUSES, config),
  },
  chat: {
    send: (message: ChatSendRequest): Promise<ChatSendResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, message),
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CANCEL),
    onStreamEvent: (
      listener: (event: ChatStreamEventPayload) => void,
    ): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: ChatStreamEventPayload) =>
        listener(payload);

      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_EVENT, wrapped);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_EVENT, wrapped);
      };
    },
    onFocusMessage: (
      listener: (payload: ChatFocusMessagePayload) => void,
    ): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: ChatFocusMessagePayload) =>
        listener(payload);

      ipcRenderer.on(IPC_CHANNELS.CHAT_FOCUS_MESSAGE, wrapped);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CHAT_FOCUS_MESSAGE, wrapped);
      };
    },
    history: (payload: ChatHistoryRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY, payload),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CLEAR),
    listThreads: (
      payload?: ChatListThreadsRequest,
    ): Promise<ChatListThreadsResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_LIST_THREADS, payload),
    createThread: (
      payload?: ChatCreateThreadRequest,
    ): Promise<ChatCreateThreadResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_CREATE_THREAD, payload),
    archiveThread: (payload: ChatArchiveThreadRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_ARCHIVE_THREAD, payload),
    deleteThread: (payload: ChatDeleteThreadRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_DELETE_THREAD, payload),
    getModels: (): Promise<ChatModelCatalogResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_MODELS),
    getSelectedModel: (): Promise<ChatSelectedModelResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_SELECTED_MODEL),
    setSelectedModel: (
      payload: ChatSetModelRequest,
    ): Promise<ChatSelectedModelResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_SELECTED_MODEL, payload),
    undoLastAction: (payload?: ChatUndoRequest): Promise<ChatUndoResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_UNDO_LAST_ACTION, payload),
    getRetentionMode: (): Promise<ChatRetentionResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_RETENTION_MODE),
    setRetentionMode: (
      payload: ChatSetRetentionRequest,
    ): Promise<ChatRetentionResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_RETENTION_MODE, payload),
    getAutonomyMode: (): Promise<ChatAutonomyModeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_AUTONOMY_MODE),
    setAutonomyMode: (
      payload: ChatSetAutonomyModeRequest,
    ): Promise<ChatAutonomyModeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_AUTONOMY_MODE, payload),
    resolvePendingAction: (
      payload: ChatResolvePendingActionRequest,
    ): Promise<ChatResolvePendingActionResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_RESOLVE_PENDING_ACTION, payload),
    listPendingActions: (): Promise<ChatListPendingActionsResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_LIST_PENDING_ACTIONS),
  },
  backup: {
    list: (): Promise<BackupListResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST),
    create: (): Promise<BackupMetadataPayload> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE),
    export: (request: BackupExportRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_EXPORT, request),
    exportWithDialog: (
      request?: BackupExportDialogRequest,
    ): Promise<BackupExportDialogResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_EXPORT_DIALOG, request),
    import: (request: BackupImportRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_IMPORT, request),
    importWithDialog: (
      request?: BackupImportDialogRequest,
    ): Promise<BackupImportDialogResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_IMPORT_DIALOG, request),
  },
  search: {
    query: (request: SearchQueryRequest): Promise<SearchQueryResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH_QUERY, request),
  },
  notes: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.NOTES_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.NOTES_GET, id),
    create: (title?: string) => ipcRenderer.invoke(IPC_CHANNELS.NOTES_CREATE, title),
    save: (id: string, content: string, title?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES_SAVE, id, content, title),
    archive: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.NOTES_ARCHIVE, id),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.NOTES_DELETE, id),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
    getMemoryState: (): Promise<SettingsMemoryStatePayload> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_MEMORY_STATE),
    updateMemoryState: (
      payload: SettingsMemoryUpdateRequestPayload,
    ): Promise<SettingsMemoryStatePayload> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE_MEMORY_STATE, payload),
    getMemoryHistory: (
      payload?: SettingsMemoryHistoryRequestPayload,
    ): Promise<SettingsMemoryHistoryResultPayload> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_MEMORY_HISTORY, payload),
    undoMemoryEvent: (
      payload?: SettingsUndoMemoryEventRequestPayload,
    ): Promise<SettingsUndoMemoryEventResultPayload> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UNDO_MEMORY_EVENT, payload),
    readJournal: (
      payload?: SettingsReadJournalRequestPayload,
    ): Promise<SettingsReadJournalResultPayload> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_READ_JOURNAL, payload),
    getAiEnabled: (): Promise<SettingsGetAiEnabledResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_AI_ENABLED),
    setAiEnabled: (enabled: boolean): Promise<SettingsSetAiEnabledResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_AI_ENABLED, { enabled }),
  },
  apiKeys: {
    has: (provider: string): Promise<ApiKeysHasResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS_HAS, { provider }),
    set: (provider: string, key: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS_SET, { provider, key }),
    delete: (provider: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS_DELETE, { provider }),
    validate: (provider: string, key: string): Promise<ApiKeysValidateResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEYS_VALIDATE, { provider, key }),
  },
  attachments: {
    save: (request: AttachmentSaveRequest): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.ATTACHMENT_SAVE, request),
    open: (request: AttachmentIdRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ATTACHMENT_OPEN, request),
    reveal: (request: AttachmentIdRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ATTACHMENT_REVEAL, request),
    delete: (request: AttachmentIdRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ATTACHMENT_DELETE, request),
    read: (request: AttachmentIdRequest): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.ATTACHMENT_READ, request),
    pickAndSave: (): Promise<AttachmentPickAndSaveResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.ATTACHMENT_PICK_AND_SAVE),
  },
};

contextBridge.exposeInMainWorld('untask', untaskApi);
