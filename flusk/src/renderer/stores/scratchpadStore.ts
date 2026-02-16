import { create } from 'zustand';

import { useChatStore } from './chatStore';
import { useAppStore } from './appStore';

type ScratchpadStore = {
  isOpen: boolean;
  content: string;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isSendingToAI: boolean;
  error: string | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  toggleOpen: () => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<void>;
  sendToAI: () => Promise<void>;
  clearError: () => void;
};

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Scratchpad operation failed.';

export const useScratchpadStore = create<ScratchpadStore>((set, get) => ({
  isOpen: false,
  content: '',
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isSendingToAI: false,
  error: null,

  open: async () => {
    if (get().isOpen) {
      return;
    }

    set({
      isOpen: true,
      isLoading: true,
      error: null,
    });

    try {
      const document = await flusk().scratchpad.get();
      set({
        content: document.content,
        isDirty: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error),
      });
    }
  },

  close: async () => {
    if (get().isDirty) {
      await get().save();

      if (get().isDirty) {
        return;
      }
    }

    set({ isOpen: false });
  },

  toggleOpen: async () => {
    if (get().isOpen) {
      await get().close();
      return;
    }

    await get().open();
  },

  setContent: (content) =>
    set((state) => {
      if (state.content === content) {
        return state;
      }

      return {
        content,
        isDirty: true,
      };
    }),

  save: async () => {
    const { isDirty, content, isSaving } = get();

    if (!isDirty || isSaving) {
      return;
    }

    set({
      isSaving: true,
      error: null,
    });

    try {
      const saved = await flusk().scratchpad.save(content);
      set((state) => {
        const contentChangedDuringSave = state.content !== content;

        if (contentChangedDuringSave) {
          return {
            isSaving: false,
            error: null,
          };
        }

        return {
          content: saved.content,
          isDirty: false,
          isSaving: false,
          error: null,
        };
      });
    } catch (error) {
      set({
        isSaving: false,
        error: toErrorMessage(error),
      });
    }
  },

  sendToAI: async () => {
    const { content, isDirty, isSendingToAI } = get();
    const trimmed = content.trim();

    if (!trimmed || isSendingToAI) {
      return;
    }

    if (isDirty) {
      await get().save();
      if (get().isDirty) {
        return;
      }
    }

    set({ isSendingToAI: true, error: null });

    try {
      const prompt = `Parse the following notes and extract any tasks:\n\n${trimmed}`;
      await useChatStore.getState().sendMessage(prompt);
      useAppStore.getState().enterChatMode();
      set({ isOpen: false, isSendingToAI: false });
    } catch (error) {
      set({
        isSendingToAI: false,
        error: error instanceof Error ? error.message : 'Failed to send to AI.',
      });
    }
  },

  clearError: () => set({ error: null }),
}));

export const selectScratchpadIsOpen = (state: ScratchpadStore) => state.isOpen;
export const selectScratchpadContent = (state: ScratchpadStore) => state.content;
export const selectScratchpadIsDirty = (state: ScratchpadStore) => state.isDirty;
export const selectScratchpadIsLoading = (state: ScratchpadStore) => state.isLoading;
export const selectScratchpadIsSaving = (state: ScratchpadStore) => state.isSaving;
export const selectScratchpadIsSendingToAI = (state: ScratchpadStore) => state.isSendingToAI;
export const selectScratchpadError = (state: ScratchpadStore) => state.error;
