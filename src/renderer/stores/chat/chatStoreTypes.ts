/**
 * Shared types and helper functions used across chat store slices.
 */
import type {
  ActionLifecycle,
  AutonomyMode,
  ChatActionCard,
  ChatNoteContext,
  ChipAction,
  ChatConversationSummary,
  ChatModelCatalogEntry,
  ChatPendingActionEntry,
  ChatRetentionMode,
  ChatStreamErrorCode,
  ChatViewIntent,
  PersistedChatToolMetadata,
  TurnStep,
} from '../../../types/chat';
import type { ChatMessage } from '../../../types/models';
import { useAppStore } from '../appStore';

// ─── UI model types ─────────────────────────────────────────

export type ChatUiMessage = {
  id: string;
  conversationId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  isStreaming?: boolean;
  streamPhase?: 'sending' | 'thinking';
  actionCards: ChatActionCard[];
  steps: TurnStep[];
  imageCount?: number;
  chips?: ChipAction[];
};

export type InFlightStream = {
  placeholderId: string;
  actionCards: ChatActionCard[];
  steps: TurnStep[];
  chips?: ChipAction[];
  safetyTimeoutId?: ReturnType<typeof setTimeout>;
};

export type PendingViewSwitch = {
  manualNavigationVersionAtStart: number;
  pendingViewIntent: ChatViewIntent | null;
};

export type ChatRequestPayload = {
  content: string;
  modelId: string | null;
  noteContext?: ChatNoteContext;
};

export type ChatLastStreamError = {
  requestId: string;
  code: ChatStreamErrorCode;
  retryable: boolean;
  message: string;
};

// ─── Combined store type ────────────────────────────────────

export type ChatStore = {
  // Message state
  messages: ChatUiMessage[];
  focusMessageId: string | null;

  // Conversation state
  conversations: ChatConversationSummary[];
  conversationsTotal: number;
  activeConversationId: string | null;
  isLoadingConversations: boolean;
  isInitialized: boolean;

  // Sending/error state
  isSending: boolean;
  error: string | null;
  lastStreamError: ChatLastStreamError | null;

  // Stream in-flight state
  inFlightByRequestId: Record<string, InFlightStream>;
  pendingViewSwitchByRequestId: Record<string, PendingViewSwitch>;
  requestPayloadByRequestId: Record<string, ChatRequestPayload>;
  conversationIdByRequestId: Record<string, string>;
  assistantMessageIdByRequestId: Record<string, string>;
  unsubscribeStream?: () => void;
  unsubscribeFocusMessage?: () => void;

  // Settings state
  models: ChatModelCatalogEntry[];
  selectedModelId: string | null;
  retentionMode: ChatRetentionMode;
  autonomyMode: AutonomyMode;

  // Pending actions
  pendingActions: ChatPendingActionEntry[];

  // Images
  pendingImages: string[];
  processingImageCount: number;

  // Note context
  pendingNoteContext: ChatNoteContext | null;

  // ─── Actions ────────────────────────────────────────────────

  // Initialization
  initialize: () => Promise<void>;

  // Conversation actions
  refreshConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

  // Message actions
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  undoAction: (taskEventId?: string) => Promise<void>;
  cancelStream: () => Promise<void>;
  retryLastFailedMessage: () => Promise<void>;
  clearError: () => void;
  clearFocusMessageId: () => void;

  // Note context actions
  stageNoteContext: (context: ChatNoteContext) => void;
  consumePendingNoteContext: () => ChatNoteContext | null;
  detachPendingNoteContext: () => void;
  clearPendingNoteContext: () => void;

  // Stream event processing
  applyStreamEvent: (event: import('../../../types/chat').ChatStreamEvent) => void;

  // Settings actions
  setSelectedModel: (modelId: string) => Promise<void>;
  setRetentionMode: (mode: ChatRetentionMode) => Promise<void>;
  setAutonomyMode: (mode: AutonomyMode) => Promise<void>;

  // Pending action actions
  approvePendingAction: (actionId: string) => Promise<void>;
  rejectPendingAction: (actionId: string) => Promise<void>;
  refreshPendingActions: () => Promise<void>;

  // Card lifecycle
  updateCardLifecycle: (
    actionId: string,
    lifecycle: ActionLifecycle,
    updates?: Partial<ChatActionCard>,
  ) => void;

  // Image actions
  addPendingImage: (dataUrl: string) => void;
  removePendingImage: (index: number) => void;
  clearPendingImages: () => void;
  incrementProcessingImages: () => void;
  decrementProcessingImages: () => void;
};

