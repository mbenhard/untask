/**
 * Conversation management slice: list, create, archive, delete, switch threads.
 */
import type { StoreApi } from 'zustand';

import { toErrorMessage } from '../../lib/errors';
import { getUntask } from '../../lib/untask';
import type { ChatStore } from './chatStoreTypes';
import { mapMessageToUi } from './chatStoreTypes';

// ─── Internal helpers (shared with other slices via closure) ─

export const refreshConversationsInternal = async (
  set: StoreApi<ChatStore>['setState'],
): Promise<void> => {
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

export const ensureActiveConversationId = async (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState'],
): Promise<string> => {
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

export const loadConversationIntoState = async (
  set: StoreApi<ChatStore>['setState'],
  conversationId: string,
): Promise<void> => {
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

// ─── Slice actions ──────────────────────────────────────────

export const createConversationActions = (
  set: StoreApi<ChatStore>['setState'],
  get: StoreApi<ChatStore>['getState'],
) => ({
  refreshConversations: async () => {
    try {
      set({ isLoadingConversations: true });
      await refreshConversationsInternal(set);
      set({ isLoadingConversations: false, error: null });
    } catch (error) {
      set({ isLoadingConversations: false, error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  createConversation: async (title?: string) => {
    try {
      await getUntask().chat.cancel();
    } catch {
      // Ignore cancel failures when no request is active.
    }

    try {
      const created = await getUntask().chat.createThread(
        title?.trim().length ? { title: title.trim() } : undefined,
      );
      await loadConversationIntoState(set, created.conversation.id);
      await refreshConversationsInternal(set);
      set({ error: null });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  setActiveConversation: async (conversationId: string) => {
    if (!conversationId || conversationId === get().activeConversationId) {
      return;
    }

    try {
      await getUntask().chat.cancel();
    } catch {
      // Ignore cancel failures when no request is active.
    }

    try {
      await loadConversationIntoState(set, conversationId);
      await refreshConversationsInternal(set);
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  archiveConversation: async (conversationId: string) => {
    try {
      await getUntask().chat.archiveThread({ conversationId });
      await refreshConversationsInternal(set);

      if (get().activeConversationId === conversationId) {
        const nextActive =
          get().conversations.find(
            (conversation) =>
              conversation.id !== conversationId && !conversation.archivedAt,
          )?.id ?? null;

        if (nextActive) {
          await loadConversationIntoState(set, nextActive);
        } else {
          const created = await getUntask().chat.createThread();
          await loadConversationIntoState(set, created.conversation.id);
          await refreshConversationsInternal(set);
        }
      }

      set({ error: null });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      await getUntask().chat.deleteThread({ conversationId });
      await refreshConversationsInternal(set);

      if (get().activeConversationId === conversationId) {
        const nextActive =
          get().conversations.find(
            (conversation) =>
              conversation.id !== conversationId && !conversation.archivedAt,
          )?.id ?? null;

        if (nextActive) {
          await loadConversationIntoState(set, nextActive);
        } else {
          const created = await getUntask().chat.createThread();
          await loadConversationIntoState(set, created.conversation.id);
          await refreshConversationsInternal(set);
        }
      }

      set({ error: null });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Unknown chat operation error.') });
    }
  },
});
