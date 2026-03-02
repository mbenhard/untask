// @vitest-environment jsdom
import { createElement, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useAppStore } from '../stores/appStore';
import { useNotesStore } from '../stores/notesStore';
import { useSearchStore } from '../stores/searchStore';
import { useToastStore } from '../stores/toastStore';

type HarnessProps = {
  inputValue: string;
  clearInput: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
};

const HookHarness = ({ inputRef, inputValue, clearInput }: HarnessProps): null => {
  useKeyboardShortcuts({
    inputRef,
    inputValue,
    clearInput,
  });

  return null;
};

const defaultNotesActions = {
  enterNotesView: useNotesStore.getState().enterNotesView,
  processWithAI: useNotesStore.getState().processWithAI,
  archiveNote: useNotesStore.getState().archiveNote,
  permanentlyDeleteNote: useNotesStore.getState().permanentlyDeleteNote,
  openAdjacentNote: useNotesStore.getState().openAdjacentNote,
  backToList: useNotesStore.getState().backToList,
  selectRelativeActive: useNotesStore.getState().selectRelativeActive,
  openSelectedNote: useNotesStore.getState().openSelectedNote,
};

const resetStores = (): void => {
  useAppStore.setState({
    activeView: 'today',
    manualNavigationVersion: 0,
    chatOverlayState: 'peek',
    unreadProactive: false,
    newTaskTrigger: 0,
    aiEnabled: true,
  });

  useSearchStore.setState({
    isOpen: false,
    query: '',
    results: [],
    total: 0,
    isSearching: false,
    selectedIndex: 0,
    error: null,
  });

  useNotesStore.setState({
    activeNotes: [{
      id: 'note-1',
      title: 'Note',
      content: '',
      status: 'active',
      isPinned: false,
      createdAt: null,
      updatedAt: null,
    }],
    archivedNotes: [],
    isListLoading: false,
    selectedListNoteId: 'note-1',
    subView: 'list',
    layoutMode: 'list',
    activeNoteId: null,
    content: '',
    error: null,
    notice: null,
    ...defaultNotesActions,
  });

  useToastStore.setState({
    toast: null,
    isUndoing: false,
  });
};

