import type { ChatMessage, Conversation } from './models';

export type ChatToolStatus = 'success' | 'error' | 'confirmation_required';
export type ChatStreamErrorCode =
  | 'config_error'
  | 'provider_error'
  | 'network_error'
  | 'tool_error'
  | 'unknown_error';

export type ChatNoteContext = {
  noteId: string;
  title: string;
  markdown: string;
};

export type AutonomyMode = 'manual' | 'safe' | 'autopilot';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ActionLifecycle = 'pending' | 'executed' | 'rejected' | 'undone';
export type ChatViewIntent = 'today' | 'tasks' | 'inbox' | 'notes';

export type ChipAction = {
  label: string;
  type: 'action' | 'response';
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  responseText?: string;
};

export type ChatActionCard = {
  id: string;
  toolName: string;
  status: ChatToolStatus;
  title: string;
  detail: string;
  taskId?: string;
  taskEventId?: string;
  undoable: boolean;
  createdAt: string;
  actionId?: string;
  riskLevel?: RiskLevel;
  rationale?: string;
  lifecycle?: ActionLifecycle;
  viewIntent?: ChatViewIntent;
};

export type ChatToolExecutionSummary = {
  toolName: string;
  toolCallId?: string;
  status: ChatToolStatus;
  message: string;
  actionCardId?: string;
};

export type ChatTurnTelemetry = {
  startedAt: string;
  firstTokenAt?: string;
  completedAt?: string;
  attemptCount: number;
};

export type PersistedChatToolMetadata = {
  requestId: string;
  modelId: string;
  actionCards: ChatActionCard[];
  toolExecutions: ChatToolExecutionSummary[];
  telemetry?: ChatTurnTelemetry;
  reasoningText?: string;
  stepDescriptions?: string[];
  imageCount?: number;
  chips?: ChipAction[];
};

export type TurnStep =
  | { kind: 'thinking'; content: string }
  | { kind: 'text'; content: string }
  | {
      kind: 'tool';
      toolName: string;
      toolCallId: string;
      description: string;
      status: 'running' | 'success' | 'error' | 'confirmation_required';
      summary?: string;
      actionCard?: ChatActionCard;
    };

export type ChatStreamEvent =
  | {
      type: 'token';
      requestId: string;
      text: string;
    }
  | {
      type: 'reasoning';
      requestId: string;
      text: string;
    }
  | {
      type: 'tool_call_started';
      requestId: string;
      toolName: string;
      toolCallId?: string;
      description?: string;
    }
  | {
      type: 'tool_call_completed';
      requestId: string;
      toolName: string;
      toolCallId?: string;
      status: ChatToolStatus;
      message: string;
      summary?: string;
      actionCard?: ChatActionCard;
      chips?: ChipAction[];
    }
  | {
      type: 'assistant_done';
      requestId: string;
      assistantMessage: ChatMessage;
      actionCards: ChatActionCard[];
      chips?: ChipAction[];
    }
  | {
      type: 'memory_updated';
      requestId: string;
    }
  | {
      type: 'error';
      requestId: string;
      message: string;
      code: ChatStreamErrorCode;
      retryable: boolean;
    };

export type ChatSendRequestPayload = {
  content: string;
  modelId?: string | null;
  conversationId?: string;
  images?: string[];
  noteContext?: ChatNoteContext;
};

export type ChatSendResultPayload = {
  requestId: string;
  conversationId: string;
  userMessage: ChatMessage;
};

export type ChatConversationSummary = Conversation & {
  messageCount: number;
};

export type ChatListConversationsRequestPayload = {
  includeArchived?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export type ChatListConversationsResultPayload = {
  conversations: ChatConversationSummary[];
  total: number;
};

export type ChatCreateConversationRequestPayload = {
  title?: string;
};

export type ChatCreateConversationResultPayload = {
  conversation: ChatConversationSummary;
};

export type ChatArchiveConversationRequestPayload = {
  conversationId: string;
};

export type ChatDeleteConversationRequestPayload = {
  conversationId: string;
};

export type ChatModelCatalogEntry = {
  id: string;
  label: string;
  inputCostPerMillion: number | null;
  outputCostPerMillion: number | null;
  defaultSelected: boolean;
  selected: boolean;
};

export type ChatSetModelPayload = {
  modelId: string;
};

export type ChatSelectedModelPayload = {
  modelId: string;
};

export type ChatUndoRequestPayload = {
  taskEventId?: string;
};

export type ChatUndoResultPayload = {
  ok: boolean;
  undone: boolean;
  message: string;
  targetTaskId?: string;
  originalEventId?: string;
  undoEventId?: string;
};

export type ChatRetentionMode = 'session' | '30d' | 'forever';

export type ChatSetRetentionPayload = {
  mode: ChatRetentionMode;
};

export type ChatRetentionPayload = {
  mode: ChatRetentionMode;
};

// ─── Autonomy payloads ──────────────────────────────────────

export type ChatGetAutonomyModePayload = {
  mode: AutonomyMode;
};

export type ChatSetAutonomyModePayload = {
  mode: AutonomyMode;
};

export type ChatPendingActionEntry = {
  actionId: string;
  toolName: string;
  input: unknown;
  riskLevel: RiskLevel;
  rationale: string;
  requiresHardConfirmation: boolean;
  createdAt: string;
  requestId?: string;
  modeAtCreation: AutonomyMode;
  lifecycle: 'pending';
};

export type ChatResolvePendingActionPayload = {
  actionId: string;
  decision: 'approve' | 'reject';
};

export type ChatResolvePendingActionResult = {
  ok: boolean;
  actionId: string;
  lifecycle: ActionLifecycle;
  message: string;
  taskEventId?: string;
  actionCard?: ChatActionCard;
};

export type ChatListPendingActionsResult = {
  actions: ChatPendingActionEntry[];
};

export type ChatExecuteChipActionPayload = {
  toolName: string;
  args: Record<string, unknown>;
};

export type ChatExecuteChipActionResult = {
  ok: boolean;
  status: ChatToolStatus;
  message: string;
  actionCard?: ChatActionCard;
};
