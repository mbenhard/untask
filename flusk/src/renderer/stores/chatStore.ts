import { create } from 'zustand';

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
  ChatStreamEvent,
  ChatViewIntent,
  PersistedChatToolMetadata,
  TurnStep,
} from '../../types/chat';
import type { ChatMessage } from '../../types/models';
import { getUntask } from '../lib/untask';
import { resolveBlockNoteImages } from '../utils/imageResize';
import { useAppStore } from './appStore';
import { useTaskStore } from './taskStore';

type ChatUiMessage = {
  id: string;
  conversationId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  isStreaming?: boolean;
  actionCards: ChatActionCard[];
  steps: TurnStep[];
  imageCount?: number;
  chips?: ChipAction[];
};

type InFlightStream = {
  placeholderId: string;
  actionCards: ChatActionCard[];
  steps: TurnStep[];
  chips?: ChipAction[];
};

type PendingViewSwitch = {
  manualNavigationVersionAtStart: number;
  pendingViewIntent: ChatViewIntent | null;
};

type ChatRequestPayload = {
  content: string;
  modelId: string | null;
  noteContext?: ChatNoteContext;
};

type ChatLastStreamError = {
  requestId: string;
  code: ChatStreamErrorCode;
  retryable: boolean;
  message: string;
};

type ChatStore = {
  messages: ChatUiMessage[];
  conversations: ChatConversationSummary[];
  conversationsTotal: number;
  activeConversationId: string | null;
  isLoadingConversations: boolean;
  isInitialized: boolean;
  isSending: boolean;
  error: string | null;
  models: ChatModelCatalogEntry[];
  selectedModelId: string | null;
  retentionMode: ChatRetentionMode;
  inFlightByRequestId: Record<string, InFlightStream>;
  pendingViewSwitchByRequestId: Record<string, PendingViewSwitch>;
  requestPayloadByRequestId: Record<string, ChatRequestPayload>;
  conversationIdByRequestId: Record<string, string>;
  assistantMessageIdByRequestId: Record<string, string>;
  lastStreamError: ChatLastStreamError | null;
  unsubscribeStream?: () => void;
  unsubscribeFocusMessage?: () => void;
  autonomyMode: AutonomyMode;
  pendingActions: ChatPendingActionEntry[];
  pendingImages: string[];
  processingImageCount: number;
  focusMessageId: string | null;
  pendingNoteContext: ChatNoteContext | null;

  initialize: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stageNoteContext: (context: ChatNoteContext) => void;
  consumePendingNoteContext: () => ChatNoteContext | null;
  detachPendingNoteContext: () => void;
  clearPendingNoteContext: () => void;
  clearHistory: () => Promise<void>;
  undoAction: (taskEventId?: string) => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
  setRetentionMode: (mode: ChatRetentionMode) => Promise<void>;
  applyStreamEvent: (event: ChatStreamEvent) => void;
  clearError: () => void;
  setAutonomyMode: (mode: AutonomyMode) => Promise<void>;
  approvePendingAction: (actionId: string) => Promise<void>;
  rejectPendingAction: (actionId: string) => Promise<void>;
  refreshPendingActions: () => Promise<void>;
  cancelStream: () => Promise<void>;
  retryLastFailedMessage: () => Promise<void>;
  updateCardLifecycle: (
    actionId: string,
    lifecycle: ActionLifecycle,
    updates?: Partial<ChatActionCard>,
  ) => void;
  addPendingImage: (dataUrl: string) => void;
  removePendingImage: (index: number) => void;
  clearPendingImages: () => void;
  incrementProcessingImages: () => void;
  decrementProcessingImages: () => void;
  clearFocusMessageId: () => void;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown chat operation error.';

const dedupeActionCards = (cards: ChatActionCard[]): ChatActionCard[] => {
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

const normalizeChip = (raw: unknown): ChipAction | null => {
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

const normalizeChips = (raw: unknown): ChipAction[] | undefined => {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const normalized = raw
    .map(normalizeChip)
    .filter((chip): chip is ChipAction => Boolean(chip));

  return normalized.length > 0 ? normalized : undefined;
};

const parseToolMetadata = (raw: string | null): PersistedChatToolMetadata | null => {
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

const reconstructStepsFromMetadata = (
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

const parseImageCount = (raw: string | null): number | undefined => {
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

const parseChips = (raw: string | null): ChipAction[] | undefined => {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    return normalizeChips(parsed);
  } catch {
    return undefined;
  }
};

// Tool names whose steps are visible in the chat UI — must mirror ChatView's VISIBLE_TOOL_NAMES
const MUTATION_TOOL_NAMES = new Set([
  'create_task', 'update_task', 'complete_task', 'delete_task',
  'edit_note', 'update_memory', 'undo_last_action',
]);

const isToolStepVisibleInUi = (step: TurnStep): boolean => {
  if (step.kind !== 'tool') return false;
  if (step.status === 'confirmation_required' || step.status === 'error') return true;
  if ('actionCard' in step && step.actionCard?.lifecycle === 'pending') return true;
  return MUTATION_TOOL_NAMES.has(step.toolName);
};

/**
 * Collapse text steps that are adjacent or separated only by hidden (read-only)
 * tool steps. This prevents the "double bubble" effect when the model generates
 * text → hidden tool call → more text in a single turn.
 */
const collapseConsecutiveTextSteps = (steps: TurnStep[]): TurnStep[] => {
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

const mapMessageToUi = (message: ChatMessage): ChatUiMessage => {
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

const upsertMessage = (messages: ChatUiMessage[], message: ChatUiMessage): ChatUiMessage[] => {
  const existingIndex = messages.findIndex((entry) => entry.id === message.id);

  if (existingIndex === -1) {
    return [...messages, message];
  }

  return messages.map((entry) => (entry.id === message.id ? message : entry));
};

const shouldRefreshTasks = (actionCards: ChatActionCard[]): boolean =>
  actionCards.some((card) => card.status === 'success');

const revealPeekIfChatNotOpen = (): void => {
  const appStore = useAppStore.getState();

  if (appStore.chatOverlayState !== 'open') {
    appStore.peekChatOverlay();
    appStore.setUnreadProactive(true);
  }
};


export const useChatStore = create<ChatStore>((set, get) => {
  let initializePromise: Promise<void> | null = null;

  const sendPreparedMessage = async (
    content: string,
    modelId: string | null,
    conversationId: string,
    images?: string[],
    noteContext?: ChatNoteContext,
  ): Promise<void> => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return;
    }

    try {
      set({ isSending: true, error: null });

      const response = await getUntask().chat.send({
        content: trimmed,
        modelId,
        conversationId,
        images: images?.length ? images : undefined,
        noteContext,
      });

      const userMessage = mapMessageToUi(response.userMessage);
      const placeholderId = `assistant-stream-${response.requestId}`;
      const placeholderMessage: ChatUiMessage = {
        id: placeholderId,
        conversationId: response.conversationId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        isStreaming: true,
        actionCards: [],
        steps: [],
      };

      set((state) => ({
        messages: upsertMessage(
          upsertMessage(state.messages, userMessage),
          placeholderMessage,
        ),
        inFlightByRequestId: {
          ...state.inFlightByRequestId,
          [response.requestId]: {
            placeholderId,
            actionCards: [],
            steps: [],
          },
        },
        requestPayloadByRequestId: {
          ...state.requestPayloadByRequestId,
          [response.requestId]: {
            content: trimmed,
            modelId,
            ...(noteContext ? { noteContext } : {}),
          },
        },
        conversationIdByRequestId: {
          ...state.conversationIdByRequestId,
          [response.requestId]: response.conversationId,
        },
        activeConversationId: response.conversationId,
        pendingViewSwitchByRequestId: {
          ...state.pendingViewSwitchByRequestId,
          [response.requestId]: {
            manualNavigationVersionAtStart:
              useAppStore.getState().manualNavigationVersion,
            pendingViewIntent: null,
          },
        },
        lastStreamError:
          state.lastStreamError?.requestId === response.requestId
            ? null
            : state.lastStreamError,
      }));
    } catch (error) {
      set({
        isSending: false,
        error: toErrorMessage(error),
      });
    }
  };

  const refreshConversationsInternal = async (): Promise<void> => {
    const result = await getUntask().chat.listThreads({
      includeArchived: true,
      limit: 100,
      offset: 0,
    });

    set((state) => ({
      conversations: result.conversations,
      conversationsTotal: result.total,
      activeConversationId:
        state.activeConversationId &&
        result.conversations.some((conversation) => conversation.id === state.activeConversationId)
          ? state.activeConversationId
          : result.conversations.find((conversation) => !conversation.archivedAt)?.id ?? null,
    }));
  };

  const ensureActiveConversationId = async (): Promise<string> => {
    const active = get().activeConversationId;
    if (active) {
      return active;
    }

    const created = await getUntask().chat.createThread();
    set((state) => ({
      activeConversationId: created.conversation.id,
      conversations: [created.conversation, ...state.conversations],
      conversationsTotal: Math.max(state.conversationsTotal + 1, state.conversations.length + 1),
    }));
    return created.conversation.id;
  };

  const loadConversationIntoState = async (conversationId: string): Promise<void> => {
    const history = await getUntask().chat.history({ conversationId });
    set({
      messages: history.map(mapMessageToUi),
      activeConversationId: conversationId,
      inFlightByRequestId: {},
      pendingViewSwitchByRequestId: {},
      requestPayloadByRequestId: {},
      conversationIdByRequestId: {},
      assistantMessageIdByRequestId: {},
      isSending: false,
      error: null,
      focusMessageId: null,
    });
  };

  return {
    messages: [],
    conversations: [],
    conversationsTotal: 0,
    activeConversationId: null,
    isLoadingConversations: false,
    isInitialized: false,
    isSending: false,
    error: null,
    models: [],
    selectedModelId: null,
    retentionMode: '30d',
    inFlightByRequestId: {},
    pendingViewSwitchByRequestId: {},
    requestPayloadByRequestId: {},
    conversationIdByRequestId: {},
    assistantMessageIdByRequestId: {},
    lastStreamError: null,
    autonomyMode: 'auto',
    pendingActions: [],
    pendingImages: [],
    processingImageCount: 0,
    focusMessageId: null,
    pendingNoteContext: null,

    initialize: async () => {
      if (get().isInitialized) {
        return;
      }

      if (initializePromise) {
        await initializePromise;
        return;
      }

      initializePromise = (async () => {
        try {
          set({ isLoadingConversations: true });

          const [threads, models, selectedModel, retention, autonomy, pending] =
            await Promise.all([
              getUntask().chat.listThreads({
                includeArchived: true,
                limit: 100,
                offset: 0,
              }),
              getUntask().chat.getModels(),
              getUntask().chat.getSelectedModel(),
              getUntask().chat.getRetentionMode(),
              getUntask().chat.getAutonomyMode(),
              getUntask().chat.listPendingActions(),
            ]);

          let activeConversationId =
            threads.conversations.find((conversation) => !conversation.archivedAt)?.id ?? null;
          let conversations = threads.conversations;
          let conversationsTotal = threads.total;

          if (!activeConversationId) {
            const created = await getUntask().chat.createThread();
            activeConversationId = created.conversation.id;
            conversations = [created.conversation, ...conversations];
            conversationsTotal = Math.max(conversationsTotal + 1, conversations.length);
          }

          const history = await getUntask().chat.history({
            conversationId: activeConversationId,
          });

          const existingUnsubscribe = get().unsubscribeStream;
          existingUnsubscribe?.();
          const existingFocusUnsubscribe = get().unsubscribeFocusMessage;
          existingFocusUnsubscribe?.();

          const unsubscribeStream = getUntask().chat.onStreamEvent((event) => {
            get().applyStreamEvent(event);
          });
          const unsubscribeFocusMessage = getUntask().chat.onFocusMessage((payload) => {
            if (!payload?.messageId) return;

            useAppStore.getState().openChatOverlay();
            set({ focusMessageId: payload.messageId });
          });

          set({
            messages: history.map(mapMessageToUi),
            conversations,
            conversationsTotal,
            activeConversationId,
            isLoadingConversations: false,
            models,
            selectedModelId: selectedModel.modelId,
            retentionMode: retention.mode,
            autonomyMode: autonomy.mode,
            pendingActions: pending.actions,
            pendingViewSwitchByRequestId: {},
            conversationIdByRequestId: {},
            assistantMessageIdByRequestId: {},
            unsubscribeStream,
            unsubscribeFocusMessage,
            isInitialized: true,
            error: null,
          });
        } catch (error) {
          set({ error: toErrorMessage(error), isLoadingConversations: false });
        }
      })();

      try {
        await initializePromise;
      } finally {
        initializePromise = null;
      }
    },

    refreshConversations: async () => {
      try {
        set({ isLoadingConversations: true });
        await refreshConversationsInternal();
        set({ isLoadingConversations: false, error: null });
      } catch (error) {
        set({ isLoadingConversations: false, error: toErrorMessage(error) });
      }
    },

    createConversation: async (title) => {
      try {
        await getUntask().chat.cancel();
      } catch {
        // Ignore cancel failures when no request is active.
      }

      try {
        const created = await getUntask().chat.createThread(
          title?.trim().length ? { title: title.trim() } : undefined,
        );
        await loadConversationIntoState(created.conversation.id);
        await refreshConversationsInternal();
        set({ error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    setActiveConversation: async (conversationId) => {
      if (!conversationId || conversationId === get().activeConversationId) {
        return;
      }

      try {
        await getUntask().chat.cancel();
      } catch {
        // Ignore cancel failures when no request is active.
      }

      try {
        await loadConversationIntoState(conversationId);
        await refreshConversationsInternal();
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    archiveConversation: async (conversationId) => {
      try {
        await getUntask().chat.archiveThread({ conversationId });
        await refreshConversationsInternal();

        if (get().activeConversationId === conversationId) {
          const nextActive =
            get().conversations.find(
              (conversation) =>
                conversation.id !== conversationId && !conversation.archivedAt,
            )?.id ?? null;

          if (nextActive) {
            await loadConversationIntoState(nextActive);
          } else {
            const created = await getUntask().chat.createThread();
            await loadConversationIntoState(created.conversation.id);
            await refreshConversationsInternal();
          }
        }

        set({ error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    deleteConversation: async (conversationId) => {
      try {
        await getUntask().chat.deleteThread({ conversationId });
        await refreshConversationsInternal();

        if (get().activeConversationId === conversationId) {
          const nextActive =
            get().conversations.find(
              (conversation) =>
                conversation.id !== conversationId && !conversation.archivedAt,
            )?.id ?? null;

          if (nextActive) {
            await loadConversationIntoState(nextActive);
          } else {
            const created = await getUntask().chat.createThread();
            await loadConversationIntoState(created.conversation.id);
            await refreshConversationsInternal();
          }
        }

        set({ error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    sendMessage: async (content) => {
      if (get().isSending) {
        return;
      }

      // Wait for any in-flight image processing to complete
      const waitForProcessing = async () => {
        let checks = 0;
        while (get().processingImageCount > 0 && checks < 50) {
          await new Promise((r) => { setTimeout(r, 100); });
          checks += 1;
        }
      };
      await waitForProcessing();

      const selected = await getUntask().chat.getSelectedModel().catch(() => null);
      if (selected?.modelId) {
        set({ selectedModelId: selected.modelId });
      }
      const images = [...get().pendingImages];
      const noteContext = get().pendingNoteContext ?? undefined;
      set({ pendingImages: [], pendingNoteContext: null });

      // Inject images from the currently selected task's attachments
      const taskState = useTaskStore.getState();
      const selectedTask = taskState.selectedTaskId
        ? taskState.tasks.find((t) => t.id === taskState.selectedTaskId)
        : null;

      if (selectedTask?.body) {
        try {
          const taskImages = await resolveBlockNoteImages(selectedTask.body);
          images.push(...taskImages);
        } catch {
          // Non-fatal — send without task attachment images
        }
      }

      // Inject images from the attached note's content
      if (noteContext) {
        try {
          const { useNotesStore } = await import('./notesStore');
          const notesState = useNotesStore.getState();
          // Use the raw BlockNote content if we're looking at the same note
          const rawContent =
            notesState.activeNoteId === noteContext.noteId
              ? notesState.content
              : null;
          if (rawContent) {
            const noteImages = await resolveBlockNoteImages(rawContent);
            images.push(...noteImages);
          }
        } catch {
          // Non-fatal — send without note attachment images
        }
      }

      const conversationId = await ensureActiveConversationId();
      await sendPreparedMessage(
        content,
        selected?.modelId ?? null,
        conversationId,
        images,
        noteContext,
      );
    },

    stageNoteContext: (context) => {
      set({ pendingNoteContext: context });
    },

    consumePendingNoteContext: () => {
      const context = get().pendingNoteContext;
      if (context) {
        set({ pendingNoteContext: null });
      }
      return context;
    },

    detachPendingNoteContext: () => {
      set({ pendingNoteContext: null });
    },

    clearPendingNoteContext: () => {
      set({ pendingNoteContext: null });
    },

    cancelStream: async () => {
      await getUntask().chat.cancel();
      const { messages } = get();
      const updatedMessages = messages.map((msg) => {
        if (msg.isStreaming) {
          return { ...msg, isStreaming: false };
        }
        return msg;
      });
      set({
        messages: updatedMessages,
        isSending: false,
        inFlightByRequestId: {},
        pendingViewSwitchByRequestId: {},
        conversationIdByRequestId: {},
        assistantMessageIdByRequestId: {},
      });
    },

    retryLastFailedMessage: async () => {
      const failed = get().lastStreamError;
      if (!failed || !failed.retryable) {
        return;
      }

      const payload = get().requestPayloadByRequestId[failed.requestId];
      const failedConversationId = get().conversationIdByRequestId[failed.requestId];
      if (!payload) {
        set({
          error:
            'Retry payload is unavailable for the failed turn. Send the message again manually.',
        });
        return;
      }

      set((state) => {
        const nextPayloads = { ...state.requestPayloadByRequestId };
        delete nextPayloads[failed.requestId];
        const nextPendingViewSwitches = {
          ...state.pendingViewSwitchByRequestId,
        };
        delete nextPendingViewSwitches[failed.requestId];
        const nextConversationIds = {
          ...state.conversationIdByRequestId,
        };
        delete nextConversationIds[failed.requestId];
        return {
          requestPayloadByRequestId: nextPayloads,
          pendingViewSwitchByRequestId: nextPendingViewSwitches,
          conversationIdByRequestId: nextConversationIds,
          lastStreamError: null,
          error: null,
        };
      });

      const conversationId =
        failedConversationId ?? get().activeConversationId ?? (await ensureActiveConversationId());

      await sendPreparedMessage(
        payload.content,
        payload.modelId,
        conversationId,
        undefined,
        payload.noteContext,
      );
    },

    clearHistory: async () => {
      try {
        await getUntask().chat.clear();
        set({
          messages: [],
          inFlightByRequestId: {},
          pendingViewSwitchByRequestId: {},
          requestPayloadByRequestId: {},
          conversationIdByRequestId: {},
          assistantMessageIdByRequestId: {},
          lastStreamError: null,
          isSending: false,
          focusMessageId: null,
          pendingNoteContext: null,
          error: null,
        });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    undoAction: async (taskEventId) => {
      try {
        const result = await getUntask().chat.undoLastAction(
          taskEventId ? { taskEventId } : undefined,
        );

        if (!result.ok) {
          throw new Error(result.message);
        }

        if (result.undone) {
          if (result.originalEventId) {
            set((state) => ({
              messages: state.messages.map((message) => ({
                ...message,
                actionCards: message.actionCards.map((card) =>
                  card.taskEventId === result.originalEventId
                    ? { ...card, lifecycle: 'undone' as const }
                    : card,
                ),
              })),
            }));
          }
          await useTaskStore.getState().fetchTasks();
        }

        set({ error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    setSelectedModel: async (modelId) => {
      try {
        const [selected, models] = await Promise.all([
          getUntask().chat.setSelectedModel({ modelId }),
          getUntask().chat.getModels(),
        ]);

        set({
          selectedModelId: selected.modelId,
          models,
          error: null,
        });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    setRetentionMode: async (mode) => {
      try {
        const updated = await getUntask().chat.setRetentionMode({ mode });
        set({ retentionMode: updated.mode, error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    applyStreamEvent: (event) => {
      let inFlight = get().inFlightByRequestId[event.requestId];

      // Auto-create inFlight for proactive messages (no preceding user send)
      if (
        !inFlight &&
        event.requestId.startsWith('proactive-') &&
        event.type !== 'error' &&
        event.type !== 'assistant_done'
      ) {
        const placeholderId = `assistant-stream-${event.requestId}`;
        const placeholder: ChatUiMessage = {
          id: placeholderId,
          conversationId: get().activeConversationId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          actionCards: [],
          steps: [],
        };
        const newInFlight: InFlightStream = {
          placeholderId,
          actionCards: [],
          steps: [],
        };

        set((state) => ({
          messages: [...state.messages, placeholder],
          inFlightByRequestId: {
            ...state.inFlightByRequestId,
            [event.requestId]: newInFlight,
          },
        }));

        // Belt-and-suspenders: auto-remove stale proactive placeholder after 2 minutes
        const PROACTIVE_PLACEHOLDER_TIMEOUT_MS = 2 * 60 * 1000;
        setTimeout(() => {
          const current = get().inFlightByRequestId[event.requestId];
          if (!current) return; // Already finalized
          const msg = get().messages.find((m) => m.id === placeholderId);
          if (msg && !msg.content) {
            // Placeholder still has no content — remove it
            const { [event.requestId]: _, ...remaining } = get().inFlightByRequestId;
            set((state) => ({
              messages: state.messages.filter((m) => m.id !== placeholderId),
              inFlightByRequestId: remaining,
              isSending: Object.keys(remaining).length > 0,
            }));
          }
        }, PROACTIVE_PLACEHOLDER_TIMEOUT_MS);

        inFlight = newInFlight;
      }

      // For proactive assistant_done with no inFlight, just append the message
      if (!inFlight && event.requestId.startsWith('proactive-') && event.type === 'assistant_done') {
        const mapped = mapMessageToUi(event.assistantMessage);
        if (
          mapped.conversationId &&
          get().activeConversationId &&
          mapped.conversationId !== get().activeConversationId
        ) {
          void get().refreshConversations();
          return;
        }
        const finalizedChips = event.chips ?? mapped.chips;
        const finalMessage: ChatUiMessage = {
          ...mapped,
          ...(finalizedChips ? { chips: finalizedChips } : {}),
        };

        set((state) => ({
          messages: upsertMessage(state.messages, finalMessage),
          assistantMessageIdByRequestId: {
            ...state.assistantMessageIdByRequestId,
            [event.requestId]: finalMessage.id,
          },
        }));

        revealPeekIfChatNotOpen();

        if (shouldRefreshTasks(finalMessage.actionCards)) {
          void useTaskStore.getState().fetchTasks();
        }
        void get().refreshConversations();
        return;
      }

      if (
        event.type === 'reasoning' ||
        event.type === 'token' ||
        event.type === 'tool_call_started' ||
        event.type === 'tool_call_completed' ||
        event.type === 'assistant_done'
      ) {
        revealPeekIfChatNotOpen();
      }

      if (event.type === 'reasoning') {
        if (!inFlight) {
          return;
        }

        const nextSteps = [...inFlight.steps];
        const lastStep = nextSteps[nextSteps.length - 1];
        if (lastStep?.kind === 'thinking') {
          nextSteps[nextSteps.length - 1] = {
            ...lastStep,
            content: lastStep.content + event.text,
          };
        } else {
          nextSteps.push({ kind: 'thinking', content: event.text });
        }

        set((state) => ({
          inFlightByRequestId: {
            ...state.inFlightByRequestId,
            [event.requestId]: { ...inFlight, steps: nextSteps },
          },
          messages: state.messages.map((message) =>
            message.id === inFlight.placeholderId
              ? { ...message, steps: nextSteps }
              : message,
          ),
        }));

        return;
      }

      if (event.type === 'token') {
        if (!inFlight) {
          return;
        }

        const nextSteps = [...inFlight.steps];
        const lastStep = nextSteps[nextSteps.length - 1];
        if (lastStep?.kind === 'text') {
          nextSteps[nextSteps.length - 1] = {
            ...lastStep,
            content: lastStep.content + event.text,
          };
        } else {
          nextSteps.push({ kind: 'text', content: event.text });
        }

        set((state) => ({
          inFlightByRequestId: {
            ...state.inFlightByRequestId,
            [event.requestId]: { ...inFlight, steps: nextSteps },
          },
          messages: state.messages.map((message) =>
            message.id === inFlight.placeholderId
              ? {
                  ...message,
                  content: `${message.content}${event.text}`,
                  steps: nextSteps,
                }
              : message,
          ),
        }));

        return;
      }

      if (event.type === 'tool_call_started') {
        if (!inFlight) {
          return;
        }

        const toolStep: TurnStep = {
          kind: 'tool',
          toolName: event.toolName,
          toolCallId: event.toolCallId ?? '',
          description: event.description ?? event.toolName,
          status: 'running',
        };
        const nextSteps = [...inFlight.steps, toolStep];

        set((state) => ({
          inFlightByRequestId: {
            ...state.inFlightByRequestId,
            [event.requestId]: { ...inFlight, steps: nextSteps },
          },
          messages: state.messages.map((message) =>
            message.id === inFlight.placeholderId
              ? { ...message, steps: nextSteps }
              : message,
          ),
        }));

        return;
      }

      if (event.type === 'tool_call_completed') {
        if (!inFlight) {
          return;
        }

        const nextActionCards = event.actionCard
          ? dedupeActionCards([...inFlight.actionCards, event.actionCard])
          : inFlight.actionCards;
        const nextViewIntent =
          event.status === 'success' ? event.actionCard?.viewIntent ?? null : null;
        const nextChips = event.chips ?? inFlight.chips;

        const resolvedToolStatus = event.status === 'confirmation_required'
          ? 'confirmation_required' as const
          : event.status === 'error'
            ? 'error' as const
            : 'success' as const;
        const nextSteps: TurnStep[] = inFlight.steps.map((step) => {
          if (
            step.kind === 'tool' &&
            step.toolCallId === (event.toolCallId ?? '') &&
            step.status === 'running'
          ) {
            return {
              ...step,
              status: resolvedToolStatus,
              summary: event.summary ?? event.message,
              actionCard: event.actionCard,
            };
          }
          return step;
        });

        set((state) => ({
          inFlightByRequestId: {
            ...state.inFlightByRequestId,
            [event.requestId]: {
              ...inFlight,
              actionCards: nextActionCards,
              steps: nextSteps,
              chips: nextChips,
            },
          },
          pendingViewSwitchByRequestId: (() => {
            if (!nextViewIntent) {
              return state.pendingViewSwitchByRequestId;
            }

            const existing = state.pendingViewSwitchByRequestId[event.requestId];
            if (!existing) {
              return state.pendingViewSwitchByRequestId;
            }

            return {
              ...state.pendingViewSwitchByRequestId,
              [event.requestId]: {
                ...existing,
                pendingViewIntent: nextViewIntent,
              },
            };
          })(),
          messages: state.messages.map((message) =>
            message.id === inFlight.placeholderId
              ? { ...message, actionCards: nextActionCards, steps: nextSteps, ...(nextChips ? { chips: nextChips } : {}) }
              : message,
          ),
        }));

        return;
      }

      if (event.type === 'assistant_done') {
        const actionCards = dedupeActionCards(
          event.actionCards.length > 0 ? event.actionCards : inFlight?.actionCards ?? [],
        );
        const pendingViewSwitch = get().pendingViewSwitchByRequestId[event.requestId];

        set((state) => {
          const mapped = mapMessageToUi(event.assistantMessage);

          // Guard: skip if this exact message ID is already in the array
          // (defensive against duplicate events or race conditions)
          const alreadyExists = state.messages.some((m) => m.id === mapped.id);
          if (alreadyExists && !inFlight) {
            // Message was already added (e.g., by the proactive fallback path)
            const remaining = { ...state.inFlightByRequestId };
            delete remaining[event.requestId];
            return { inFlightByRequestId: remaining };
          }

          const baseMessages = state.messages.filter(
            (message) => message.id !== inFlight?.placeholderId,
          );
          const finalizedSteps = collapseConsecutiveTextSteps(inFlight?.steps ?? mapped.steps);
          const finalizedChips = event.chips ?? inFlight?.chips ?? mapped.chips;
          const finalizedAssistantMessage: ChatUiMessage = {
            ...mapped,
            actionCards,
            steps: finalizedSteps,
            ...(finalizedChips ? { chips: finalizedChips } : {}),
          };
          const nextMessages = upsertMessage(baseMessages, finalizedAssistantMessage);
          const remaining = {
            ...state.inFlightByRequestId,
          };
          delete remaining[event.requestId];
          const nextPayloads = {
            ...state.requestPayloadByRequestId,
          };
          delete nextPayloads[event.requestId];
          const nextPendingViewSwitches = {
            ...state.pendingViewSwitchByRequestId,
          };
          delete nextPendingViewSwitches[event.requestId];
          const nextConversationIds = {
            ...state.conversationIdByRequestId,
          };
          delete nextConversationIds[event.requestId];

          const noMoreInFlight = Object.keys(remaining).length === 0;

          return {
            messages: noMoreInFlight
              ? nextMessages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
              : nextMessages,
            inFlightByRequestId: remaining,
            pendingViewSwitchByRequestId: nextPendingViewSwitches,
            requestPayloadByRequestId: nextPayloads,
            conversationIdByRequestId: nextConversationIds,
            assistantMessageIdByRequestId: {
              ...state.assistantMessageIdByRequestId,
              [event.requestId]: finalizedAssistantMessage.id,
            },
            isSending: !noMoreInFlight,
            error: null,
            lastStreamError:
              state.lastStreamError?.requestId === event.requestId
                ? null
                : state.lastStreamError,
          };
        });

        if (pendingViewSwitch?.pendingViewIntent) {
          const appStore = useAppStore.getState();
          const userNavigatedDuringTurn =
            appStore.manualNavigationVersion >
            pendingViewSwitch.manualNavigationVersionAtStart;

          if (!userNavigatedDuringTurn) {
            appStore.setViewFromAssistant(pendingViewSwitch.pendingViewIntent);
          }
        }

        if (shouldRefreshTasks(actionCards)) {
          void useTaskStore.getState().fetchTasks();
        }
        void get().refreshConversations();

        return;
      }

      if (event.type === 'error') {
        set((state) => {
          const placeholderId = state.inFlightByRequestId[event.requestId]?.placeholderId;
          const nextMessages = placeholderId
            ? state.messages.map((message) =>
                message.id === placeholderId
                  ? {
                      ...message,
                      isStreaming: false,
                      content:
                        message.content.trim().length > 0
                          ? message.content
                          : `Error: ${event.message}`,
                    }
                  : message,
              )
            : state.messages;

          const remaining = {
            ...state.inFlightByRequestId,
          };
          delete remaining[event.requestId];

          const nextPayloads = {
            ...state.requestPayloadByRequestId,
          };
          if (!event.retryable) {
            delete nextPayloads[event.requestId];
          }
          const nextPendingViewSwitches = {
            ...state.pendingViewSwitchByRequestId,
          };
          delete nextPendingViewSwitches[event.requestId];
          const nextConversationIds = {
            ...state.conversationIdByRequestId,
          };
          if (!event.retryable) {
            delete nextConversationIds[event.requestId];
          }

          const noMoreInFlight = Object.keys(remaining).length === 0;

          return {
            messages: noMoreInFlight
              ? nextMessages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
              : nextMessages,
            inFlightByRequestId: remaining,
            pendingViewSwitchByRequestId: nextPendingViewSwitches,
            requestPayloadByRequestId: nextPayloads,
            conversationIdByRequestId: nextConversationIds,
            isSending: !noMoreInFlight,
            error: event.message,
            lastStreamError: {
              requestId: event.requestId,
              code: event.code,
              retryable: event.retryable,
              message: event.message,
            },
          };
        });
      }
    },

    setAutonomyMode: async (mode) => {
      try {
        const result = await getUntask().chat.setAutonomyMode({ mode });
        set({ autonomyMode: result.mode, error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    approvePendingAction: async (actionId) => {
      try {
        const result = await getUntask().chat.resolvePendingAction({
          actionId,
          decision: 'approve',
        });

        if (result.ok) {
          const updates = result.actionCard
            ? {
                taskId: result.actionCard.taskId,
                taskEventId: result.actionCard.taskEventId,
                undoable: result.actionCard.undoable,
                title: result.actionCard.title,
                detail: result.actionCard.detail,
              }
            : undefined;

          get().updateCardLifecycle(actionId, result.lifecycle, updates);
          set((state) => ({
            pendingActions: state.pendingActions.filter((a) => a.actionId !== actionId),
            error: null,
          }));
          await useTaskStore.getState().fetchTasks();
        } else {
          set({ error: result.message });
        }
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    rejectPendingAction: async (actionId) => {
      try {
        const result = await getUntask().chat.resolvePendingAction({
          actionId,
          decision: 'reject',
        });

        if (result.ok) {
          get().updateCardLifecycle(actionId, result.lifecycle);
          set((state) => ({
            pendingActions: state.pendingActions.filter((a) => a.actionId !== actionId),
            error: null,
          }));
        } else {
          set({ error: result.message });
        }
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    refreshPendingActions: async () => {
      try {
        const result = await getUntask().chat.listPendingActions();
        set({ pendingActions: result.actions });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    updateCardLifecycle: (actionId, lifecycle, updates) => {
      const applyCardUpdate = (card: ChatActionCard): ChatActionCard => ({
        ...card,
        ...updates,
        lifecycle,
        status: lifecycle === 'executed' ? ('success' as const) : card.status,
      });

      const updateSteps = (steps: TurnStep[]): TurnStep[] =>
        steps.map((step) =>
          step.kind === 'tool' && step.actionCard?.actionId === actionId
            ? { ...step, actionCard: applyCardUpdate(step.actionCard) }
            : step,
        );

      set((state) => ({
        messages: state.messages.map((message) => ({
          ...message,
          actionCards: message.actionCards.map((card) =>
            card.actionId === actionId ? applyCardUpdate(card) : card,
          ),
          steps: updateSteps(message.steps),
        })),
        // Also update inFlight state so assistant_done doesn't overwrite with stale lifecycle
        inFlightByRequestId: Object.fromEntries(
          Object.entries(state.inFlightByRequestId).map(([requestId, inFlight]) => [
            requestId,
            {
              ...inFlight,
              actionCards: inFlight.actionCards.map((card) =>
                card.actionId === actionId ? applyCardUpdate(card) : card,
              ),
              steps: updateSteps(inFlight.steps),
            },
          ]),
        ),
      }));
    },

    addPendingImage: (dataUrl) => {
      const current = get().pendingImages;
      if (current.length >= 4) return;
      set({ pendingImages: [...current, dataUrl] });
    },

    removePendingImage: (index) => {
      set((state) => ({
        pendingImages: state.pendingImages.filter((_, i) => i !== index),
      }));
    },

    clearPendingImages: () => set({ pendingImages: [] }),

    incrementProcessingImages: () =>
      set((state) => ({ processingImageCount: state.processingImageCount + 1 })),

    decrementProcessingImages: () =>
      set((state) => ({ processingImageCount: Math.max(0, state.processingImageCount - 1) })),

    clearFocusMessageId: () => set({ focusMessageId: null }),

    clearError: () => set({ error: null }),
  };
});

export const selectChatMessages = (state: ChatStore) => state.messages;
export const selectChatConversations = (state: ChatStore) => state.conversations;
export const selectChatConversationsTotal = (state: ChatStore) => state.conversationsTotal;
export const selectChatActiveConversationId = (state: ChatStore) => state.activeConversationId;
export const selectChatIsLoadingConversations = (state: ChatStore) => state.isLoadingConversations;
export const selectChatIsSending = (state: ChatStore) => state.isSending;
export const selectChatError = (state: ChatStore) => state.error;
export const selectChatLastStreamError = (state: ChatStore) => state.lastStreamError;
export const selectChatModels = (state: ChatStore) => state.models;
export const selectChatSelectedModelId = (state: ChatStore) => state.selectedModelId;
export const selectChatRetentionMode = (state: ChatStore) => state.retentionMode;
export const selectAutonomyMode = (state: ChatStore) => state.autonomyMode;
export const selectPendingActions = (state: ChatStore) => state.pendingActions;
export const selectPendingImages = (state: ChatStore) => state.pendingImages;
export const selectProcessingImageCount = (state: ChatStore) => state.processingImageCount;
export const selectFocusMessageId = (state: ChatStore) => state.focusMessageId;
export const selectPendingNoteContext = (state: ChatStore) => state.pendingNoteContext;
