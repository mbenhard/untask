import { create } from 'zustand';

import type {
  ActionLifecycle,
  AutonomyMode,
  ChatActionCard,
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
import { getFlusk } from '../lib/flusk';
import { useAppStore } from './appStore';
import { useTaskStore } from './taskStore';

type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  isStreaming?: boolean;
  actionCards: ChatActionCard[];
  steps: TurnStep[];
  imageCount?: number;
};

type InFlightStream = {
  placeholderId: string;
  actionCards: ChatActionCard[];
  steps: TurnStep[];
};

type PendingViewSwitch = {
  manualNavigationVersionAtStart: number;
  pendingViewIntent: ChatViewIntent | null;
};

type ChatRequestPayload = {
  content: string;
  modelId: string | null;
};

type ChatLastStreamError = {
  requestId: string;
  code: ChatStreamErrorCode;
  retryable: boolean;
  message: string;
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
  pendingViewSwitchByRequestId: Record<string, PendingViewSwitch>;
  requestPayloadByRequestId: Record<string, ChatRequestPayload>;
  lastStreamError: ChatLastStreamError | null;
  unsubscribeStream?: () => void;
  autonomyMode: AutonomyMode;
  pendingActions: ChatPendingActionEntry[];
  pendingImages: string[];

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
      ...(parsed.telemetry ? { telemetry: parsed.telemetry } : {}),
      ...(typeof parsed.reasoningText === 'string' ? { reasoningText: parsed.reasoningText } : {}),
      ...(Array.isArray(parsed.stepDescriptions) ? { stepDescriptions: parsed.stepDescriptions } : {}),
      ...(typeof parsed.imageCount === 'number' ? { imageCount: parsed.imageCount } : {}),
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

const mapMessageToUi = (message: ChatMessage): ChatUiMessage => {
  const metadata = parseToolMetadata(message.toolCalls);
  const imageCount = metadata?.imageCount ?? parseImageCount(message.toolCalls);

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    actionCards: dedupeActionCards(metadata?.actionCards ?? []),
    steps: message.role === 'assistant'
      ? reconstructStepsFromMetadata(metadata, message.content)
      : [],
    ...(imageCount ? { imageCount } : {}),
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
  }
};