// ─── Helper functions ───────────────────────────────────────

export const dedupeActionCards = (cards: ChatActionCard[]): ChatActionCard[] => {
  const seen = new Set<string>();
  const deduped: ChatActionCard[] = [];

  cards.forEach((card) => {
    if (seen.has(card.id)) {
      return;
    }
    seen.add(card.id);
    deduped.push(card);
  });

  return deduped;
};

export const normalizeChip = (raw: unknown): ChipAction | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const chip = raw as Record<string, unknown>;
  const label = typeof chip.label === 'string' ? chip.label.trim() : '';

  if (label.length === 0) {
    return null;
  }

  const responseText = typeof chip.responseText === 'string'
    ? chip.responseText.trim()
    : typeof chip.response === 'string'
      ? (chip.response as string).trim()
      : '';

  return {
    label,
    type: 'response',
    responseText: responseText.length > 0 ? responseText : label,
  };
};

export const normalizeChips = (raw: unknown): ChipAction[] | undefined => {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const normalized = raw
    .map(normalizeChip)
    .filter((chip): chip is ChipAction => Boolean(chip));

  return normalized.length > 0 ? normalized : undefined;
};

export const parseToolMetadata = (raw: string | null): PersistedChatToolMetadata | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedChatToolMetadata>;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.actionCards)
    ) {
      return null;
    }

    const normalizedMetadataChips = normalizeChips(parsed.chips);

    return {
      requestId: typeof parsed.requestId === 'string' ? parsed.requestId : '',
      modelId: typeof parsed.modelId === 'string' ? parsed.modelId : '',
      actionCards: parsed.actionCards,
      toolExecutions: Array.isArray(parsed.toolExecutions)
        ? parsed.toolExecutions
        : [],
      ...(parsed.telemetry ? { telemetry: parsed.telemetry } : {}),
      ...(typeof parsed.reasoningText === 'string' ? { reasoningText: parsed.reasoningText } : {}),
      ...(Array.isArray(parsed.stepDescriptions) ? { stepDescriptions: parsed.stepDescriptions } : {}),
      ...(typeof parsed.imageCount === 'number' ? { imageCount: parsed.imageCount } : {}),
      ...(normalizedMetadataChips ? { chips: normalizedMetadataChips } : {}),
    };
  } catch {
    return null;
  }
};

export const reconstructStepsFromMetadata = (
  metadata: PersistedChatToolMetadata | null,
  content: string,
): TurnStep[] => {
  if (!metadata) {
    return content.trim().length > 0 ? [{ kind: 'text', content }] : [];
  }

  const steps: TurnStep[] = [];

  if (metadata.reasoningText && metadata.reasoningText.trim().length > 0) {
    steps.push({ kind: 'thinking', content: metadata.reasoningText });
  }

  if (content.trim().length > 0) {
    steps.push({ kind: 'text', content });
  }

  const actionCardMap = new Map<string, ChatActionCard>();
  for (const card of metadata.actionCards) {
    if (card.id) {
      actionCardMap.set(card.id, card);
    }
  }

  for (const exec of metadata.toolExecutions) {
    const card = exec.actionCardId ? actionCardMap.get(exec.actionCardId) : undefined;
    steps.push({
      kind: 'tool',
      toolName: exec.toolName,
      toolCallId: exec.toolCallId ?? '',
      description: card?.title ?? exec.toolName,
      status: exec.status === 'confirmation_required' ? 'confirmation_required' : exec.status,
      summary: exec.message,
      actionCard: card,
    });
  }

  return steps;
};

