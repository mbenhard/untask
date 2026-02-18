// @vitest-environment jsdom
import { type KeyboardEvent, type RefObject, createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNotesListKeyboard } from './useNotesListKeyboard';

type HarnessProps = {
  noteCount: number;
  onSelectRelative: (delta: -1 | 1) => void;
  onOpenSelected: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
};

const HookHarness = ({
  noteCount,
  onSelectRelative,
  onOpenSelected,
  containerRef,
}: HarnessProps) => {
  const onKeyDown = useNotesListKeyboard({
    noteCount,
    onSelectRelative,
    onOpenSelected,
    containerRef,
  });

  return createElement('div', {
    ref: containerRef,
    tabIndex: 0,
    onKeyDown,
    'data-testid': 'container',
  });
};

describe('useNotesListKeyboard', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSelectRelative: ReturnType<typeof vi.fn>;
  let onOpenSelected: ReturnType<typeof vi.fn>;
  let containerRef: RefObject<HTMLDivElement | null>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onSelectRelative = vi.fn();
    onOpenSelected = vi.fn();
    containerRef = { current: null };
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  const render = (noteCount = 3) => {
    flushSync(() => {
      root.render(
        createElement(HookHarness, {
          noteCount,
          onSelectRelative,
          onOpenSelected,
          containerRef,
        }),
      );
    });
  };

  const dispatchKey = (key: string, opts: Partial<KeyboardEventInit> = {}) => {
    const target = container.querySelector('[data-testid="container"]')!;
    flushSync(() => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, ...opts }),
      );
    });
  };

  it('calls onSelectRelative(1) on ArrowDown', () => {
    render();
    dispatchKey('ArrowDown');
    expect(onSelectRelative).toHaveBeenCalledWith(1);
  });

  it('calls onSelectRelative(-1) on ArrowUp', () => {
    render();
    dispatchKey('ArrowUp');
    expect(onSelectRelative).toHaveBeenCalledWith(-1);
  });

  it('calls onOpenSelected on Enter', () => {
    render();
    dispatchKey('Enter');
    expect(onOpenSelected).toHaveBeenCalledTimes(1);
  });

  it('blurs container on Escape', () => {
    render();
    const target = container.querySelector('[data-testid="container"]') as HTMLDivElement;
    target.focus();
    expect(document.activeElement).toBe(target);

    dispatchKey('Escape');
    expect(document.activeElement).not.toBe(target);
  });

  it('ignores keys when noteCount is 0', () => {
    render(0);
    dispatchKey('ArrowDown');
    dispatchKey('Enter');
    expect(onSelectRelative).not.toHaveBeenCalled();
    expect(onOpenSelected).not.toHaveBeenCalled();
  });

  it('ignores keys with modifiers held', () => {
    render();
    dispatchKey('ArrowDown', { metaKey: true });
    dispatchKey('Enter', { ctrlKey: true });
    dispatchKey('ArrowUp', { altKey: true });
    expect(onSelectRelative).not.toHaveBeenCalled();
    expect(onOpenSelected).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    render();
    dispatchKey('a');
    dispatchKey('Tab');
    expect(onSelectRelative).not.toHaveBeenCalled();
    expect(onOpenSelected).not.toHaveBeenCalled();
  });
});
