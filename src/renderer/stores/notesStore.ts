import { create } from 'zustand';

import type { Note } from '../../types/models';
import { isBlockNoteJson } from '../components/editor/editorUtils';
import { toErrorMessage } from '../lib/errors';
import { deriveAutoTitle } from '../lib/noteUtils';
import { getUntask } from '../lib/untask';
import { useAppStore } from './appStore';
import { useChatStore } from './chatStore';
import { setActiveNoteDraft } from './notesDraftBridge';
import { useToastStore } from './toastStore';

export type NotesSubView = 'list' | 'editor';
export type NotesLayoutMode = 'list' | 'focus';

export type NotesNotice = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

export type ProcessWithAIResult = {
  ok: boolean;
  reason?: 'empty_note' | 'save_failed' | 'staged';
};

type NotesStore = {
  // List state
  activeNotes: Note[];
  archivedNotes: Note[];
  isListLoading: boolean;
  selectedListNoteId: string | null;

  // View state
  subView: NotesSubView;
  layoutMode: NotesLayoutMode;

  // Editor state
  activeNoteId: string | null;
  activeNoteUpdatedAt: string | null;
  content: string;
  isLegacyMarkdown: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isProcessing: boolean;
  error: string | null;
  notice: NotesNotice | null;

  // Actions
  loadList: (preferredSelectedId?: string | null) => Promise<void>;
  enterNotesView: () => Promise<void>;
  createNote: () => Promise<void>;
  openNote: (id: string) => Promise<void>;
  openSelectedNote: () => Promise<boolean>;
  openAdjacentNote: (direction: -1 | 1) => Promise<boolean>;
  backToList: () => Promise<void>;

  setContent: (content: string) => void;
  save: () => Promise<boolean>;
  flushAndSave: () => Promise<boolean>;

  archiveNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  pinNote: (id: string) => Promise<void>;
  unpinNote: (id: string) => Promise<void>;
  duplicateNote: (id: string) => Promise<void>;
  copyAsMarkdown: (id: string) => Promise<void>;
  processWithAI: (markdownOverride?: string) => Promise<ProcessWithAIResult>;

  setLayoutMode: (mode: NotesLayoutMode) => void;
  setSelectedListNoteId: (id: string | null) => void;
  selectRelativeActive: (delta: -1 | 1) => string | null;

  setNotice: (notice: NotesNotice, ttlMs?: number) => void;
  clearNotice: () => void;
  clearError: () => void;
};

const NOTES_LAST_OPENED_ID_SETTING_KEY = 'notes.last_opened_id';
const NOTES_LAST_SUB_VIEW_SETTING_KEY = 'notes.last_sub_view';

const editorLayout = (): NotesLayoutMode => 'focus';

