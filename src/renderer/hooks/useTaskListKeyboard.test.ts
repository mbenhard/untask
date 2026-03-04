// @vitest-environment jsdom
import { createElement, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../types/models';
import { useTaskListKeyboard } from './useTaskListKeyboard';

type HarnessProps = {
  onReady: (handler: (event: ReactKeyboardEvent<HTMLDivElement>) => void) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
};

const makeTask = (id: string): Task => ({
  id,
  parentId: null,
  title: `Task ${id}`,
  body: null,
  status: 'active',
  priority: 'none',
  today: false,
  tags: [],
  dueDate: null,
  dueType: null,
  recurrence: null,
  recurrenceSourceId: null,
  reminderOffset: null,
  order: 0,
  createdAt: null,
  completedAt: null,
  cancelledAt: null,
});

const HookHarness = ({ onReady, onDelete, onMoveUp, onMoveDown }: HarnessProps): null => {
  const onKeyDown = useTaskListKeyboard({
    tasks: [makeTask('task-1')],
    focusedIndex: 0,
    onFocusedIndexChange: vi.fn(),
    expandedTaskId: null,
    onToggleExpand: vi.fn(),
    onToggleComplete: vi.fn(),
    onToggleToday: vi.fn(),
    onCyclePriority: vi.fn(),
    onCycleStatus: vi.fn(),
    onStartTitleEdit: vi.fn(),
    onDelete,
    onMoveUp,
    onMoveDown,
    isAnyBodyEditing: false,
    isEditingTitle: false,
    isDragActive: false,
    containerRef: { current: null } as RefObject<HTMLDivElement | null>,
  });

  onReady(onKeyDown);
  return null;
};

const makeKeyEvent = (init: Partial<ReactKeyboardEvent<HTMLDivElement>>) => ({
  key: '',
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...init,
}) as unknown as ReactKeyboardEvent<HTMLDivElement>;

describe('useTaskListKeyboard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('routes Option+ArrowDown to reorder and never to delete', () => {
    const onDelete = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    let onKeyDownHandler: ((event: ReactKeyboardEvent<HTMLDivElement>) => void) | null = null;

    flushSync(() => {
      root.render(createElement(HookHarness, {
        onReady: (handler) => {
          onKeyDownHandler = handler;
        },
        onDelete,
        onMoveUp,
        onMoveDown,
      }));
    });

    expect(onKeyDownHandler).not.toBeNull();
    if (!onKeyDownHandler) {
      throw new Error('onKeyDown handler was not initialized');
    }
    const invokeOnKeyDown = onKeyDownHandler as (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    invokeOnKeyDown(makeKeyEvent({ key: 'ArrowDown', altKey: true }));

    expect(onMoveDown).toHaveBeenCalledWith('task-1');
    expect(onMoveUp).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('routes Command+Backspace to delete focused task', () => {
    const onDelete = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    let onKeyDownHandler: ((event: ReactKeyboardEvent<HTMLDivElement>) => void) | null = null;

    flushSync(() => {
      root.render(createElement(HookHarness, {
        onReady: (handler) => {
          onKeyDownHandler = handler;
        },
        onDelete,
        onMoveUp,
        onMoveDown,
      }));
    });

    expect(onKeyDownHandler).not.toBeNull();
    if (!onKeyDownHandler) {
      throw new Error('onKeyDown handler was not initialized');
    }
    const invokeOnKeyDown = onKeyDownHandler as (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    invokeOnKeyDown(makeKeyEvent({ key: 'Backspace', metaKey: true }));

    expect(onDelete).toHaveBeenCalledWith('task-1');
    expect(onMoveDown).not.toHaveBeenCalled();
    expect(onMoveUp).not.toHaveBeenCalled();
  });
});
