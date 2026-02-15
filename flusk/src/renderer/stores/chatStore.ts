import { create } from 'zustand';

import type {
  ActionLifecycle,
  AutonomyMode,
  ChatActionCard,
  ChatModelCatalogEntry,
  ChatPendingActionEntry,
  ChatRetentionMode,
  ChatStreamEvent,
  PersistedChatToolMetadata,
} from '../../types/chat';
import type { ChatMessage } from '../../types/models';
import { useTaskStore } from './taskStore';

type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  isStreaming?: boolean;
  actionCards: ChatActionCard[];
};

type InFlightStream = {
  placeholderId: string;
  actionCards: ChatActionCard[];
};

type ChatStore = {
  messages: ChatUiMessage[];
  isInitialized: boolean;
  isSending: boolean;
  error: string | null;
  models: ChatModelCatalogEntry[];
  selectedModelId: string | null;
  retentionMode: ChatRetentionMode;
  inFlightByRequestId: Record<string, InFlightStream>;
  unsubscribeStream?: () => void;
  autonomyMode: AutonomyMode;
  pendingActions: ChatPendingActionEntry[];

  initialize: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
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
  updateCardLifecycle: (
    actionId: string,
    lifecycle: ActionLifecycle,
    updates?: Partial<ChatActionCard>,
  ) => void;
};

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown chat operation error.';

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

    return {
      requestId: typeof parsed.requestId === 'string' ? parsed.requestId : '',
      modelId: typeof parsed.modelId === 'string' ? parsed.modelId : '',
      actionCards: parsed.actionCards,
      toolExecutions: Array.isArray(parsed.toolExecutions)
        ? parsed.toolExecutions
        : [],
    };
  } catch {
    return null;
  }
};

const mapMessageToUi = (message: ChatMessage): ChatUiMessage => {
  const metadata = parseToolMetadata(message.toolCalls);

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    actionCards: metadata?.actionCards ?? [],
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

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isInitialized: false,
  isSending: false,
  error: null,
  models: [],
  selectedModelId: null,
  retentionMode: '30d',
  inFlightByRequestId: {},
  autonomyMode: 'safe',
  pendingActions: [],

  initialize: async () => {
    if (get().isInitialized) {
      return;
    }

    try {
      const [history, models, selectedModel, retention, autonomy, pending] = await Promise.all([
        flusk().chat.history(),
        flusk().chat.getModels(),
        flusk().chat.getSelectedModel(),
        flusk().chat.getRetentionMode(),
        flusk().chat.getAutonomyMode(),
        flusk().chat.listPendingActions(),
      ]);

      const unsubscribeStream = flusk().chat.onStreamEvent((event) => {
        get().applyStreamEvent(event);
      });

      set({
        messages: history.map(mapMessageToUi),
        models,
        selectedModelId: selectedModel.modelId,
        retentionMode: retention.mode,
        autonomyMode: autonomy.mode,
        pendingActions: pending.actions,
        unsubscribeStream,
        isInitialized: true,
        error: null,
      });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  sendMessage: async (content) => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return;
    }

    try {
      set({ isSending: true, error: null });

      const response = await flusk().chat.send({
        content: trimmed,
        modelId: get().selectedModelId,
      });

      const userMessage = mapMessageToUi(response.userMessage);
      const placeholderId = `assistant-stream-${response.requestId}`;
      const placeholderMessage: ChatUiMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        isStreaming: true,
        actionCards: [],
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
          },
        },
      }));
    } catch (error) {
      set({
        isSending: false,
        error: toErrorMessage(error),
      });
    }
  },

  clearHistory: async () => {
    try {
      await flusk().chat.clear();
      set({
        messages: [],
        inFlightByRequestId: {},
        isSending: false,
        error: null,
      });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  undoAction: async (taskEventId) => {
    try {
      const result = await flusk().chat.undoLastAction(
        taskEventId ? { taskEventId } : undefined,
      );

      if (!result.ok) {
        throw new Error(result.message);
      }

      if (result.undone) {
        // Update matching action card lifecycle to undone
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
        flusk().chat.setSelectedModel({ modelId }),
        flusk().chat.getModels(),
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
      const updated = await flusk().chat.setRetentionMode({ mode });
      set({ retentionMode: updated.mode, error: null });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  applyStreamEvent: (event) => {
    const inFlight = get().inFlightByRequestId[event.requestId];

    if (event.type === 'token') {
      if (!inFlight) {
        return;
      }

      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === inFlight.placeholderId
            ? { ...message, content: `${message.content}${event.text}` }
            : message,
        ),
      }));

      return;
    }

    if (event.type === 'tool_call_completed') {
      if (!inFlight || !event.actionCard) {
        return;
      }

      const nextActionCards = [...inFlight.actionCards, event.actionCard];

      set((state) => ({
        inFlightByRequestId: {
          ...state.inFlightByRequestId,
          [event.requestId]: {
            ...inFlight,
            actionCards: nextActionCards,
          },
        },
        messages: state.messages.map((message) =>
          message.id === inFlight.placeholderId
            ? { ...message, actionCards: nextActionCards }
            : message,
        ),
      }));

      return;
    }

    if (event.type === 'assistant_done') {
      const actionCards =
        event.actionCards.length > 0 ? event.actionCards : inFlight?.actionCards ?? [];

      set((state) => {
        const nextMessages = state.messages
          .filter((message) => message.id !== inFlight?.placeholderId)
          .concat({
            ...mapMessageToUi(event.assistantMessage),
            actionCards,
          });

        const remaining = {
          ...state.inFlightByRequestId,
        };
        delete remaining[event.requestId];

        return {
          messages: nextMessages,
          inFlightByRequestId: remaining,
          isSending: Object.keys(remaining).length > 0,
          error: null,
        };
      });

      if (shouldRefreshTasks(actionCards)) {
        void useTaskStore.getState().fetchTasks();
      }

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

        return {
          messages: nextMessages,
          inFlightByRequestId: remaining,
          isSending: Object.keys(remaining).length > 0,
          error: event.message,
        };
      });
    }
  },

  setAutonomyMode: async (mode) => {
    try {
      const result = await flusk().chat.setAutonomyMode({ mode });
      set({ autonomyMode: result.mode, error: null });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  approvePendingAction: async (actionId) => {
    try {
      const result = await flusk().chat.resolvePendingAction({
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
      const result = await flusk().chat.resolvePendingAction({
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
      const result = await flusk().chat.listPendingActions();
      set({ pendingActions: result.actions });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  updateCardLifecycle: (actionId, lifecycle, updates) => {
    set((state) => ({
      messages: state.messages.map((message) => ({
        ...message,
        actionCards: message.actionCards.map((card) =>
          card.actionId === actionId
            ? {
              ...card,
              ...updates,
              lifecycle,
              status: lifecycle === 'executed' ? 'success' as const : card.status,
            }
            : card,
        ),
      })),
    }));
  },

  clearError: () => set({ error: null }),
}));

export const selectChatMessages = (state: ChatStore) => state.messages;
export const selectChatIsSending = (state: ChatStore) => state.isSending;
export const selectChatError = (state: ChatStore) => state.error;
export const selectChatModels = (state: ChatStore) => state.models;
export const selectChatSelectedModelId = (state: ChatStore) => state.selectedModelId;
export const selectChatRetentionMode = (state: ChatStore) => state.retentionMode;
export const selectAutonomyMode = (state: ChatStore) => state.autonomyMode;
export const selectPendingActions = (state: ChatStore) => state.pendingActions;