const readPersistedLastOpenedNoteId = async (): Promise<string | null> => {
  try {
    const value = await getUntask().settings.get(NOTES_LAST_OPENED_ID_SETTING_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
};

const persistLastOpenedNoteId = async (noteId: string | null): Promise<void> => {
  try {
    await getUntask().settings.set(NOTES_LAST_OPENED_ID_SETTING_KEY, noteId ?? '');
  } catch {
    // Settings persistence should never block core notes flows.
  }
};

const readPersistedSubView = async (): Promise<NotesSubView | null> => {
  try {
    const value = await getUntask().settings.get(NOTES_LAST_SUB_VIEW_SETTING_KEY);
    return value === 'list' || value === 'editor' ? value : null;
  } catch {
    return null;
  }
};

const persistSubView = async (subView: NotesSubView): Promise<void> => {
  try {
    await getUntask().settings.set(NOTES_LAST_SUB_VIEW_SETTING_KEY, subView);
  } catch {
    // Settings persistence should never block core notes flows.
  }
};

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let enterNotesViewPromise: Promise<void> | null = null;

const clearNoticeTimer = (): void => {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
};

type StoredInlineContent = {
  type?: string;
  text?: string;
};

type StoredBlock = {
  type?: string;
  props?: {
    level?: number;
    url?: string;
    caption?: string;
    name?: string;
  };
  content?: StoredInlineContent[];
  children?: StoredBlock[];
};

type DeletedNoteSnapshot = {
  content: string;
  status: Note['status'];
  isPinned: boolean;
};

const extractInlineText = (content?: StoredInlineContent[]): string => {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .join('')
    .trim();
};

const blockPrefix = (block: StoredBlock): string => {
  if (block.type === 'heading') {
    const level =
      typeof block.props?.level === 'number'
        ? Math.max(1, Math.min(6, block.props.level))
        : 1;
    return `${'#'.repeat(level)} `;
  }

  if (block.type === 'bulletListItem') {
    return '- ';
  }

  if (block.type === 'numberedListItem') {
    return '1. ';
  }

  if (block.type === 'checkListItem') {
    return '- [ ] ';
  }

  return '';
};

const appendMarkdownLines = (
  blocks: StoredBlock[],
  lines: string[],
  depth = 0,
): void => {
  for (const block of blocks) {
    const indent = depth > 0 ? `${'  '.repeat(depth)}` : '';

    if (block.type === 'image') {
      const url = block.props?.url ?? '';
      const caption = block.props?.caption ?? block.props?.name ?? 'image';
      lines.push(`${indent}![${caption}](${url})`.trimEnd());
    } else if (block.type === 'file') {
      const url = block.props?.url ?? '';
      const name = block.props?.name ?? 'file';
      lines.push(`${indent}[${name}](${url})`.trimEnd());
    } else {
      const text = extractInlineText(block.content);
      const prefix = blockPrefix(block);

      if (text.length > 0) {
        lines.push(`${indent}${prefix}${text}`.trimEnd());
      }
    }

    if (Array.isArray(block.children) && block.children.length > 0) {
      appendMarkdownLines(block.children, lines, depth + 1);
    }
  }
};

const serializeNoteForProcessing = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return '';
  }

  if (!isBlockNoteJson(raw)) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(raw) as StoredBlock[];
    if (!Array.isArray(parsed)) {
      return trimmed;
    }

    const lines: string[] = [];
    appendMarkdownLines(parsed, lines);
    return lines.join('\n').trim();
  } catch {
    return trimmed;
  }
};

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) {
    return -1;
  }
  return Math.min(Math.max(index, 0), length - 1);
};

const getAdjacentActiveNoteId = (activeNotes: Note[], removedId: string): string | null => {
  if (activeNotes.length <= 1) {
    return null;
  }

  const removedIndex = activeNotes.findIndex((note) => note.id === removedId);
  if (removedIndex === -1) {
    return null;
  }

  const fallback = activeNotes[removedIndex + 1] ?? activeNotes[removedIndex - 1];
  return fallback?.id ?? null;
};

/** Shared state fragment that resets the editor to list mode. */
const NOTES_LIST_RESET_STATE = {
  subView: 'list' as const,
  layoutMode: 'list' as const,
  activeNoteId: null,
  activeNoteUpdatedAt: null,
  content: '',
  isDirty: false,
} as const;

