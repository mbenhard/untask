import type {
  ChatKernelOrchestrationRequest,
  ChatKernelOrchestrationResult,
  IdentityKernelStatus,
  IdentityContextCompileRequest,
  IdentityContextDebugSnapshot,
  MemoryPromotionConfirmRequest,
  MemoryPromotionConfirmResult,
  MemoryPromotionEvaluationRequest,
  MemoryPromotionDecision,
} from './assistant';
import type {
  ChatModelCatalogEntry,
  ChatListConversationsRequestPayload,
  ChatListConversationsResultPayload,
  ChatCreateConversationRequestPayload,
  ChatCreateConversationResultPayload,
  ChatArchiveConversationRequestPayload,
  ChatDeleteConversationRequestPayload,
  ChatRetentionPayload,
  ChatSendRequestPayload,
  ChatSendResultPayload,
  ChatSelectedModelPayload,
  ChatSetModelPayload,
  ChatSetRetentionPayload,
  ChatStreamEvent,

  ChatUndoRequestPayload,
  ChatUndoResultPayload,
  ChatGetAutonomyModePayload,
  ChatSetAutonomyModePayload,
  ChatResolvePendingActionPayload,
  ChatResolvePendingActionResult,
  ChatListPendingActionsResult,
  ChatExecuteChipActionPayload,
  ChatExecuteChipActionResult,
} from './chat';
import type { AiJournal, Task } from './models';

export const IPC_CHANNELS = {
  // ─── App/window lifecycle channels ──────────────────────
  APP_REQUEST_HIDE: 'app:request-hide',
  APP_ESCAPE_LAYER_EXIT: 'app:escape-layer-exit',
  APP_QUICK_ADD_PAYLOAD: 'app:quick-add-payload',
  APP_BACKUP_RESTORED: 'app:backup-restored',
  APP_GET_LAUNCH_AT_LOGIN: 'app:get-launch-at-login',
  APP_SET_LAUNCH_AT_LOGIN: 'app:set-launch-at-login',
  APP_GET_WINDOW_DISMISS_MODE: 'app:get-window-dismiss-mode',
  APP_SET_WINDOW_DISMISS_MODE: 'app:set-window-dismiss-mode',

  SETTINGS_GET_BOOTSTRAP_STATE: 'settings:get-bootstrap-state',
  SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT:
    'settings:get-identity-context-snapshot',
  SETTINGS_EVALUATE_MEMORY_PROMOTION: 'settings:evaluate-memory-promotion',
  SETTINGS_CONFIRM_MEMORY_PROMOTION: 'settings:confirm-memory-promotion',
  CHAT_GET_KERNEL_STATUS: 'chat:get-kernel-status',
  CHAT_ORCHESTRATE_WITH_KERNEL: 'chat:orchestrate-with-kernel',
  // ─── Database domain channels ─────────────────────────────
  TASK_LIST: 'task:list',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_REORDER: 'task:reorder',
  TASK_COMPLETE: 'task:complete',
  TASK_TOGGLE_TODAY: 'task:toggle-today',
  CHAT_SEND: 'chat:send',
  CHAT_STREAM_EVENT: 'chat:stream-event',
  CHAT_HISTORY: 'chat:history',
  CHAT_CLEAR: 'chat:clear',
  CHAT_CREATE_THREAD: 'chat:create-thread',
  CHAT_LIST_THREADS: 'chat:list-threads',
  CHAT_ARCHIVE_THREAD: 'chat:archive-thread',
  CHAT_DELETE_THREAD: 'chat:delete-thread',
  CHAT_GET_MODELS: 'chat:get-models',
  CHAT_GET_SELECTED_MODEL: 'chat:get-selected-model',
  CHAT_SET_SELECTED_MODEL: 'chat:set-selected-model',
  CHAT_UNDO_LAST_ACTION: 'chat:undo-last-action',
  CHAT_GET_RETENTION_MODE: 'chat:get-retention-mode',
  CHAT_SET_RETENTION_MODE: 'chat:set-retention-mode',

  CHAT_GET_AUTONOMY_MODE: 'chat:get-autonomy-mode',
  CHAT_SET_AUTONOMY_MODE: 'chat:set-autonomy-mode',
  CHAT_RESOLVE_PENDING_ACTION: 'chat:resolve-pending-action',
  CHAT_CANCEL: 'chat:cancel',
  CHAT_LIST_PENDING_ACTIONS: 'chat:list-pending-actions',
  CHAT_EXECUTE_CHIP_ACTION: 'chat:execute-chip-action',
  CHAT_FOCUS_MESSAGE: 'chat:focus-message',
  BACKUP_LIST: 'backup:list',
  BACKUP_CREATE: 'backup:create',
  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  BACKUP_EXPORT_DIALOG: 'backup:export-dialog',
  BACKUP_IMPORT_DIALOG: 'backup:import-dialog',
  SEARCH_QUERY: 'search:query',
  NOTES_LIST: 'notes:list',
  NOTES_GET: 'notes:get',
  NOTES_CREATE: 'notes:create',
  NOTES_SAVE: 'notes:save',
  NOTES_ARCHIVE: 'notes:archive',
  NOTES_DELETE: 'notes:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_GET_MEMORY_STATE: 'settings:get-memory-state',
  SETTINGS_UPDATE_MEMORY_STATE: 'settings:update-memory-state',
  SETTINGS_READ_JOURNAL: 'settings:read-journal',
  SETTINGS_GET_MEMORY_HISTORY: 'settings:get-memory-history',
  SETTINGS_UNDO_MEMORY_EVENT: 'settings:undo-memory-event',
} as const;

export type SettingsBootstrapState = {
  status: 'ready';
};

