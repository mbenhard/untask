// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTaskSummary } from '../../../types/chat';
import { ChatTaskCard } from './ChatTaskCard';

describe('ChatTaskCard', () => {
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
  });

  const task: ChatTaskSummary = {
    id: 'task-1',
    title: 'Buy groceries',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-03-03',
    today: true,
  };

  it('renders task title', () => {
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task, onClick: vi.fn() }));
    });
    expect(container.textContent).toContain('Buy groceries');
  });

  it('renders priority label when set', () => {
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task, onClick: vi.fn() }));
    });
    expect(container.textContent).toContain('high');
  });

  it('renders status', () => {
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task, onClick: vi.fn() }));
    });
    expect(container.textContent).toContain('todo');
  });

  it('calls onClick with task id when clicked', () => {
    const onClick = vi.fn();
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task, onClick }));
    });
    const button = container.querySelector('button');
    button?.click();
    expect(onClick).toHaveBeenCalledWith('task-1');
  });

  it('hides priority when none', () => {
    const noPriority = { ...task, priority: 'none' as const };
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task: noPriority, onClick: vi.fn() }));
    });
    // Should not show "none" as a label
    expect(container.textContent).not.toContain('none');
  });

  it('shows no due date text when null', () => {
    const noDue = { ...task, dueDate: null };
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task: noDue, onClick: vi.fn() }));
    });
    // Should still render without crashing
    expect(container.textContent).toContain('Buy groceries');
  });
});