export const useNotesStore = create<NotesStore>((set, get) => ({
  activeNotes: [],
  archivedNotes: [],
  isListLoading: false,
  selectedListNoteId: null,

  subView: 'list',
  layoutMode: 'list',

  activeNoteId: null,
  activeNoteUpdatedAt: null,
  content: '',
  isLegacyMarkdown: false,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isProcessing: false,
  error: null,
  notice: null,

  enterNotesView: async () => {
    if (enterNotesViewPromise) {
      await enterNotesViewPromise;
      return;
    }

    enterNotesViewPromise = (async () => {
      if (get().isLoading) {
        return;
      }

      const stateBeforeEnter = get();
      let activeNotes = get().activeNotes;
      try {
        const { active, archived } = await getUntask().notes.list();
        set((state) => {
          const selectedStillExists =
            state.selectedListNoteId !== null
            && active.some((note) => note.id === state.selectedListNoteId);

          return {
            activeNotes: active,
            archivedNotes: archived,
            selectedListNoteId: selectedStillExists ? state.selectedListNoteId : (active[0]?.id ?? null),
            isListLoading: false,
            error: null,
          };
        });
        activeNotes = active;
      } catch (error) {
        set({ error: toErrorMessage(error, 'Notes operation failed.') });
        return;
      }

      if (activeNotes.length === 0) {
        await get().createNote();
        return;
      }

      const state = get();
      if (
        stateBeforeEnter.subView === 'list'
        && stateBeforeEnter.activeNoteId === null
        && stateBeforeEnter.activeNotes.length > 0
      ) {
        set({
          ...NOTES_LIST_RESET_STATE,
          selectedListNoteId: stateBeforeEnter.selectedListNoteId ?? activeNotes[0]?.id ?? null,
          error: null,
        });
        await persistSubView('list');
        return;
      }

      const activeId = state.activeNoteId;
      if (activeId && activeNotes.some((note) => note.id === activeId)) {
        set({
          subView: 'editor',
          layoutMode: editorLayout(),
          selectedListNoteId: activeId,
          error: null,
        });
        await persistLastOpenedNoteId(activeId);
        await persistSubView('editor');
        return;
      }

      const persistedLastOpenedId = await readPersistedLastOpenedNoteId();
      const target = persistedLastOpenedId
        ? activeNotes.find((note) => note.id === persistedLastOpenedId)
        : null;

      const persistedSubView = await readPersistedSubView();
      if (persistedSubView === 'list') {
        set({
          ...NOTES_LIST_RESET_STATE,
          selectedListNoteId:
            stateBeforeEnter.selectedListNoteId ?? target?.id ?? activeNotes[0]?.id ?? null,
          error: null,
        });
        return;
      }

      if (target) {
        await get().openNote(target.id);
        return;
      }

      if (persistedLastOpenedId) {
        await persistLastOpenedNoteId(null);
      }

      await get().openNote(activeNotes[0].id);
    })();

    try {
      await enterNotesViewPromise;
    } finally {
      enterNotesViewPromise = null;
    }
  },

  loadList: async (preferredSelectedId) => {
    if (get().isListLoading) return;
    set({ isListLoading: true, error: null });
    try {
      const { active, archived } = await getUntask().notes.list();
      set((state) => {
        const preferred = preferredSelectedId ?? state.selectedListNoteId;
        const selectedStillExists =
          preferred !== null
          && active.some((note) => note.id === preferred);

        return {
          activeNotes: active,
          archivedNotes: archived,
          selectedListNoteId: selectedStillExists ? preferred : (active[0]?.id ?? null),
          isListLoading: false,
        };
      });
    } catch (error) {
      set({ isListLoading: false, error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  createNote: async () => {
    try {
      // Flush any dirty editor content first.
      const flushed = await get().flushAndSave();
      if (!flushed) {
        return;
      }

      const note = await getUntask().notes.create();
      const nextLayout = editorLayout();

      set({
        subView: 'editor',
        layoutMode: nextLayout,
        activeNoteId: note.id,
        selectedListNoteId: note.id,
        activeNoteUpdatedAt: note.updatedAt,
        content: note.content,
        isLegacyMarkdown: false,
        isDirty: false,
        error: null,
      });
      await persistLastOpenedNoteId(note.id);
      await persistSubView('editor');
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  openNote: async (id) => {
    // Flush any dirty editor content before switching.
    const flushed = await get().flushAndSave();
    if (!flushed) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const note = await getUntask().notes.get(id);
      if (!note) {
        set({ isLoading: false, error: 'Note not found.' });
        return;
      }

      const raw = note.content;
      const legacy = raw.length > 0 && !isBlockNoteJson(raw);
      const nextLayout = editorLayout();

      set({
        subView: 'editor',
        layoutMode: nextLayout,
        activeNoteId: note.id,
        selectedListNoteId: note.id,
        activeNoteUpdatedAt: note.updatedAt,
        content: raw,
        isLegacyMarkdown: legacy,
        isDirty: false,
        isLoading: false,
        error: null,
      });
      await persistLastOpenedNoteId(note.id);
      await persistSubView('editor');
    } catch (error) {
      set({ isLoading: false, error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  openSelectedNote: async () => {
    const { activeNotes, selectedListNoteId } = get();
    if (activeNotes.length === 0) {
      return false;
    }

    const targetId = selectedListNoteId ?? activeNotes[0].id;
    await get().openNote(targetId);
    return true;
  },

  openAdjacentNote: async (direction) => {
    const { activeNotes, activeNoteId, selectedListNoteId } = get();
    if (activeNotes.length === 0) {
      return false;
    }

    const baseId = activeNoteId ?? selectedListNoteId ?? activeNotes[0].id;
    const currentIndex = activeNotes.findIndex((note) => note.id === baseId);
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = clampIndex(safeCurrentIndex + direction, activeNotes.length);

    if (nextIndex === -1) {
      return false;
    }

    const target = activeNotes[nextIndex];
    if (!target || target.id === activeNoteId) {
      return false;
    }

    await get().openNote(target.id);
    return true;
  },

  backToList: async () => {
    const flushed = await get().flushAndSave();
    if (!flushed) {
      return;
    }

    set((state) => ({
      ...NOTES_LIST_RESET_STATE,
      selectedListNoteId: state.selectedListNoteId ?? state.activeNotes[0]?.id ?? null,
    }));
    await persistSubView('list');

    // Refresh list to pick up any changes.
    void get().loadList();
  },

  setContent: (content) =>
    set((state) => {
      if (state.content === content) return state;
      return { content, isDirty: true, isLegacyMarkdown: false };
    }),

  save: async () => {
    const { isDirty, content, isSaving, activeNoteId } = get();
    if (!isDirty || isSaving || !activeNoteId) {
      return true;
    }

    set({ isSaving: true, error: null });
    try {
      const saved = await getUntask().notes.save(activeNoteId, content);
      let persisted = false;
      set((state) => {
        // If content changed while saving, keep dirty.
        if (state.activeNoteId !== activeNoteId || state.content !== content) {
          return { isSaving: false, error: null };
        }

        persisted = true;
        return {
          content: saved?.content ?? content,
          isDirty: false,
          isSaving: false,
          error: null,
        };
      });
      return persisted;
    } catch (error) {
      set({ isSaving: false, error: toErrorMessage(error, 'Notes operation failed.') });
      return false;
    }
  },

  flushAndSave: async () => {
    const { isDirty, activeNoteId } = get();
    if (isDirty && activeNoteId) {
      return get().save();
    }
    return true;
  },

  archiveNote: async (id) => {
    try {
      const wasActive = get().activeNoteId === id;
      const nextSelectedId = getAdjacentActiveNoteId(get().activeNotes, id);
      await getUntask().notes.archive(id);

      // If we archived the currently open note, go back to list.
      if (wasActive) {
        set({
          ...NOTES_LIST_RESET_STATE,
          selectedListNoteId: nextSelectedId,
        });
        await persistLastOpenedNoteId(null);
        await persistSubView('list');
      } else if (get().selectedListNoteId === id) {
        set({ selectedListNoteId: nextSelectedId });
      }

      get().setNotice({ kind: 'success', message: 'Note archived.' });
      useToastStore.getState().showToast('Note archived', async () => {
        await getUntask().notes.restore(id);
        void get().loadList();
      });
      void get().loadList(nextSelectedId);
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  restoreNote: async (id) => {
    try {
      await getUntask().notes.restore(id);

      if (get().activeNoteId === id) {
        set(NOTES_LIST_RESET_STATE);
        await persistSubView('list');
      }

      get().setNotice({ kind: 'success', message: 'Note restored.' });
      void get().loadList();
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  deleteNote: async (id) => {
    try {
      const { activeNotes, archivedNotes } = get();
      const source = [...activeNotes, ...archivedNotes].find((note) => note.id === id);
      const snapshot: DeletedNoteSnapshot | null = source
        ? { content: source.content, status: source.status, isPinned: source.isPinned }
        : null;
      const nextSelectedId = getAdjacentActiveNoteId(activeNotes, id);

      await getUntask().notes.delete(id);

      if (get().activeNoteId === id) {
        set({
          ...NOTES_LIST_RESET_STATE,
          selectedListNoteId: nextSelectedId,
        });
        await persistLastOpenedNoteId(null);
        await persistSubView('list');
      } else if (get().selectedListNoteId === id) {
        set({ selectedListNoteId: nextSelectedId });
      }

      get().setNotice({ kind: 'success', message: 'Note deleted.' });
      if (snapshot) {
        useToastStore.getState().showToast('Note deleted', async () => {
          const restored = await getUntask().notes.create();
          if (snapshot.content.length > 0) {
            await getUntask().notes.save(restored.id, snapshot.content);
          }
          if (snapshot.isPinned) {
            await getUntask().notes.pin(restored.id);
          }
          if (snapshot.status === 'archived') {
            await getUntask().notes.archive(restored.id);
          }
          void get().loadList();
        });
      }
      void get().loadList(nextSelectedId);
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  pinNote: async (id) => {
    try {
      await getUntask().notes.pin(id);
      void get().loadList();
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  unpinNote: async (id) => {
    try {
      await getUntask().notes.unpin(id);
      void get().loadList();
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  duplicateNote: async (id) => {
    try {
      const duplicate = await getUntask().notes.duplicate(id);
      if (duplicate) {
        void get().loadList();
        await get().openNote(duplicate.id);
        get().setNotice({ kind: 'success', message: 'Note duplicated.' });
      }
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  copyAsMarkdown: async (id) => {
    try {
      const note = await getUntask().notes.get(id);
      if (!note) return;
      const markdown = serializeNoteForProcessing(note.content);
      await navigator.clipboard.writeText(markdown);
      get().setNotice({ kind: 'success', message: 'Copied as Markdown.' });
    } catch (error) {
      set({ error: toErrorMessage(error, 'Notes operation failed.') });
    }
  },

  processWithAI: async (markdownOverride) => {
    const {
      content,
      isDirty,
      isProcessing,
      activeNoteId,
    } = get();

    if (isProcessing || !activeNoteId) {
      return { ok: false, reason: 'save_failed' };
    }

    let promptContent = (markdownOverride?.trim() ?? serializeNoteForProcessing(content)).trim();
    if (!promptContent) {
      const message = 'Add content before sending to AI.';
      set({ error: message });
      get().setNotice({ kind: 'error', message });
      return { ok: false, reason: 'empty_note' };
    }

    set({ isProcessing: true, error: null });

    try {
      if (isDirty) {
        const persisted = await get().save();
        if (!persisted) {
          get().setNotice({ kind: 'error', message: 'Save failed before sending to AI.' });
          set({ isProcessing: false });
          return { ok: false, reason: 'save_failed' };
        }

        if (!markdownOverride) {
          promptContent = serializeNoteForProcessing(get().content).trim();
          if (!promptContent) {
            const message = 'Add content before sending to AI.';
            set({ isProcessing: false, error: message });
            get().setNotice({ kind: 'error', message });
            return { ok: false, reason: 'empty_note' };
          }
        }
      }

      // Stage note context for the next chat turn; user provides the first instruction.
      const noteTitle = deriveAutoTitle(get().content) || 'Untitled note';
      const chatStore = useChatStore.getState();
      chatStore.stageNoteContext({
        noteId: activeNoteId,
        title: noteTitle,
        markdown: promptContent,
      });
      await chatStore.createConversation();
      useAppStore.getState().openChatOverlay();
      useAppStore.getState().setChatView('conversation');

      set({ isProcessing: false });
      get().setNotice({
        kind: 'info',
        message: 'Note attached in a new chat. Tell Untask what to do next.',
      }, 5000);
      return { ok: true, reason: 'staged' };
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to send note to AI.');
      set({
        isProcessing: false,
        error: message,
      });
      get().setNotice({ kind: 'error', message });
      return { ok: false, reason: 'save_failed' };
    }
  },

  setLayoutMode: (mode) => {
    set((state) => {
      const nextMode = state.activeNoteId ? mode : 'list';

      const nextSubView: NotesSubView = nextMode === 'list' ? 'list' : 'editor';

      if (state.layoutMode === nextMode && state.subView === nextSubView) {
        return state;
      }

      return {
        layoutMode: nextMode,
        subView: nextSubView,
      };
    });
    const nextMode = get().activeNoteId ? mode : 'list';
    void persistSubView(nextMode === 'list' ? 'list' : 'editor');
  },

  setSelectedListNoteId: (id) => {
    set((state) => {
      if (state.selectedListNoteId === id) {
        return state;
      }
      return { selectedListNoteId: id };
    });
  },

  selectRelativeActive: (delta) => {
    const { activeNotes, selectedListNoteId, activeNoteId } = get();
    if (activeNotes.length === 0) {
      return null;
    }

    const baseId = selectedListNoteId ?? activeNoteId ?? activeNotes[0].id;
    const currentIndex = activeNotes.findIndex((note) => note.id === baseId);
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = clampIndex(safeCurrentIndex + delta, activeNotes.length);
    if (nextIndex === -1) {
      return null;
    }

    const nextId = activeNotes[nextIndex].id;
    set({ selectedListNoteId: nextId });
    return nextId;
  },

  setNotice: (notice, ttlMs = 3000) => {
    clearNoticeTimer();
    set({ notice });

    if (ttlMs > 0) {
      noticeTimer = setTimeout(() => {
        set({ notice: null });
        noticeTimer = null;
      }, ttlMs);
    }
  },

  clearNotice: () => {
    clearNoticeTimer();
    set({ notice: null });
  },

  clearError: () => set({ error: null }),
}));

const syncActiveNoteDraftFromState = (state: NotesStore): void => {
  setActiveNoteDraft(state.activeNoteId, state.content);
};

syncActiveNoteDraftFromState(useNotesStore.getState());
useNotesStore.subscribe((state, previousState) => {
  if (
    state.activeNoteId === previousState.activeNoteId
    && state.content === previousState.content
  ) {
    return;
  }

  syncActiveNoteDraftFromState(state);
});

// Selectors
export const selectNotesSubView = (state: NotesStore) => state.subView;
export const selectNotesLayoutMode = (state: NotesStore) => state.layoutMode;
export const selectActiveNotes = (state: NotesStore) => state.activeNotes;
export const selectArchivedNotes = (state: NotesStore) => state.archivedNotes;
export const selectSelectedListNoteId = (state: NotesStore) => state.selectedListNoteId;
export const selectActiveNoteId = (state: NotesStore) => state.activeNoteId;
export const selectActiveNoteUpdatedAt = (state: NotesStore) => state.activeNoteUpdatedAt;
export const selectNotesContent = (state: NotesStore) => state.content;
export const selectNotesIsLegacyMarkdown = (state: NotesStore) => state.isLegacyMarkdown;
export const selectNotesIsDirty = (state: NotesStore) => state.isDirty;
export const selectNotesIsLoading = (state: NotesStore) => state.isLoading;
export const selectNotesIsSaving = (state: NotesStore) => state.isSaving;
export const selectNotesIsProcessing = (state: NotesStore) => state.isProcessing;
export const selectNotesError = (state: NotesStore) => state.error;
export const selectNotesNotice = (state: NotesStore) => state.notice;
export const selectIsListLoading = (state: NotesStore) => state.isListLoading;
export const selectIsActiveNoteArchived = (state: NotesStore) =>
  state.activeNoteId != null &&
  state.archivedNotes.some((n) => n.id === state.activeNoteId);
