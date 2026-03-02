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
} from './chat';
import type { AiJournal, Task } from './models';

export const IPC_CHANNELS = {
  // ─── App/window lifecycle channels ──────────────────────
  APP_REQUEST_HIDE: 'app:request-hide',
  APP_ESCAPE_LAYER_EXIT: 'app:escape-layer-exit',
  APP_BACKUP_RESTORED: 'app:backup-restored',
  APP_GET_LAUNCH_AT_LOGIN: 'app:get-launch-at-login',
  APP_SET_LAUNCH_AT_LOGIN: 'app:set-launch-at-login',
  APP_GET_WINDOW_DISMISS_MODE: 'app:get-window-dismiss-mode',
  APP_SET_WINDOW_DISMISS_MODE: 'app:set-window-dismiss-mode',
  APP_MENU_NEW_TASK: 'app:menu-new-task',
  APP_MENU_NEW_NOTE: 'app:menu-new-note',
  APP_MENU_SETTINGS: 'app:menu-settings',
  APP_GET_DOCK_MODE: 'app:get-dock-mode',
  APP_SET_DOCK_MODE: 'app:set-dock-mode',
  APP_GET_VERSION: 'app:get-version',
  SHORTCUT_UPDATE: 'shortcut:update',
  SHORTCUT_GET_REGISTRATION_STATUS: 'shortcut:get-registration-status',

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
  TASK_CANCEL: 'task:cancel',
  TASK_REOPEN: 'task:reopen',
  TASK_TOGGLE_TODAY: 'task:toggle-today',
  TASK_NAVIGATE: 'task:navigate',
  TASK_GET_STATUSES: 'task:get-statuses',
  TASK_SET_STATUSES: 'task:set-statuses',
  TASK_UNDO_LAST_USER_ACTION: 'task:undo-last-user-action',
  TASK_DATA_CHANGED: 'task:data-changed',
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
  CHAT_FOCUS_MESSAGE: 'chat:focus-message',
  OLLAMA_STATUS: 'ollama:status',
  OLLAMA_PULL: 'ollama:pull',
  OLLAMA_PULL_PROGRESS: 'ollama:pull-progress',
  OLLAMA_PULL_CANCEL: 'ollama:pull-cancel',
  OLLAMA_WARMUP: 'ollama:warmup',
  BACKUP_CREATE: 'backup:create',
  BACKUP_IMPORT: 'backup:import',
  BACKUP_OFFSITE_CREATE: 'backup:offsite-create',
  BACKUP_OFFSITE_READ_MANIFEST: 'backup:offsite-read-manifest',
  BACKUP_OFFSITE_RESTORE: 'backup:offsite-restore',
  BACKUP_GET_SETTINGS: 'backup:get-settings',
  BACKUP_SET_SETTINGS: 'backup:set-settings',
  BACKUP_PICK_DESTINATION_FOLDER: 'backup:pick-destination-folder',
  BACKUP_PICK_OFFSITE_FILE: 'backup:pick-offsite-file',
  BACKUP_LIST_WITH_MANIFESTS: 'backup:list-with-manifests',
  BACKUP_DELETE: 'backup:delete',
  BACKUP_REVEAL: 'backup:reveal',
  SEARCH_QUERY: 'search:query',
  NOTES_LIST: 'notes:list',
  NOTES_GET: 'notes:get',
  NOTES_CREATE: 'notes:create',
  NOTES_SAVE: 'notes:save',
  NOTES_ARCHIVE: 'notes:archive',
  NOTES_RESTORE: 'notes:restore',
  NOTES_PERMANENT_DELETE: 'notes:permanent-delete',
  NOTES_PIN: 'notes:pin',
  NOTES_UNPIN: 'notes:unpin',
  NOTES_DUPLICATE: 'notes:duplicate',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_GET_AI_ENABLED: 'settings:get-ai-enabled',
  SETTINGS_SET_AI_ENABLED: 'settings:set-ai-enabled',
  API_KEYS_HAS: 'api-keys:has',
  API_KEYS_SET: 'api-keys:set',
  API_KEYS_DELETE: 'api-keys:delete',
  API_KEYS_VALIDATE: 'api-keys:validate',
  // ─── Onboarding channels ──────────────────────────────────
  SETTINGS_GET_BOOTSTRAP_COMPLETED: 'settings:get-bootstrap-completed',
  SETTINGS_MARK_BOOTSTRAP_COMPLETED: 'settings:mark-bootstrap-completed',
  SETTINGS_SET_USER_NAME: 'settings:set-user-name',
  SETTINGS_SET_IDENTITY: 'settings:set-identity',
  // ─── Update checker channels ──────────────────────────────
  APP_CHECK_FOR_UPDATES: 'app:check-for-updates',
  APP_GET_UPDATE_INFO: 'app:get-update-info',
  APP_UPDATE_AVAILABLE: 'app:update-available',
  SETTINGS_GET_MEMORY_STATE: 'settings:get-memory-state',
  SETTINGS_UPDATE_MEMORY_STATE: 'settings:update-memory-state',
  SETTINGS_READ_JOURNAL: 'settings:read-journal',
  SETTINGS_GET_MEMORY_HISTORY: 'settings:get-memory-history',
  SETTINGS_UNDO_MEMORY_EVENT: 'settings:undo-memory-event',
  // ─── Reminders sync channels ────────────────────────────
  REMINDERS_GET_STATUS: 'reminders:get-status',
  REMINDERS_TOGGLE: 'reminders:toggle',
  REMINDERS_SET_FILTER: 'reminders:set-filter',
  REMINDERS_SET_IMPORT: 'reminders:set-import',
  REMINDERS_REQUEST_ACCESS: 'reminders:request-access',
  REMINDERS_FORCE_SYNC: 'reminders:force-sync',
  REMINDERS_PULL_ONLY: 'reminders:pull-only',
  REMINDERS_SYNC_STATUS: 'reminders:sync-status',
  // ─── Notification channels ──────────────────────────────
  NOTIFICATIONS_FIRE_TEST: 'notifications:fire-test',
  NOTIFICATIONS_PROBE_PERMISSION: 'notifications:probe-permission',
  NOTIFICATIONS_OPEN_SETTINGS: 'notifications:open-settings',
  // ─── Attachment channels ─────────────────────────────────
  // ─── Quick add channels ──────────────────────────────────
  QUICK_ADD_HIDE: 'quick-add:hide',
  QUICK_ADD_RESIZE: 'quick-add:resize',
  QUICK_ADD_PAYLOAD: 'quick-add:payload',
  QUICK_ADD_NAVIGATE_TASK: 'quick-add:navigate-task',
  // ─── Attachment channels ─────────────────────────────────
  ATTACHMENT_SAVE: 'attachment:save',
  ATTACHMENT_OPEN: 'attachment:open',
  ATTACHMENT_REVEAL: 'attachment:reveal',
  ATTACHMENT_DELETE: 'attachment:delete',
  ATTACHMENT_READ: 'attachment:read',
  ATTACHMENT_PICK_AND_SAVE: 'attachment:pick-and-save',
  // --- Shell channels ---
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
} as const;

