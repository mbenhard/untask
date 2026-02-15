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
  ProactiveTriggerRequest,
  ProactiveTriggerResult,
} from './assistant';
import type {
  ChatModelCatalogEntry,
  ChatRetentionPayload,
  ChatSendRequestPayload,
  ChatSendResultPayload,
  ChatSelectedModelPayload,
  ChatSetModelPayload,
  ChatSetRetentionPayload,
  ChatStreamEvent,
  ChatUndoRequestPayload,
  ChatUndoResultPayload,
} from './chat';

export const IPC_CHANNELS = {
  SETTINGS_GET_BOOTSTRAP_STATE: 'settings:get-bootstrap-state',
  SETTINGS_GET_IDENTITY_CONTEXT_SNAPSHOT:
    'settings:get-identity-context-snapshot',
  SETTINGS_EVALUATE_MEMORY_PROMOTION: 'settings:evaluate-memory-promotion',
  SETTINGS_CONFIRM_MEMORY_PROMOTION: 'settings:confirm-memory-promotion',
  SETTINGS_EVALUATE_PROACTIVE_TRIGGERS: 'settings:evaluate-proactive-triggers',
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
  CHAT_GET_MODELS: 'chat:get-models',
  CHAT_GET_SELECTED_MODEL: 'chat:get-selected-model',
  CHAT_SET_SELECTED_MODEL: 'chat:set-selected-model',
  CHAT_UNDO_LAST_ACTION: 'chat:undo-last-action',
  CHAT_GET_RETENTION_MODE: 'chat:get-retention-mode',
  CHAT_SET_RETENTION_MODE: 'chat:set-retention-mode',
  SCRATCHPAD_GET: 'scratchpad:get',
  SCRATCHPAD_SAVE: 'scratchpad:save',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',
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

export type ProactiveTriggerEvaluationRequestPayload = ProactiveTriggerRequest;
export type ProactiveTriggerEvaluationResultPayload = ProactiveTriggerResult;

export type ChatKernelStatusResultPayload = IdentityKernelStatus;
export type ChatKernelOrchestrationRequestPayload =
  ChatKernelOrchestrationRequest;
export type ChatKernelOrchestrationResultPayload = ChatKernelOrchestrationResult;

export type ChatSendRequest = ChatSendRequestPayload;
export type ChatSendResult = ChatSendResultPayload;
export type ChatStreamEventPayload = ChatStreamEvent;
export type ChatModelCatalogResult = ChatModelCatalogEntry[];
export type ChatSelectedModelResult = ChatSelectedModelPayload;
export type ChatSetModelRequest = ChatSetModelPayload;
export type ChatUndoRequest = ChatUndoRequestPayload;
export type ChatUndoResult = ChatUndoResultPayload;
export type ChatRetentionResult = ChatRetentionPayload;
export type ChatSetRetentionRequest = ChatSetRetentionPayload;
