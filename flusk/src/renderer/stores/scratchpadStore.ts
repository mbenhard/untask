import { create } from 'zustand';

import { isBlockNoteJson } from '../components/editor/editorUtils';
import { getFlusk } from '../lib/flusk';
import { useAppStore } from './appStore';
import { useChatStore } from './chatStore';

type ScratchpadStore = {
  content: string;
  isLegacyMarkdown: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isSendingToAI: boolean;
  error: string | null;
  load: () => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<void>;
  sendToAI: (markdownOverride?: string) => Promise<void>;
  clearError: () => void;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Scratchpad operation failed.';

export const useScratchpadStore = create<ScratchpadStore>((set, get) => ({
  content: '',
  isLegacyMarkdown: false,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isSendingToAI: false,
  error: null,

  load: async () => {
    if (get().isLoading) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const document = await getFlusk().scratchpad.get();
      const raw = document.content;
      const legacy = raw.length > 0 && !isBlockNoteJson(raw);

      set({
        content: raw,
        isLegacyMarkdown: legacy,
        isDirty: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({ isLoading: false, error: toErrorMessage(error) });
    }
  },

  setContent: (content) =>
    set((state) => {
      if (state.content === content) {
        return state;
      }

      return { content, isDirty: true, isLegacyMarkdown: false };
    }),

  save: async () => {
    const { isDirty, content, isSaving } = get();
    if (!isDirty || isSaving) {
      return;
    }

    set({ isSaving: true, error: null });

    try {
      const saved = await getFlusk().scratchpad.save(content);
      set((state) => {
        if (state.content !== content) {
          return { isSaving: false, error: null };
        }

        return { content: saved.content, isDirty: false, isSaving: false, error: null };
      });
    } catch (error) {
      set({ isSaving: false, error: toErrorMessage(error) });
    }
  },

  sendToAI: async (markdownOverride) => {
    const { content, isDirty, isSendingToAI } = get();
    const promptContent = (markdownOverride ?? content).trim();

    if (!promptContent || isSendingToAI) {
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
      const prompt = `Parse the following notes and extract any tasks:\n\n${promptContent}`;
      await useChatStore.getState().sendMessage(prompt);
      useAppStore.getState().openChatOverlay();
      set({ isSendingToAI: false });
    } catch (error) {
      set({
        isSendingToAI: false,
        error: error instanceof Error ? error.message : 'Failed to send to AI.',
      });
    }
  },

  clearError: () => set({ error: null }),
}));

export const selectScratchpadContent = (state: ScratchpadStore) => state.content;
export const selectScratchpadIsLegacyMarkdown = (state: ScratchpadStore) => state.isLegacyMarkdown;
export const selectScratchpadIsDirty = (state: ScratchpadStore) => state.isDirty;
export const selectScratchpadIsLoading = (state: ScratchpadStore) => state.isLoading;
export const selectScratchpadIsSaving = (state: ScratchpadStore) => state.isSaving;
export const selectScratchpadIsSendingToAI = (state: ScratchpadStore) => state.isSendingToAI;
export const selectScratchpadError = (state: ScratchpadStore) => state.error;