export type IdentityContextSnapshotRequest = IdentityContextCompileRequest;
export type IdentityContextSnapshotResult = IdentityContextDebugSnapshot;

export type MemoryPromotionEvaluationRequestPayload =
  MemoryPromotionEvaluationRequest;
export type MemoryPromotionEvaluationResultPayload = MemoryPromotionDecision;
export type MemoryPromotionConfirmRequestPayload = MemoryPromotionConfirmRequest;
export type MemoryPromotionConfirmResultPayload = MemoryPromotionConfirmResult;

export type ChatKernelStatusResultPayload = IdentityKernelStatus;
export type ChatKernelOrchestrationRequestPayload =
  ChatKernelOrchestrationRequest;
export type ChatKernelOrchestrationResultPayload = ChatKernelOrchestrationResult;

export type ChatSendRequest = ChatSendRequestPayload;
export type ChatSendResult = ChatSendResultPayload;
export type ChatHistoryRequest = {
  conversationId: string;
};
export type ChatListThreadsRequest = ChatListConversationsRequestPayload;
export type ChatListThreadsResult = ChatListConversationsResultPayload;
export type ChatCreateThreadRequest = ChatCreateConversationRequestPayload;
export type ChatCreateThreadResult = ChatCreateConversationResultPayload;
export type ChatArchiveThreadRequest = ChatArchiveConversationRequestPayload;
export type ChatDeleteThreadRequest = ChatDeleteConversationRequestPayload;
export type ChatStreamEventPayload = ChatStreamEvent;
export type ChatModelCatalogResult = ChatModelCatalogEntry[];
export type ChatSelectedModelResult = ChatSelectedModelPayload;
export type ChatSetModelRequest = ChatSetModelPayload;
export type ChatUndoRequest = ChatUndoRequestPayload;
export type ChatUndoResult = ChatUndoResultPayload;
export type ChatRetentionResult = ChatRetentionPayload;
export type ChatSetRetentionRequest = ChatSetRetentionPayload;
export type ChatAutonomyModeResult = ChatGetAutonomyModePayload;
export type ChatSetAutonomyModeRequest = ChatSetAutonomyModePayload;
export type ChatResolvePendingActionRequest = ChatResolvePendingActionPayload;
export type ChatResolvePendingActionResponse = ChatResolvePendingActionResult;
export type ChatListPendingActionsResponse = ChatListPendingActionsResult;
export type ChatExecuteChipActionRequest = ChatExecuteChipActionPayload;
export type ChatExecuteChipActionResponse = ChatExecuteChipActionResult;
export type ChatFocusMessagePayload = {
  messageId: string;
};

export type SettingsMemoryStatePayload = {
  identity: string;
  memory: string;
};

export type SettingsMemoryUpdateRequestPayload = Partial<SettingsMemoryStatePayload>;

export type SettingsReadJournalRequestPayload = {
  category?: 'pattern' | 'progress' | 'preference' | 'summary';
  limit?: number;
  days_back?: number;
  daysBack?: number;
};

export type SettingsReadJournalResultPayload = {
  entries: AiJournal[];
};

export type SettingsMemoryEventPayload = {
  id: string;
  layer: 'soul' | 'profile' | 'patterns' | 'identity' | 'memory';
  before: string;
  after: string;
  source: 'user' | 'ai' | 'system';
  createdAt: string | null;
};

export type SettingsMemoryHistoryRequestPayload = {
  layer?: 'soul' | 'profile' | 'patterns' | 'identity' | 'memory';
  limit?: number;
};

export type SettingsMemoryHistoryResultPayload = {
  events: SettingsMemoryEventPayload[];
};

export type SettingsUndoMemoryEventRequestPayload = {
  eventId?: string;
  steps?: number;
};

export type SettingsUndoMemoryEventResultPayload = {
  state: SettingsMemoryStatePayload;
  revertedEventIds: string[];
};

export type TaskDeleteRequestPayload = string | {
  id: string;
  cascade?: boolean;
};

export type TaskCompleteRequestPayload = string | {
  id: string;
  completeChildren?: boolean;
};

// ─── App/window lifecycle payloads ────────────────────────

export type QuickAddPayload = {
  text: string;
  source: 'clipboard-url' | 'clipboard-text' | 'empty';
};

export type LaunchAtLoginPayload = {
  enabled: boolean;
};

export type LaunchAtLoginResult = {
  enabled: boolean;
  applied: boolean;
  error?: string;
};

export type WindowDismissMode = 'persistent' | 'quick-hide';

export type WindowDismissModeResult = {
  mode: WindowDismissMode;
};

// ─── Backup payloads ──────────────────────────────────────

export type BackupMetadataPayload = {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
};

export type BackupListResponse = {
  backups: BackupMetadataPayload[];
};

export type BackupExportRequest = {
  destination: string;
  passphrase?: string;
};

export type BackupImportRequest = {
  source: string;
  passphrase?: string;
};

export type BackupExportDialogRequest = {
  passphrase?: string;
};

export type BackupExportDialogResponse = {
  canceled: boolean;
  destination?: string;
};

export type BackupImportDialogRequest = {
  passphrase?: string;
};

export type BackupImportDialogResponse = {
  canceled: boolean;
  source?: string;
  restored: boolean;
};

// ─── Search payloads ──────────────────────────────────────

export type SearchQueryRequest = {
  query: string;
  limit?: number;
};

export type SearchResultItem = {
  id: string;
  parentId: string | null;
  title: string;
  body: string | null;
  status: Task['status'];
  today: boolean;
  client: Task['client'];
  priority: Task['priority'];
  dueDate: string | null;
  snippet: string;
};

export type SearchQueryResponse = {
  results: SearchResultItem[];
  total: number;
};
