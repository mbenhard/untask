/**
 * Stream event processing slice: applyStreamEvent with a handler-map pattern,
 * plus cancel/retry actions.
 */
import type { StoreApi } from 'zustand';

import type { ChatStreamEvent, TurnStep } from '../../../types/chat';
import { getUntask } from '../../lib/untask';
import { useAppStore } from '../appStore';
import { useTaskStore } from '../taskStore';
import { ensureActiveConversationId } from './chatConversationSlice';
import type { ChatStore, ChatUiMessage, InFlightStream } from './chatStoreTypes';
import {
  collapseConsecutiveTextSteps,
  dedupeActionCards,
  mapMessageToUi,
  revealPeekIfChatNotOpen,
  shouldRefreshTasks,
  upsertMessage,
} from './chatStoreTypes';

// ─── Stream event handler types ─────────────────────────────

type StreamHandlerContext = {
  set: StoreApi<ChatStore>['setState'];
  get: StoreApi<ChatStore>['getState'];
  event: ChatStreamEvent;
  inFlight: InFlightStream | undefined;
};

type StreamEventHandler = (ctx: StreamHandlerContext) => void;

// ─── Proactive inFlight bootstrap ───────────────────────────

/**
 * Auto-creates inFlight state for proactive messages (no preceding user send).
 * Returns the (possibly new) inFlight for the request, or undefined if none.
 */
const bootstrapProactiveInFlight = (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState'],
  event: ChatStreamEvent,
  inFlight: InFlightStream | undefined,
): InFlightStream | undefined => {
  if (
    inFlight ||
    !event.requestId.startsWith('proactive-') ||
    event.type === 'error' ||
    event.type === 'assistant_done'
  ) {
    return inFlight;
  }

  const placeholderId = `assistant-stream-${event.requestId}`;
  const placeholder: ChatUiMessage = {
    id: placeholderId,
    conversationId: get().activeConversationId,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    isStreaming: true,
    streamPhase: 'sending',
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
      // Placeholder still has no content -- remove it
      const { [event.requestId]: _, ...remaining } = get().inFlightByRequestId;
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== placeholderId),
        inFlightByRequestId: remaining,
        isSending: Object.keys(remaining).length > 0,
      }));
    }
  }, PROACTIVE_PLACEHOLDER_TIMEOUT_MS);

  return newInFlight;
};

// ─── Individual event handlers ──────────────────────────────

const handleReasoning: StreamEventHandler = ({ set, event, inFlight }) => {
  if (!inFlight || event.type !== 'reasoning') return;

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
        ? { ...message, steps: nextSteps, streamPhase: 'thinking' }
        : message,
    ),
  }));
};

const handleToken: StreamEventHandler = ({ set, event, inFlight }) => {
  if (!inFlight || event.type !== 'token') return;

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
          streamPhase: undefined,
        }
        : message,
    ),
  }));
};

const handleToolCallStarted: StreamEventHandler = ({ set, event, inFlight }) => {
  if (!inFlight || event.type !== 'tool_call_started') return;

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
        ? { ...message, steps: nextSteps, streamPhase: undefined }
        : message,
    ),
  }));
};

const handleToolCallCompleted: StreamEventHandler = ({ set, event, inFlight }) => {
  if (!inFlight || event.type !== 'tool_call_completed') return;

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
};

const handleAssistantDone: StreamEventHandler = ({ set, get, event, inFlight }) => {
  if (event.type !== 'assistant_done') return;

  // For proactive assistant_done with no inFlight, just append the message
  if (!inFlight && event.requestId.startsWith('proactive-')) {
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
};

const handleError: StreamEventHandler = ({ set, event }) => {
  if (event.type !== 'error') return;

  set((state) => {
    const placeholderId = state.inFlightByRequestId[event.requestId]?.placeholderId;
    const nextMessages = placeholderId
      ? state.messages.map((message) =>
        message.id === placeholderId
          ? {
            ...message,
            isStreaming: false,
            streamPhase: undefined,
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
};

// ─── Handler map ────────────────────────────────────────────

const streamEventHandlers: Record<ChatStreamEvent['type'], StreamEventHandler> = {
  reasoning: handleReasoning,
  token: handleToken,
  tool_call_started: handleToolCallStarted,
  tool_call_completed: handleToolCallCompleted,
  assistant_done: handleAssistantDone,
  error: handleError,
};

// ─── Slice actions ──────────────────────────────────────────

export const createStreamActions = (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState'],
  sendPreparedMessage: (
    content: string,
    modelId: string | null,
    conversationId: string,
    images?: string[],
    noteContext?: import('../../../types/chat').ChatNoteContext,
  ) => Promise<void>,
) => ({
  applyStreamEvent: (event: ChatStreamEvent) => {
    let inFlight: InFlightStream | undefined = get().inFlightByRequestId[event.requestId];

    // Auto-create inFlight for proactive messages (no preceding user send)
    inFlight = bootstrapProactiveInFlight(set, get, event, inFlight);

    // Peek reveal for certain event types
    if (
      event.type === 'reasoning' ||
      event.type === 'token' ||
      event.type === 'tool_call_started' ||
      event.type === 'tool_call_completed' ||
      event.type === 'assistant_done'
    ) {
      revealPeekIfChatNotOpen();
    }

    const handler = streamEventHandlers[event.type];
    handler({ set, get, event, inFlight });
  },

  cancelStream: async () => {
    await getUntask().chat.cancel();
    const { messages } = get();
    const updatedMessages = messages
      .map((msg) => {
        if (msg.isStreaming) {
          const hasContent = msg.content.trim().length > 0;
          const hasVisibleSteps = msg.steps.some(
            (step) => step.kind === 'text' || step.kind === 'tool',
          );

          if (!hasContent && !hasVisibleSteps) {
            return null;
          }

          const cancellationNote = '\n\n*(Generation stopped)*';
          const finalContent = msg.content + cancellationNote;

          return {
            ...msg,
            content: finalContent.trim(),
            isStreaming: false,
            streamPhase: undefined,
          };
        }
        return msg;
      })
      .filter((msg): msg is ChatUiMessage => msg !== null);
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
      failedConversationId ?? get().activeConversationId ?? (await ensureActiveConversationId(set, get));

    await sendPreparedMessage(
      payload.content,
      payload.modelId,
      conversationId,
      undefined,
      payload.noteContext,
    );
  },
});
