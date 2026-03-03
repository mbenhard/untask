// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTaskSummary } from '../../../types/chat';
import { PRIORITY_DOT } from '../../lib/taskConstants';
import { ChatTaskCard, ChatTaskResults } from './ChatTaskCard';

describe('ChatTaskCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  const makeTask = (overrides: Partial<ChatTaskSummary> = {}): ChatTaskSummary => ({
    id: 'task-1',
    title: 'Buy groceries',
    status: 'active',
    priority: 'high',
    dueDate: '2026-03-03',
    today: true,
    client: null,
    ...overrides,
  });

  const renderCard = (task: ChatTaskSummary, onClick = vi.fn()) => {
    flushSync(() => {
      root.render(createElement(ChatTaskCard, { task, onClick }));
    });
    return onClick;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    root.unmount();
    document.body.removeChild(container);
  });

  it('renders status labels for predefined statuses', () => {
    renderCard(makeTask({ status: 'active' }));
    expect(container.textContent).toContain('Backlog');

    renderCard(makeTask({ status: 'in_progress' }));
    expect(container.textContent).toContain('In Progress');
  });

  it('renders capitalized priority label', () => {
    renderCard(makeTask({ priority: 'high' }));
    expect(container.textContent).toContain('High');
  });

  it('uses shared task priority dot classes for low priority', () => {
    renderCard(makeTask({ priority: 'low' }));
    const dot = container.querySelector('span.rounded-full');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain(PRIORITY_DOT.low);
  });

  it('applies completed task styling for terminal statuses', () => {
    renderCard(makeTask({ title: 'Ship invoice', status: 'done' }));

    const titleSpan = Array.from(container.querySelectorAll('span')).find(
      (element) => element.textContent === 'Ship invoice',
    );

    expect(titleSpan).not.toBeUndefined();
    expect(titleSpan?.className).toContain('line-through');
    expect(container.textContent).toContain('Done');
  });

  it('shows client when present and hides it when null', () => {
    renderCard(makeTask({ client: 'Acme Corp' }));
    expect(container.textContent).toContain('Acme Corp');

    renderCard(makeTask({ client: null }));
    expect(container.textContent).not.toContain('Acme Corp');
  });

  it('calls onClick with task id when clicked', () => {
    const onClick = renderCard(makeTask());
    const button = container.querySelector('button');
    button?.click();
    expect(onClick).toHaveBeenCalledWith('task-1');
  });

  it('hides priority label when priority is none', () => {
    renderCard(makeTask({ priority: 'none' }));
    expect(container.textContent).not.toContain('none');
    expect(container.textContent).not.toContain('None');
  });

  it('shows no due date text for malformed date values', () => {
    renderCard(makeTask({ dueDate: '2026-99-99T14:30' }));
    const dueLabel = container.querySelector('.shrink-0.text-\\[11px\\]');
    expect(dueLabel).toBeNull();
  });

  it('handles datetime dueDate format and shows relative date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T10:00:00Z'));

    renderCard(makeTask({ dueDate: '2026-03-03T14:30' }));
    expect(container.textContent).toContain('today');
  });

  it('does not render overdue date in destructive color for completed tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T10:00:00Z'));

    renderCard(makeTask({ status: 'done', dueDate: '2026-03-01' }));

    const dueLabel = container.querySelector('.shrink-0.text-\\[11px\\]');
    expect(dueLabel).not.toBeNull();
    expect(dueLabel?.textContent).toContain('overdue');
    expect(dueLabel?.className).not.toContain('text-red-400');
    expect(dueLabel?.className).toContain('text-muted-foreground/70');
  });
});

describe('ChatTaskResults', () => {
  let container: HTMLDivElement;
  let root: Root;

  const makeTask = (index: number): ChatTaskSummary => ({
    id: `task-${index}`,
    title: `Task ${index}`,
    status: 'active',
    priority: 'none',
    dueDate: null,
    today: false,
    client: null,
  });

  const renderResults = (tasks: ChatTaskSummary[], onTaskClick = vi.fn()) => {
    flushSync(() => {
      root.render(createElement(ChatTaskResults, { tasks, onTaskClick }));
    });
    return onTaskClick;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  it('returns null for empty tasks array', () => {
    renderResults([]);
    expect(container.innerHTML).toBe('');
  });

  it('truncates to first 5 tasks and shows expand button', () => {
    const tasks = Array.from({ length: 6 }, (_, index) => makeTask(index + 1));
    renderResults(tasks);

    expect(container.textContent).toContain('Task 5');
    expect(container.textContent).not.toContain('Task 6');
    expect(container.textContent).toContain('Show 1 more');
  });

  it('expands and collapses overflow tasks', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => makeTask(index + 1));
    renderResults(tasks);

    const toggle = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Show 2 more'),
    );

    expect(toggle).toBeDefined();

    flushSync(() => {
      toggle?.click();
    });

    expect(container.textContent).toContain('Task 6');
    expect(container.textContent).toContain('Task 7');
    expect(container.textContent).toContain('Show less');

    const collapseButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show less',
    );

    flushSync(() => {
      collapseButton?.click();
    });

    expect(container.textContent).toContain('Show 2 more');
    expect(container.textContent).not.toContain('Show less');
  });
});
