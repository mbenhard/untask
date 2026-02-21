// @vitest-environment jsdom
import { createElement, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useAppStore } from '../stores/appStore';
import { useNotesStore } from '../stores/notesStore';
import { useSearchStore } from '../stores/searchStore';

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
  processWithAI: useNotesStore.getState().processWithAI,
  archiveNote: useNotesStore.getState().archiveNote,
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
    activeNoteTitle: '',
    content: '',
    error: null,
    notice: null,
    ...defaultNotesActions,
  });
};

describe('useKeyboardShortcuts', () => {
  let container: HTMLDivElement;
  let root: Root;
  let requestHide: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    resetStores();

    requestHide = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const untaskWindow = window as unknown as {
      untask?: {
        app?: {
          requestHide?: () => Promise<void>;
        };
      };
    };
    untaskWindow.untask = {
      app: {
        requestHide,
      },
    };
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    delete (window as Window & { untask?: unknown }).untask;
    vi.restoreAllMocks();
  });

  it('maps Cmd+4 to Notes view', () => {
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
});
