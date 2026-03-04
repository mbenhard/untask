/**
 * Message management slice: send, clear, undo, note context, images, card lifecycle.
 */
import type { StoreApi } from 'zustand';

import type { ActionLifecycle, ChatActionCard, ChatNoteContext, TurnStep } from '../../../types/chat';
import { toErrorMessage } from '../../lib/errors';
import { getUntask } from '../../lib/untask';
import { resolveBlockNoteImages, resolveTaskAttachmentImages } from '../../utils/imageResize';
import { useAppStore } from '../appStore';
import { getActiveNoteDraftContent } from '../notesDraftBridge';
import { useTaskStore } from '../taskStore';
import { ensureActiveConversationId } from './chatConversationSlice';
import type { ChatStore, ChatUiMessage } from './chatStoreTypes';
import { mapMessageToUi, upsertMessage } from './chatStoreTypes';

// ─── Send prepared message (internal) ───────────────────────

export const createSendPreparedMessage = (
  set: StoreApi<ChatStore>['setState'],
) => {
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
        streamPhase: 'sending',
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
        error: toErrorMessage(error, 'Unknown chat operation error.'),
      });
    }
  };

  return sendPreparedMessage;
};

// ─── Slice actions ──────────────────────────────────────────

export const createMessageActions = (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState'],
  sendPreparedMessage: (
    content: string,
    modelId: string | null,
    conversationId: string,
    images?: string[],
    noteContext?: ChatNoteContext,
  ) => Promise<void>,
) => {
  const imageProcessingWaiters = new Set<() => void>();
  const IMAGE_PROCESSING_WAIT_TIMEOUT_MS = 5_000;

  const flushImageProcessingWaiters = (): void => {
    if (imageProcessingWaiters.size === 0) {
      return;
    }

    const waiters = Array.from(imageProcessingWaiters);
    imageProcessingWaiters.clear();
    waiters.forEach((resolve) => resolve());
  };

  const waitForImageProcessing = async (): Promise<void> => {
    if (get().processingImageCount <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      let isDone = false;
      const timeoutId = setTimeout(() => {
        if (isDone) {
          return;
        }
        isDone = true;
        imageProcessingWaiters.delete(complete);
        resolve();
      }, IMAGE_PROCESSING_WAIT_TIMEOUT_MS);

      const complete = () => {
        if (isDone) {
          return;
        }
        isDone = true;
        clearTimeout(timeoutId);
        imageProcessingWaiters.delete(complete);
        resolve();
      };

      imageProcessingWaiters.add(complete);

      // Re-check after registration to avoid missing a transition to zero.
      if (get().processingImageCount <= 0) {
        complete();
      }
    });
  };

  return {
  sendMessage: async (content: string) => {
    if (get().isSending) {
      return;
    }

    // Wait for any in-flight image processing to complete.
    await waitForImageProcessing();

    const selected = await getUntask().chat.getSelectedModel().catch(() => null);
    if (selected?.modelId) {
      set({ selectedModelId: selected.modelId });
    }
    const images = [...get().pendingImages];
    const noteContext = get().pendingNoteContext ?? undefined;
    set({ pendingImages: [] });

    // Inject images from the currently selected task's attachments
    const taskState = useTaskStore.getState();
    const selectedTask = taskState.selectedTaskId
      ? taskState.tasks.find((t) => t.id === taskState.selectedTaskId)
      : null;

    if (selectedTask?.id) {
      try {
        const taskImages = await resolveTaskAttachmentImages(selectedTask.id);
        images.push(...taskImages);
      } catch {
        // Non-fatal -- send without task attachment images
      }
    }

    // Inject images from the attached note's content
    if (noteContext) {
      try {
        // Reuse the active in-memory draft only when this note is currently open.
        const rawContent = getActiveNoteDraftContent(noteContext.noteId);
        if (rawContent) {
          const noteImages = await resolveBlockNoteImages(rawContent);
          images.push(...noteImages);
        }
      } catch {
        // Non-fatal -- send without note attachment images
      }
    }

    const conversationId = await ensureActiveConversationId(set, get);
    await sendPreparedMessage(
      content,
      selected?.modelId ?? null,
      conversationId,
      images,
      noteContext,
    );
  },

  stageNoteContext: (context: ChatNoteContext) => {
    set({ pendingNoteContext: context });
  },

  consumePendingNoteContext: (): ChatNoteContext | null => {
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

  dismissNoteHint: (noteId: string) => {
    const conversationId = get().activeConversationId;
    if (conversationId) {
      set({ noteHintDismissed: { conversationId, noteId } });
    }
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
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  undoAction: async (taskEventId?: string) => {
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
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  updateCardLifecycle: (
    actionId: string,
    lifecycle: ActionLifecycle,
    updates?: Partial<ChatActionCard>,
  ) => {
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

  addPendingImage: (dataUrl: string) => {
    const current = get().pendingImages;
    if (current.length >= 4) return;
    set({ pendingImages: [...current, dataUrl] });
  },

  removePendingImage: (index: number) => {
    set((state) => ({
      pendingImages: state.pendingImages.filter((_, i) => i !== index),
    }));
  },

  clearPendingImages: () => set({ pendingImages: [] }),

  incrementProcessingImages: () =>
    set((state) => ({ processingImageCount: state.processingImageCount + 1 })),

  decrementProcessingImages: () => {
    set((state) => ({ processingImageCount: Math.max(0, state.processingImageCount - 1) }));
    if (get().processingImageCount <= 0) {
      flushImageProcessingWaiters();
    }
  },

  clearFocusMessageId: () => set({ focusMessageId: null }),

  clearError: () => set({ error: null }),
  };
};
