import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../types/models';
import { useAppStore } from './appStore';
import { useChatStore } from './chatStore';
import { useNotesStore } from './notesStore';
import { useToastStore } from './toastStore';

const mockNote = (overrides?: Partial<Note>): Note => ({
  id: 'note-1',
  title: '',
  content: '',
  status: 'active',
  isPinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

type MockNotesApi = {
  list: ReturnType<typeof vi.fn<() => Promise<{ active: Note[]; archived: Note[] }>>>;
  get: ReturnType<typeof vi.fn<(id: string) => Promise<Note | undefined>>>;
  create: ReturnType<typeof vi.fn<() => Promise<Note>>>;
  save: ReturnType<typeof vi.fn<(id: string, content: string) => Promise<Note>>>;
  archive: ReturnType<typeof vi.fn<() => Promise<void>>>;
  restore: ReturnType<typeof vi.fn<() => Promise<void>>>;
  delete: ReturnType<typeof vi.fn<() => Promise<void>>>;
  pin: ReturnType<typeof vi.fn<() => Promise<void>>>;
  unpin: ReturnType<typeof vi.fn<() => Promise<void>>>;
  duplicate: ReturnType<typeof vi.fn<(id: string) => Promise<Note | undefined>>>;
};

type MockSettingsApi = {
  get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;
  set: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<{ key: string; value: string }>>>;
};

const createMockNotesApi = (): MockNotesApi => ({
  list: vi.fn(async () => ({ active: [] as Note[], archived: [] as Note[] })),
  get: vi.fn(async (id: string) => {
    void id;
    return undefined as Note | undefined;
  }),
  create: vi.fn(async () => mockNote({ id: 'note-new' })),
  save: vi.fn(async (id: string, content: string) => {
    void id;
    return mockNote({ content });
  }),
  archive: vi.fn(async () => undefined as void),
  restore: vi.fn(async () => undefined as void),
  delete: vi.fn(async () => undefined as void),
  pin: vi.fn(async () => undefined as void),
  unpin: vi.fn(async () => undefined as void),
  duplicate: vi.fn(async (id: string) => {
    void id;
    return mockNote({ id: 'note-dup' }) as Note | undefined;
  }),
});

const createMockSettingsApi = (): MockSettingsApi => ({
  get: vi.fn(async (key: string) => {
    void key;
    return null;
  }),
  set: vi.fn(async (key: string, value: string) => ({ key, value })),
});

const getMockApi = (): MockNotesApi =>
  ((globalThis as { window?: unknown }).window as {
    untask: { notes: MockNotesApi };
  }).untask.notes;

const getMockSettingsApi = (): MockSettingsApi =>
  ((globalThis as { window?: unknown }).window as {
    untask: { settings: MockSettingsApi };
  }).untask.settings;

describe('notesStore', () => {
  beforeEach(() => {
    const notes = createMockNotesApi();
    const settings = createMockSettingsApi();

    (globalThis as { window?: unknown }).window = {
      untask: {
        notes,
        settings,
      },
    };

    useAppStore.setState({
      activeView: 'today',
      manualNavigationVersion: 0,
      chatOverlayState: 'peek',
      chatView: 'threads',
      unreadProactive: false,
      newTaskTrigger: 0,
    });

    const createConversation = vi.fn(async () => undefined);
    useChatStore.setState({
      pendingNoteContext: null,
      createConversation: createConversation as never,
    });

    useNotesStore.setState({
      activeNotes: [],
      archivedNotes: [],
      isListLoading: false,
      selectedListNoteId: null,
      subView: 'list',
      layoutMode: 'list',
      activeNoteId: null,
      content: '',
      isLegacyMarkdown: false,
      isDirty: false,
      isLoading: false,
      isSaving: false,
      isProcessing: false,
      error: null,
      notice: null,
    });

    useToastStore.setState({
      toast: null,
      isUndoing: false,
    });
  });

  it('stages markdown note context and opens chat overlay when processing', async () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
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
    expect(noteContext?.title).toBe('Kickoff');
    expect(noteContext?.markdown).toContain('## Kickoff');
    expect(noteContext?.markdown).toContain('- Send recap');
    expect(useAppStore.getState().chatOverlayState).toBe('open');
    expect(useAppStore.getState().chatView).toBe('conversation');
    expect(useChatStore.getState().createConversation).toHaveBeenCalledTimes(1);
  });

  it('returns explicit empty-note result when processing empty content', async () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-empty',
      content: '',
    });

    const result = await useNotesStore.getState().processWithAI();

    expect(result).toEqual({ ok: false, reason: 'empty_note' });
    expect(useNotesStore.getState().error).toBe('Add content before sending to AI.');
  });

  it('does not switch notes when flush save fails', async () => {
    const mockNotesApi = getMockApi();
    mockNotesApi.save.mockRejectedValueOnce(new Error('save failed'));

    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
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

  it('keeps focus layout without dropping active editor state', () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-keep',
      content: 'draft-content',
      isDirty: true,
    });

    useNotesStore.getState().setLayoutMode('focus');
    let state = useNotesStore.getState();
    expect(state.layoutMode).toBe('focus');
    expect(state.content).toBe('draft-content');
    expect(state.isDirty).toBe(true);

    useNotesStore.getState().setLayoutMode('focus');
    state = useNotesStore.getState();
    expect(state.layoutMode).toBe('focus');
    expect(state.content).toBe('draft-content');
    expect(state.isDirty).toBe(true);
  });

  it('enterNotesView opens persisted last note when available', async () => {
    const api = getMockApi();
    const settings = getMockSettingsApi();
    const noteA = mockNote({ id: 'note-a' });
    const noteB = mockNote({ id: 'note-b' });

    api.list.mockResolvedValue({ active: [noteA, noteB], archived: [] });
    api.get.mockResolvedValue(noteB);
    settings.get.mockResolvedValue('note-b');

    await useNotesStore.getState().enterNotesView();

    const state = useNotesStore.getState();
    expect(state.activeNoteId).toBe('note-b');
    expect(state.layoutMode).toBe('focus');
  });

  it('enterNotesView keeps the list view when list was already loaded in-memory', async () => {
    const api = getMockApi();
    const settings = getMockSettingsApi();
    const noteA = mockNote({ id: 'note-a' });
    const noteB = mockNote({ id: 'note-b' });

    useNotesStore.setState({
      subView: 'list',
      layoutMode: 'list',
      activeNoteId: null,
      activeNotes: [noteA, noteB],
      selectedListNoteId: 'note-b',
    });

    api.list.mockResolvedValue({ active: [noteA, noteB], archived: [] });
    settings.get.mockImplementation(async (key: string) => {
      if (key === 'notes.last_opened_id') {
        return 'note-b';
      }
      if (key === 'notes.last_sub_view') {
        return 'editor';
      }
      return null;
    });

    await useNotesStore.getState().enterNotesView();

    const state = useNotesStore.getState();
    expect(state.subView).toBe('list');
    expect(state.activeNoteId).toBeNull();
    expect(state.selectedListNoteId).toBe('note-b');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('enterNotesView restores list view when persisted sub-view is list', async () => {
    const api = getMockApi();
    const settings = getMockSettingsApi();
    const noteA = mockNote({ id: 'note-a' });
    const noteB = mockNote({ id: 'note-b' });

    api.list.mockResolvedValue({ active: [noteA, noteB], archived: [] });
    settings.get.mockImplementation(async (key: string) => {
      if (key === 'notes.last_sub_view') {
        return 'list';
      }
      if (key === 'notes.last_opened_id') {
        return 'note-b';
      }
      return null;
    });

    await useNotesStore.getState().enterNotesView();

    const state = useNotesStore.getState();
    expect(state.subView).toBe('list');
    expect(state.layoutMode).toBe('list');
    expect(state.activeNoteId).toBeNull();
    expect(state.selectedListNoteId).toBe('note-b');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('enterNotesView is idempotent when called concurrently', async () => {
    const api = getMockApi();
    const settings = getMockSettingsApi();
    const noteA = mockNote({ id: 'note-a' });

    api.list.mockResolvedValue({ active: [noteA], archived: [] });
    api.get.mockResolvedValue(noteA);
    settings.get.mockResolvedValue(null);

    await Promise.all([
      useNotesStore.getState().enterNotesView(),
      useNotesStore.getState().enterNotesView(),
    ]);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('enterNotesView keeps the currently open active note when still available', async () => {
    const api = getMockApi();
    const settings = getMockSettingsApi();
    const noteA = mockNote({ id: 'note-a', content: 'a' });
    const noteB = mockNote({ id: 'note-b', content: 'b' });

    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-a',
      selectedListNoteId: 'note-a',
      content: 'draft-a',
    });

    api.list.mockResolvedValue({ active: [noteA, noteB], archived: [] });
    settings.get.mockResolvedValue('note-b');

    await useNotesStore.getState().enterNotesView();

    expect(api.get).not.toHaveBeenCalled();
    expect(useNotesStore.getState().activeNoteId).toBe('note-a');
    expect(useNotesStore.getState().selectedListNoteId).toBe('note-a');
  });

  it('enterNotesView does not override explicit note open while loading', async () => {
    const api = getMockApi();
    const noteB = mockNote({ id: 'note-b', content: 'body-b' });
    let resolveGet: ((note: Note) => void) | null = null;
    const getPromise = new Promise<Note>((resolve) => {
      resolveGet = resolve;
    });
    api.get.mockReturnValueOnce(getPromise);

    const openPromise = useNotesStore.getState().openNote('note-b');
    await Promise.resolve();

    await useNotesStore.getState().enterNotesView();

    expect(api.list).not.toHaveBeenCalled();
    expect(typeof resolveGet).toBe('function');
    const finishGet = resolveGet as (note: Note) => void;
    finishGet(noteB);

    await openPromise;
    expect(useNotesStore.getState().activeNoteId).toBe('note-b');
  });

  it('enterNotesView creates note when no active notes exist', async () => {
    const api = getMockApi();
    const settings = getMockSettingsApi();
    const created = mockNote({ id: 'note-created' });

    api.list.mockResolvedValue({ active: [], archived: [] });
    api.create.mockResolvedValue(created);
    settings.get.mockResolvedValue(null);

    await useNotesStore.getState().enterNotesView();

    const state = useNotesStore.getState();
    expect(state.activeNoteId).toBe('note-created');
    expect(state.layoutMode).toBe('focus');
    expect(settings.set).toHaveBeenCalledWith('notes.last_opened_id', 'note-created');
  });

  // ─── Pin / Unpin ──────────────────────────────────────────

  it('pinNote calls IPC and refreshes the list', async () => {
    const api = getMockApi();
    api.list.mockResolvedValue({ active: [mockNote({ isPinned: true })], archived: [] });

    await useNotesStore.getState().pinNote('note-1');

    expect(api.pin).toHaveBeenCalledWith('note-1');
    expect(api.list).toHaveBeenCalled();
  });

  it('unpinNote calls IPC and refreshes the list', async () => {
    const api = getMockApi();
    api.list.mockResolvedValue({ active: [mockNote()], archived: [] });

    await useNotesStore.getState().unpinNote('note-1');

    expect(api.unpin).toHaveBeenCalledWith('note-1');
    expect(api.list).toHaveBeenCalled();
  });

  it('pinNote sets error on IPC failure', async () => {
    const api = getMockApi();
    api.pin.mockRejectedValueOnce(new Error('pin failed'));

    await useNotesStore.getState().pinNote('note-1');

    expect(useNotesStore.getState().error).toContain('pin failed');
  });

  // ─── Duplicate ────────────────────────────────────────────

  it('duplicateNote creates copy, refreshes list, and opens the duplicate', async () => {
    const api = getMockApi();
    const dup = mockNote({ id: 'note-dup', content: 'dup content' });
    api.duplicate.mockResolvedValue(dup);
    api.get.mockResolvedValue(dup);
    api.list.mockResolvedValue({ active: [dup], archived: [] });

    await useNotesStore.getState().duplicateNote('note-1');

    expect(api.duplicate).toHaveBeenCalledWith('note-1');
    expect(api.list).toHaveBeenCalled();
    // Should have opened the duplicate note
    expect(api.get).toHaveBeenCalledWith('note-dup');
    expect(useNotesStore.getState().notice?.message).toBe('Note duplicated.');
  });

  it('duplicateNote sets error on IPC failure', async () => {
    const api = getMockApi();
    api.duplicate.mockRejectedValueOnce(new Error('dup failed'));

    await useNotesStore.getState().duplicateNote('note-1');

    expect(useNotesStore.getState().error).toContain('dup failed');
  });

  // ─── Copy as Markdown ─────────────────────────────────────

  it('copyAsMarkdown fetches note, serializes content, and copies to clipboard', async () => {
    const api = getMockApi();
    const note = mockNote({
      id: 'note-md',
      content: JSON.stringify([
        { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] },
      ]),
    });
    api.get.mockResolvedValue(note);

    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      writable: true,
      configurable: true,
    });

    await useNotesStore.getState().copyAsMarkdown('note-md');

    expect(api.get).toHaveBeenCalledWith('note-md');
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('Title');
    expect(copied).toContain('Body text');
    expect(useNotesStore.getState().notice?.message).toBe('Copied as Markdown.');
  });

  it('copyAsMarkdown sets error on failure', async () => {
    const api = getMockApi();
    api.get.mockRejectedValueOnce(new Error('fetch failed'));

    await useNotesStore.getState().copyAsMarkdown('note-1');

    expect(useNotesStore.getState().error).toContain('fetch failed');
  });

  it('archiveNote registers undo toast that restores the note', async () => {
    const api = getMockApi();
    await useNotesStore.getState().archiveNote('note-1');

    expect(api.archive).toHaveBeenCalledWith('note-1');
    const toast = useToastStore.getState().toast;
    expect(toast?.label).toBe('Note archived');
    expect(toast?.onUndo).toBeTypeOf('function');

    if (toast?.onUndo) {
      await toast.onUndo();
    }
    expect(api.restore).toHaveBeenCalledWith('note-1');
  });

  it('archiveNote keeps list selection on adjacent note when selected note is archived', async () => {
    const api = getMockApi();
    const noteA = mockNote({ id: 'note-a' });
    const noteB = mockNote({ id: 'note-b' });
    const noteC = mockNote({ id: 'note-c' });

    useNotesStore.setState({
      activeNoteId: null,
      subView: 'list',
      layoutMode: 'list',
      activeNotes: [noteA, noteB, noteC],
      selectedListNoteId: 'note-b',
    });
    api.list.mockResolvedValue({ active: [noteA, noteC], archived: [mockNote({ id: 'note-b', status: 'archived' })] });

    await useNotesStore.getState().archiveNote('note-b');

    expect(useNotesStore.getState().selectedListNoteId).toBe('note-c');
  });

  it('deleteNote keeps list selection on adjacent note when selected note is deleted', async () => {
    const api = getMockApi();
    const noteA = mockNote({ id: 'note-a' });
    const noteB = mockNote({ id: 'note-b' });
    const noteC = mockNote({ id: 'note-c' });

    useNotesStore.setState({
      activeNoteId: null,
      subView: 'list',
      layoutMode: 'list',
      activeNotes: [noteA, noteB, noteC],
      selectedListNoteId: 'note-b',
    });
    api.list.mockResolvedValue({ active: [noteA, noteC], archived: [] });

    await useNotesStore.getState().deleteNote('note-b');

    expect(useNotesStore.getState().selectedListNoteId).toBe('note-c');
  });

  it('deleteNote undo recreates a deleted archived note snapshot', async () => {
    const api = getMockApi();
    useNotesStore.setState({
      activeNotes: [],
      archivedNotes: [mockNote({
        id: 'note-archived',
        status: 'archived',
        content: 'hello',
        isPinned: true,
      })],
    });

    await useNotesStore.getState().deleteNote('note-archived');

    expect(api.delete).toHaveBeenCalledWith('note-archived');
    const toast = useToastStore.getState().toast;
    expect(toast?.label).toBe('Note deleted');
    expect(toast?.onUndo).toBeTypeOf('function');

    if (toast?.onUndo) {
      await toast.onUndo();
    }

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('note-new', 'hello');
    expect(api.pin).toHaveBeenCalledWith('note-new');
    expect(api.archive).toHaveBeenCalledWith('note-new');
  });
});