export type SettingsBootstrapState = {
  status: 'loading' | 'onboarding' | 'ready';
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

export type TaskNavigatePayload = {
  taskId: string;
};

export type TaskDeleteRequestPayload = string | {
  id: string;
  cascade?: boolean;
};

export type TaskCompleteRequestPayload = string | {
  id: string;
  completeChildren?: boolean;
};

export type TaskUndoResultPayload = {
  ok: boolean;
  undone: boolean;
  message?: string;
  targetTaskId?: string;
  originalEventId?: string;
  originalAction?: 'create' | 'update' | 'move' | 'complete' | 'cancel' | 'delete';
};

// ─── App/window lifecycle payloads ────────────────────────

export type QuickAddPayload = {
  text: string;
  source: 'clipboard-url' | 'clipboard-text' | 'empty';
};

export type QuickAddWindowPayload = {
  text: string;
  source: 'clipboard-url' | 'clipboard-text' | 'empty';
  theme: 'dark' | 'light';
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

export type DockMode = 'normal' | 'dock-only' | 'menu-bar-only';

export type DockModeResult = {
  mode: DockMode;
};

export type ShortcutRegistrationStatusResult = {
  status: Record<string, boolean>;
};

// ─── Backup payloads ──────────────────────────────────────

export type BackupImportRequest = {
  source: string;
  passphrase?: string;
};

export type BackupOffsiteManifestPayload = {
  version: 1;
  appVersion: string;
  createdAt: string;
  taskCount: number;
  noteCount: number;
  attachmentCount: number;
  dbSizeBytes: number;
};

export type BackupOffsiteReadManifestRequest = {
  source: string;
};

export type BackupOffsiteRestoreRequest = {
  source: string;
};

export type BackupSettingsFrequency = 'hourly' | 'daily' | 'weekly';

export type BackupSettingsPayload = {
  destination: string;
  frequency: BackupSettingsFrequency;
  retention: number;
  lastRunAt: string | null;
};

export type BackupSetSettingsRequest = {
  destination: string;
  frequency: BackupSettingsFrequency;
  retention: number;
};

export type BackupPickDestinationFolderResponse = {
  canceled: boolean;
  destination?: string;
};

export type BackupPickOffsiteFileResponse = {
  canceled: boolean;
  source?: string;
};

export type BackupListWithManifestsEntry = {
  path: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  taskCount: number;
  noteCount: number;
  attachmentCount: number;
};

export type BackupListWithManifestsResponse = {
  backups: BackupListWithManifestsEntry[];
};

export type BackupDeleteRequest = {
  path: string;
};

export type BackupRevealRequest = {
  path: string;
};

// ─── Search payloads ──────────────────────────────────────

export type SearchQueryRequest = {
  query: string;
  limit?: number;
};

export type TaskSearchResultItem = {
  type: 'task';
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

export type NoteSearchResultItem = {
  type: 'note';
  id: string;
  title: string;
  content: string;
  snippet: string;
};

export type SearchResultItem = TaskSearchResultItem | NoteSearchResultItem;

export type SearchQueryResponse = {
  results: SearchResultItem[];
  total: number;
  types: ('task' | 'note')[];
};

export type SettingsGetAiEnabledResult = {
  enabled: boolean;
};

export type SettingsSetAiEnabledRequest = {
  enabled: boolean;
};

export type SettingsSetAiEnabledResult = {
  enabled: boolean;
};

export type ApiKeysHasRequest = {
  provider: string;
};

export type ApiKeysHasResult = {
  hasKey: boolean;
};

export type ApiKeysSetRequest = {
  provider: string;
  key: string;
};

export type ApiKeysDeleteRequest = {
  provider: string;
};

export type ApiKeysValidateRequest = {
  provider: string;
  key: string;
};

export type ApiKeysValidateResult = {
  valid: boolean;
  error?: string;
};

// ─── Update checker payloads ──────────────────────────────

export type UpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  installMethod: 'homebrew' | 'direct';
};

// ─── Attachment payloads ──────────────────────────────────

export type AttachmentSaveRequest = {
  data: Uint8Array;
  filename: string;
};

export type AttachmentIdRequest = {
  id: string;
};

export type AttachmentPickAndSaveResult = {
  canceled: boolean;
  urls: string[];
};

// ─── Notification payloads ────────────────────────────────

export type NotificationPermissionResult = {
  status: 'granted' | 'denied';
};

// ─── Reminders sync payloads ─────────────────────────────

export type RemindersSyncFilter = 'due_date_only' | 'today' | 'all';

export type RemindersStatusResult = {
  enabled: boolean;
  authorized: boolean;
  syncFilter: RemindersSyncFilter;
  importEnabled: boolean;
  lastSyncAt: string | null;
  syncedCount: number;
};

export type RemindersSyncStatusPayload = {
  status: 'syncing' | 'idle' | 'error';
  message?: string;
};

// ─── Ollama detection payloads ────────────────────────────────

export type OllamaStatusResult = {
  status: 'not_installed' | 'not_running' | 'ready';
  baseUrl: string;
  models: Array<{
    name: string;
    size: number;
    parameterSize: string;
    family: string;
    quantization: string;
    supportsTools: boolean;
  }>;
  defaultModelName: string | null;
};

export type OllamaPullRequest = { model: string };
export type OllamaPullResult = { ok: boolean; model: string; error?: string };
export type OllamaPullProgressPayload = {
  model: string;
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
  error?: string;
};

export type OllamaWarmupRequest = { modelId: string; baseUrl?: string };
export type OllamaWarmupResult = { ok: boolean; error?: string };
