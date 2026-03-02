/**
 * Combined chat store — assembles all slices into a single Zustand store.
 *
 * The public API is identical to the original monolithic chatStore.ts.
 */
import { create } from 'zustand';

import { toErrorMessage } from '../../lib/errors';
import { getUntask } from '../../lib/untask';
import { useAppStore } from '../appStore';
import { createConversationActions } from './chatConversationSlice';
import { createMessageActions, createSendPreparedMessage } from './chatMessageSlice';
import { createSettingsActions } from './chatSettingsSlice';
import { createStreamActions } from './chatStreamSlice';
import type { ChatStore } from './chatStoreTypes';
import { mapMessageToUi } from './chatStoreTypes';

export const useChatStore = create<ChatStore>((set, get) => {
  let initializePromise: Promise<void> | null = null;

  // Create the sendPreparedMessage function first (used by message + stream slices)
  const sendPreparedMessage = createSendPreparedMessage(set);

  // Assemble slice actions
  const conversationActions = createConversationActions(set, get);
  const messageActions = createMessageActions(set, get, sendPreparedMessage);
  const streamActions = createStreamActions(set, get, sendPreparedMessage);
  const settingsActions = createSettingsActions(set, get);

  return {
    // ─── Initial state ────────────────────────────────────────
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
    noteHintDismissedForConversationId: null,

    // ─── Initialize ───────────────────────────────────────────
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
          set({ error: toErrorMessage(error, 'Unknown chat operation error.'), isLoadingConversations: false });
        }
      })();

      try {
        await initializePromise;
      } finally {
        initializePromise = null;
      }
    },

    // ─── Conversation actions ─────────────────────────────────
    ...conversationActions,

    // ─── Message actions ──────────────────────────────────────
    ...messageActions,

    // ─── Stream actions ───────────────────────────────────────
    ...streamActions,

    // ─── Settings actions ─────────────────────────────────────
    ...settingsActions,
  };
});

// ─── Selectors ──────────────────────────────────────────────

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
export const selectNoteHintDismissedForConversationId = (state: ChatStore) => state.noteHintDismissedForConversationId;

// Re-export the ChatStore type for external consumers
export type { ChatStore } from './chatStoreTypes';