describe('useKeyboardShortcuts', () => {
  let container: HTMLDivElement;
  let root: Root;
  let requestHide: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let undoLastUserAction: ReturnType<typeof vi.fn<() => Promise<{ ok: true; undone: false }>>>;
  let redoLastUserAction: ReturnType<typeof vi.fn<() => Promise<{ ok: true; undone: false }>>>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    resetStores();

    requestHide = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    undoLastUserAction = vi.fn<() => Promise<{ ok: true; undone: false }>>().mockResolvedValue({
      ok: true,
      undone: false,
    });
    redoLastUserAction = vi.fn<() => Promise<{ ok: true; undone: false }>>().mockResolvedValue({
      ok: true,
      undone: false,
    });
    const untaskWindow = window as unknown as {
      untask?: {
        app?: {
          requestHide?: () => Promise<void>;
        };
        tasks?: {
          undoLastUserAction?: () => Promise<{ ok: true; undone: false }>;
          redoLastUserAction?: () => Promise<{ ok: true; undone: false }>;
        };
        notes?: {
          list?: () => Promise<{ active: unknown[]; archived: unknown[] }>;
          get?: (id: string) => Promise<null>;
          create?: () => Promise<{ id: string; title: string; content: string; status: 'active'; isPinned: false; createdAt: null; updatedAt: null }>;
          save?: (id: string, content: string) => Promise<null>;
        };
        settings?: {
          get?: (key: string) => Promise<string | null>;
          set?: (key: string, value: string) => Promise<{ key: string; value: string }>;
        };
      };
    };
    untaskWindow.untask = {
      app: {
        requestHide,
      },
      tasks: {
        undoLastUserAction,
        redoLastUserAction,
      },
      notes: {
        list: vi.fn(async () => ({ active: [], archived: [] })),
        get: vi.fn(async (id: string) => {
          void id;
          return null;
        }),
        create: vi.fn(async () => ({
          id: 'note-created',
          title: '',
          content: '',
          status: 'active' as const,
          isPinned: false as const,
          createdAt: null,
          updatedAt: null,
        })),
        save: vi.fn(async (id: string, content: string) => {
          void id;
          void content;
          return null;
        }),
      },
      settings: {
        get: vi.fn(async (key: string) => {
          void key;
          return null;
        }),
        set: vi.fn(async (key: string, value: string) => ({ key, value })),
      },
    };
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    delete (window as Window & { untask?: unknown }).untask;
    vi.restoreAllMocks();
  });

  it('maps Cmd+4 to Notes view and triggers deterministic notes entry', () => {
    const enterNotesView = vi.fn(async () => undefined);
    useNotesStore.setState({
      enterNotesView: enterNotesView as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(
        createElement(HookHarness, {
          inputRef,
          inputValue: '',
          clearInput: vi.fn(),
        }),
      );
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', key: '4', metaKey: true }));
    });
    expect(useAppStore.getState().activeView).toBe('notes');
    expect(enterNotesView).toHaveBeenCalledTimes(1);
  });

  it('maps Cmd+N to trigger new task', () => {
    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(
        createElement(HookHarness, {
          inputRef,
          inputValue: '',
          clearInput: vi.fn(),
        }),
      );
    });

    const beforeTrigger = useAppStore.getState().newTaskTrigger;

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }));
    });

    expect(useAppStore.getState().newTaskTrigger).toBe(beforeTrigger + 1);
  });

  it('maps Cmd/Ctrl+K to peek -> open and open -> peek with focus changes', () => {
    const focus = vi.fn();
    const blur = vi.fn();
    const inputRef = {
      current: { focus, blur } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(
        createElement(HookHarness, {
          inputRef,
          inputValue: '',
          clearInput: vi.fn(),
        }),
      );
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    expect(useAppStore.getState().chatOverlayState).toBe('open');
    expect(focus).toHaveBeenCalledTimes(1);

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    expect(useAppStore.getState().chatOverlayState).toBe('peek');
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('ignores Cmd/Ctrl+K when AI is disabled', () => {
    useAppStore.setState({ aiEnabled: false });
    const focus = vi.fn();
    const blur = vi.fn();
    const inputRef = {
      current: { focus, blur } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(
        createElement(HookHarness, {
          inputRef,
          inputValue: '',
          clearInput: vi.fn(),
        }),
      );
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });

    expect(useAppStore.getState().chatOverlayState).toBe('peek');
    expect(focus).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
  });

  it('collapses open overlay on Escape and stops at peek', () => {
    useAppStore.setState({ chatOverlayState: 'open' });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(
        createElement(HookHarness, {
          inputRef,
          inputValue: '',
          clearInput: vi.fn(),
        }),
      );
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useAppStore.getState().chatOverlayState).toBe('peek');
    expect(requestHide).not.toHaveBeenCalled();

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(requestHide).not.toHaveBeenCalled();
  });

  it('runs Cmd/Ctrl+Enter to process the active note', () => {
    const processWithAI = vi.fn(async () => ({ ok: true, reason: 'staged' as const }));
    useAppStore.setState({ activeView: 'notes' });
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
      processWithAI: processWithAI as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    });

    expect(processWithAI).toHaveBeenCalledTimes(1);
  });

  it('ignores Cmd/Ctrl+Enter when AI is disabled', () => {
    const processWithAI = vi.fn(async () => ({ ok: true, reason: 'staged' as const }));
    useAppStore.setState({ activeView: 'notes', aiEnabled: false });
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
      processWithAI: processWithAI as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    });

    expect(processWithAI).not.toHaveBeenCalled();
  });

  it('runs Cmd/Ctrl+Backspace to archive active note', () => {
    const archiveNote = vi.fn(async () => undefined);
    useAppStore.setState({ activeView: 'notes' });
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
      archiveNote: archiveNote as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true }));
    });

    expect(archiveNote).toHaveBeenCalledWith('note-1');
  });

  it('runs Cmd/Ctrl+Backspace to archive selected list note when editor is not open', () => {
    const archiveNote = vi.fn(async () => undefined);
    useAppStore.setState({ activeView: 'notes' });
    useNotesStore.setState({
      subView: 'list',
      layoutMode: 'list',
      activeNoteId: null,
      selectedListNoteId: 'note-1',
      activeNotes: [{
        id: 'note-1',
        title: 'A',
        content: '',
        status: 'active',
        isPinned: false,
        createdAt: null,
        updatedAt: null,
      }],
      archivedNotes: [],
      archiveNote: archiveNote as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true }));
    });

    expect(archiveNote).toHaveBeenCalledWith('note-1');
  });

  it('Cmd/Ctrl+Backspace is a no-op for selected archived note from list', () => {
    const archiveNote = vi.fn(async () => undefined);
    useAppStore.setState({ activeView: 'notes' });
    useNotesStore.setState({
      subView: 'list',
      layoutMode: 'list',
      activeNoteId: null,
      selectedListNoteId: 'note-archived-1',
      activeNotes: [],
      archivedNotes: [{
        id: 'note-archived-1',
        title: 'A',
        content: '',
        status: 'archived',
        isPinned: false,
        createdAt: null,
        updatedAt: null,
      }],
      archiveNote: archiveNote as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true }));
    });

    expect(archiveNote).not.toHaveBeenCalled();
  });

  it('runs toast undo callback on Cmd+Z even when a contentEditable element is focused', () => {
    const onUndo = vi.fn(async () => undefined);
    useAppStore.setState({ activeView: 'notes' });
    useToastStore.setState({
      toast: { id: 1, label: 'Note deleted', onUndo },
      isUndoing: false,
    });

    // Simulate notes editor (contentEditable) being the active element
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.appendChild(editor);
    editor.focus();

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });

    document.body.removeChild(editor);

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().isUndoing).toBe(true);
  });

  it('does not run task undo fallback in notes view when no toast undo is available', () => {
    useAppStore.setState({ activeView: 'notes' });
    useNotesStore.setState({
      subView: 'list',
      layoutMode: 'list',
      activeNoteId: null,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    });

    expect(undoLastUserAction).not.toHaveBeenCalled();
  });

  it('runs Alt+ArrowDown to move to adjacent note', () => {
    const openAdjacentNote = vi.fn(async () => true);
    useAppStore.setState({ activeView: 'notes' });
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      activeNoteId: 'note-1',
      openAdjacentNote: openAdjacentNote as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }));
    });

    expect(openAdjacentNote).toHaveBeenCalledWith(1);
  });

  it('returns from notes editor to list on Escape', () => {
    const backToList = vi.fn(async () => undefined);
    useAppStore.setState({ activeView: 'notes', chatOverlayState: 'peek' });
    useNotesStore.setState({
      subView: 'editor',
      layoutMode: 'focus',
      backToList: backToList as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(backToList).toHaveBeenCalledTimes(1);
  });

  it('maps Cmd+1 through Cmd+3 to Today, Tasks, Inbox views', () => {
    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', metaKey: true }));
    });
    expect(useAppStore.getState().activeView).toBe('tasks');

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', key: '3', metaKey: true }));
    });
    expect(useAppStore.getState().activeView).toBe('inbox');

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', metaKey: true }));
    });
    expect(useAppStore.getState().activeView).toBe('today');
  });

  it('Cmd+Shift+Z triggers redo in tasks view', async () => {
    useAppStore.setState({ activeView: 'today', chatOverlayState: 'peek' });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    });

    await Promise.resolve();

    expect(redoLastUserAction).toHaveBeenCalledTimes(1);
    expect(undoLastUserAction).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+Z does not trigger redo in notes view', () => {
    useAppStore.setState({ activeView: 'notes', chatOverlayState: 'peek' });
    useNotesStore.setState({ subView: 'list', layoutMode: 'list', activeNoteId: null });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    });

    expect(redoLastUserAction).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+Z does not trigger redo when a text input is focused', () => {
    useAppStore.setState({ activeView: 'today', chatOverlayState: 'peek' });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    });

    document.body.removeChild(input);

    expect(redoLastUserAction).not.toHaveBeenCalled();
  });
});