export const useChatStore = create<ChatStore>((set, get) => {
  let initializePromise: Promise<void> | null = null;

  const sendPreparedMessage = async (
    content: string,
    modelId: string | null,
    images?: string[],
  ): Promise<void> => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return;
    }

    try {
      set({ isSending: true, error: null });

      const response = await getFlusk().chat.send({
        content: trimmed,
        modelId,
        images: images?.length ? images : undefined,
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
          },
        },
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

  return {
    messages: [],
    isInitialized: false,
    isSending: false,
    error: null,
    models: [],
    selectedModelId: null,
    retentionMode: '30d',
    inFlightByRequestId: {},
    pendingViewSwitchByRequestId: {},
    requestPayloadByRequestId: {},
    lastStreamError: null,
    autonomyMode: 'safe',
    pendingActions: [],
    pendingImages: [],

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
          const [history, models, selectedModel, retention, autonomy, pending] =
            await Promise.all([
              getFlusk().chat.history(),
              getFlusk().chat.getModels(),
              getFlusk().chat.getSelectedModel(),
              getFlusk().chat.getRetentionMode(),
              getFlusk().chat.getAutonomyMode(),
              getFlusk().chat.listPendingActions(),
            ]);

          const existingUnsubscribe = get().unsubscribeStream;
          existingUnsubscribe?.();

          const unsubscribeStream = getFlusk().chat.onStreamEvent((event) => {
            get().applyStreamEvent(event);
          });

          set({
            messages: history.map(mapMessageToUi),
            models,
            selectedModelId: selectedModel.modelId,
            retentionMode: retention.mode,
            autonomyMode: autonomy.mode,
            pendingActions: pending.actions,
            pendingViewSwitchByRequestId: {},
            unsubscribeStream,
            isInitialized: true,
            error: null,
          });
        } catch (error) {
          set({ error: toErrorMessage(error) });
        }
      })();

      try {
        await initializePromise;
      } finally {
        initializePromise = null;
      }
    },

    sendMessage: async (content) => {
      const selected = await getFlusk().chat.getSelectedModel().catch(() => null);
      if (selected?.modelId) {
        set({ selectedModelId: selected.modelId });
      }
      const images = get().pendingImages;
      set({ pendingImages: [] });
      await sendPreparedMessage(content, selected?.modelId ?? null, images);
    },

    cancelStream: async () => {
      await getFlusk().chat.cancel();
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
      });
    },

    retryLastFailedMessage: async () => {
      const failed = get().lastStreamError;
      if (!failed || !failed.retryable) {
        return;
      }

      const payload = get().requestPayloadByRequestId[failed.requestId];
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
        return {
          requestPayloadByRequestId: nextPayloads,
          pendingViewSwitchByRequestId: nextPendingViewSwitches,
          lastStreamError: null,
          error: null,
        };
      });

      await sendPreparedMessage(payload.content, payload.modelId);
    },

    clearHistory: async () => {
      try {
        await getFlusk().chat.clear();
        set({
          messages: [],
          inFlightByRequestId: {},
          pendingViewSwitchByRequestId: {},
          requestPayloadByRequestId: {},
          lastStreamError: null,
          isSending: false,
          error: null,
        });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    undoAction: async (taskEventId) => {
      try {
        const result = await getFlusk().chat.undoLastAction(
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
          getFlusk().chat.setSelectedModel({ modelId }),
          getFlusk().chat.getModels(),
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
        const updated = await getFlusk().chat.setRetentionMode({ mode });
        set({ retentionMode: updated.mode, error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    applyStreamEvent: (event) => {
      const inFlight = get().inFlightByRequestId[event.requestId];

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
              ? { ...message, actionCards: nextActionCards, steps: nextSteps }
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
          const baseMessages = state.messages.filter(
            (message) => message.id !== inFlight?.placeholderId,
          );
          const mapped = mapMessageToUi(event.assistantMessage);
          const finalizedSteps = inFlight?.steps ?? mapped.steps;
          const finalizedAssistantMessage: ChatUiMessage = {
            ...mapped,
            actionCards,
            steps: finalizedSteps,
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

          return {
            messages: nextMessages,
            inFlightByRequestId: remaining,
            pendingViewSwitchByRequestId: nextPendingViewSwitches,
            requestPayloadByRequestId: nextPayloads,
            isSending: Object.keys(remaining).length > 0,
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

          return {
            messages: nextMessages,
            inFlightByRequestId: remaining,
            pendingViewSwitchByRequestId: nextPendingViewSwitches,
            requestPayloadByRequestId: nextPayloads,
            isSending: Object.keys(remaining).length > 0,
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
        const result = await getFlusk().chat.setAutonomyMode({ mode });
        set({ autonomyMode: result.mode, error: null });
      } catch (error) {
        set({ error: toErrorMessage(error) });
      }
    },

    approvePendingAction: async (actionId) => {
      try {
        const result = await getFlusk().chat.resolvePendingAction({
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
        const result = await getFlusk().chat.resolvePendingAction({
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
        const result = await getFlusk().chat.listPendingActions();
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
                  status: lifecycle === 'executed' ? ('success' as const) : card.status,
                }
              : card,
          ),
        })),
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

    clearError: () => set({ error: null }),
  };
});

export const selectChatMessages = (state: ChatStore) => state.messages;
export const selectChatIsSending = (state: ChatStore) => state.isSending;
export const selectChatError = (state: ChatStore) => state.error;
export const selectChatLastStreamError = (state: ChatStore) => state.lastStreamError;
export const selectChatModels = (state: ChatStore) => state.models;
export const selectChatSelectedModelId = (state: ChatStore) => state.selectedModelId;
export const selectChatRetentionMode = (state: ChatStore) => state.retentionMode;
export const selectAutonomyMode = (state: ChatStore) => state.autonomyMode;
export const selectPendingActions = (state: ChatStore) => state.pendingActions;
export const selectPendingImages = (state: ChatStore) => state.pendingImages;
