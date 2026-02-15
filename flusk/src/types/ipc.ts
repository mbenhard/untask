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
  CHAT_HISTORY: 'chat:history',
  CHAT_CLEAR: 'chat:clear',
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
