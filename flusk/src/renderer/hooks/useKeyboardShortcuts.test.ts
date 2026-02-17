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
    const fluskWindow = window as unknown as {
      flusk?: {
        app?: {
          requestHide?: () => Promise<void>;
        };
      };
    };
    fluskWindow.flusk = {
      app: {
        requestHide,
      },
    };
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    delete (window as Window & { flusk?: unknown }).flusk;
    vi.restoreAllMocks();
  });

  it('maps key 4 to peek -> open and open -> peek', () => {
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
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    });
    expect(useAppStore.getState().chatOverlayState).toBe('open');

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    });
    expect(useAppStore.getState().chatOverlayState).toBe('peek');
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

  it('runs Cmd/Ctrl+Shift+A to archive active note', () => {
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
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, shiftKey: true }));
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

  it('navigates notes list with j/k and Enter', () => {
    const selectRelativeActive = vi.fn(() => 'note-1');
    const openSelectedNote = vi.fn(async () => true);

    useAppStore.setState({ activeView: 'notes', chatOverlayState: 'peek' });
    useNotesStore.setState({
      subView: 'list',
      layoutMode: 'list',
      selectRelativeActive: selectRelativeActive as never,
      openSelectedNote: openSelectedNote as never,
    });

    const inputRef = {
      current: { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement,
    };

    flushSync(() => {
      root.render(createElement(HookHarness, { inputRef, inputValue: '', clearInput: vi.fn() }));
    });

    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(selectRelativeActive).toHaveBeenNthCalledWith(1, 1);
    expect(selectRelativeActive).toHaveBeenNthCalledWith(2, -1);
    expect(openSelectedNote).toHaveBeenCalledTimes(1);
  });
});
