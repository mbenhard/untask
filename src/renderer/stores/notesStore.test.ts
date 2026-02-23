import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../types/models';
import { useAppStore } from './appStore';
import { useChatStore } from './chatStore';
import { useNotesStore } from './notesStore';

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

const getMockApi = (): MockNotesApi =>
  ((globalThis as { window?: unknown }).window as {
    untask: { notes: MockNotesApi };
  }).untask.notes;

describe('notesStore', () => {
  beforeEach(() => {
    const notes = createMockNotesApi();

    (globalThis as { window?: unknown }).window = {
      untask: {
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
    expect(useNotesStore.getState().error).toBe('Add content before processing.');
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

  it('switches split/focus layout without dropping active editor state', () => {
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      isWideViewport: false,
      activeNoteId: 'note-keep',
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
});