export const parseImageCount = (raw: string | null): number | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed?.imageCount === 'number' && parsed.imageCount > 0
      ? parsed.imageCount
      : undefined;
  } catch {
    return undefined;
  }
};

export const parseChips = (raw: string | null): ChipAction[] | undefined => {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    return normalizeChips(parsed);
  } catch {
    return undefined;
  }
};

// Tool names whose steps are visible in the chat UI -- must mirror ChatView's VISIBLE_TOOL_NAMES
const MUTATION_TOOL_NAMES = new Set([
  'create_task', 'update_task', 'complete_task', 'delete_task',
  'edit_note', 'update_memory', 'undo_last_action',
]);

export const isToolStepVisibleInUi = (step: TurnStep): boolean => {
  if (step.kind !== 'tool') return false;
  if (step.status === 'confirmation_required' || step.status === 'error') return true;
  if ('actionCard' in step && step.actionCard?.lifecycle === 'pending') return true;
  return MUTATION_TOOL_NAMES.has(step.toolName);
};

/**
 * Collapse text steps that are adjacent or separated only by hidden (read-only)
 * tool steps. This prevents the "double bubble" effect when the model generates
 * text -> hidden tool call -> more text in a single turn.
 */
export const collapseConsecutiveTextSteps = (steps: TurnStep[]): TurnStep[] => {
  const collapsed: TurnStep[] = [];

  steps.forEach((step) => {
    if (step.kind === 'text') {
      // Find the last text step in collapsed, checking if everything between is a hidden tool
      let lastTextIdx = -1;
      let allBetweenHidden = true;
      for (let i = collapsed.length - 1; i >= 0; i--) {
        if (collapsed[i].kind === 'text') {
          lastTextIdx = i;
          break;
        }
        if (collapsed[i].kind !== 'tool' || isToolStepVisibleInUi(collapsed[i])) {
          allBetweenHidden = false;
          break;
        }
      }

      if (lastTextIdx >= 0 && allBetweenHidden) {
        const previous = collapsed[lastTextIdx] as Extract<TurnStep, { kind: 'text' }>;
        // Skip exact duplicates
        if (previous.content.trim() === step.content.trim()) {
          return;
        }
        // Merge text steps
        collapsed[lastTextIdx] = {
          ...previous,
          content: previous.content.trimEnd() + '\n\n' + step.content.trimStart(),
        };
        return;
      }
    }

    collapsed.push(step);
  });

  return collapsed;
};

export const mapMessageToUi = (message: ChatMessage): ChatUiMessage => {
  const metadata = parseToolMetadata(message.toolCalls);
  const imageCount = metadata?.imageCount ?? parseImageCount(message.toolCalls);
  const chips = parseChips(message.chips) ?? metadata?.chips;

  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    actionCards: dedupeActionCards(metadata?.actionCards ?? []),
    steps: message.role === 'assistant'
      ? collapseConsecutiveTextSteps(reconstructStepsFromMetadata(metadata, message.content))
      : [],
    ...(imageCount ? { imageCount } : {}),
    ...(chips ? { chips } : {}),
  };
};

export const upsertMessage = (messages: ChatUiMessage[], message: ChatUiMessage): ChatUiMessage[] => {
  const existingIndex = messages.findIndex((entry) => entry.id === message.id);

  if (existingIndex === -1) {
    return [...messages, message];
  }

  return messages.map((entry) => (entry.id === message.id ? message : entry));
};

export const shouldRefreshTasks = (actionCards: ChatActionCard[]): boolean =>
  actionCards.some((card) => card.status === 'success');

export const revealPeekIfChatNotOpen = (): void => {
  const appStore = useAppStore.getState();

  if (appStore.chatOverlayState !== 'open') {
    appStore.peekChatOverlay();
    appStore.setUnreadProactive(true);
  }
};
