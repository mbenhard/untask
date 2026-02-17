import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from './appStore';
import { useChatStore } from './chatStore';
import { useNotesStore } from './notesStore';

const createMockNotesApi = () => ({
  list: vi.fn(async () => ({ active: [], archived: [] })),
  get: vi.fn(async () => undefined),
  create: vi.fn(async () => ({
    id: 'note-new',
    title: 'New note',
    content: '',
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  save: vi.fn(async (_id: string, content: string, title?: string) => ({
    id: 'note-1',
    title: title ?? 'Note',
    content,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  archive: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
});

describe('notesStore', () => {
  beforeEach(() => {
    const notes = createMockNotesApi();

    (globalThis as { window?: unknown }).window = {
      flusk: {
        notes,
      },
    };

    useAppStore.setState({
      activeView: 'today',
      manualNavigationVersion: 0,
      chatOverlayState: 'peek',
      unreadProactive: false,
      newTaskTrigger: 0,
    });

    useChatStore.setState({
      pendingNoteContext: null,
    });

    useNotesStore.setState({
      activeNotes: [],
      archivedNotes: [],
      isListLoading: false,
      selectedListNoteId: null,
      subView: 'list',
      layoutMode: 'list',
      isWideViewport: false,
      activeNoteId: null,
      activeNoteTitle: '',
      content: '',
      isLegacyMarkdown: false,
      isDirty: false,
      isLoading: false,
      isSaving: false,
      isProcessing: false,
      error: null,
      notice: null,
    });
  });

  it('stages markdown note context and opens chat overlay when processing', async () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
      activeNoteTitle: 'Client call',
      content: JSON.stringify([
        {
          type: 'heading',
          props: { level: 2 },
          content: [{ type: 'text', text: 'Kickoff' }],
        },
        {
          type: 'bulletListItem',
          content: [{ type: 'text', text: 'Send recap' }],
        },
      ]),
    });

    const result = await useNotesStore.getState().processWithAI();

    expect(result).toEqual({ ok: true, reason: 'staged' });
    const noteContext = useChatStore.getState().pendingNoteContext;
    expect(noteContext?.noteId).toBe('note-1');
    expect(noteContext?.title).toBe('Client call');
    expect(noteContext?.markdown).toContain('## Kickoff');
    expect(noteContext?.markdown).toContain('- Send recap');
    expect(useAppStore.getState().chatOverlayState).toBe('open');
  });

  it('returns explicit empty-note result when processing empty content', async () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-empty',
      activeNoteTitle: 'Empty note',
      content: '',
    });

    const result = await useNotesStore.getState().processWithAI();

    expect(result).toEqual({ ok: false, reason: 'empty_note' });
    expect(useNotesStore.getState().error).toBe('Add content before processing.');
  });

  it('does not switch notes when flush save fails', async () => {
    const mockNotesApi = ((globalThis as { window?: unknown }).window as {
      flusk: { notes: ReturnType<typeof createMockNotesApi> };
    }).flusk.notes;

    mockNotesApi.save.mockRejectedValueOnce(new Error('save failed'));

    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
      activeNoteTitle: 'Draft',
      content: 'new content',
      isDirty: true,
    });

    await useNotesStore.getState().backToList();

    const state = useNotesStore.getState();
    expect(state.subView).toBe('editor');
    expect(state.activeNoteId).toBe('note-1');
    expect(state.isDirty).toBe(true);
    expect(state.error).toContain('save failed');
  });

  it('switches split/focus layout without dropping active editor state', () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      isWideViewport: false,
      activeNoteId: 'note-keep',
      activeNoteTitle: 'Keep state',
      content: 'draft-content',
      isDirty: true,
    });

    useNotesStore.getState().setViewportWidth(1280);
    let state = useNotesStore.getState();
    expect(state.layoutMode).toBe('split');
    expect(state.content).toBe('draft-content');
    expect(state.isDirty).toBe(true);

    useNotesStore.getState().setViewportWidth(900);
    state = useNotesStore.getState();
    expect(state.layoutMode).toBe('focus');
    expect(state.content).toBe('draft-content');
    expect(state.isDirty).toBe(true);
  });
});
