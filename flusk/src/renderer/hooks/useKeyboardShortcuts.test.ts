// @vitest-environment jsdom
import { createElement, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useAppStore } from '../stores/appStore';
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

const resetStores = (): void => {
  useAppStore.setState({
    activeView: 'today',
    manualNavigationVersion: 0,
    chatOverlayState: 'peek',

    newTaskTrigger: 0,
  });

  useSearchStore.setState({
    isOpen: false,
    query: '',
    activeResults: [],
    doneResults: [],
    total: 0,
    isSearching: false,
    selectedIndex: 0,
    error: null,
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

    // Peek is the minimum state — further Escape does nothing
    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(requestHide).not.toHaveBeenCalled();
  });
});
