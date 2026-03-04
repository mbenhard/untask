// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../../types/models';
import { SubtaskSection } from './SubtaskSection';

const taskStoreHarness = vi.hoisted(() => ({
  createTask: vi.fn(),
}));

vi.mock('../../stores/taskStore', () => ({
  useTaskStore: (selector: (state: { createTask: typeof taskStoreHarness.createTask }) => unknown) =>
    selector({
      createTask: taskStoreHarness.createTask,
    }),
}));

vi.mock('./TaskList', async () => {
  const React = await import('react');
  return {
    TaskList: () => React.createElement('div', { 'data-testid': 'mock-subtask-list' }),
  };
});

const createTaskModel = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  parentId: null,
  title: 'Task',
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
  ...overrides,
});

const waitForNextFrame = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('SubtaskSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderSubtaskSection = (subtasks: Task[]) => {
    flushSync(() => {
      root.render(
        createElement(SubtaskSection, {
          parentTask: createTaskModel({ id: 'parent-1', title: 'Parent task' }),
          subtasks,
          allTasks: subtasks,
        }),
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    taskStoreHarness.createTask.mockClear();
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  it('renders SUBTASKS done/total header and icon-only add button', () => {
    const subtasks = [
      createTaskModel({ id: 'sub-1', parentId: 'parent-1', status: 'done' }),
      createTaskModel({ id: 'sub-2', parentId: 'parent-1', status: 'active' }),
    ];

    renderSubtaskSection(subtasks);

    expect(container.textContent?.includes('Subtasks (1/2)')).toBe(true);
    const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add subtask"]');
    expect(addButton).not.toBeNull();
    expect(addButton?.textContent?.trim()).toBe('');
  });

  it('clicking add opens and focuses the inline subtask input', async () => {
    renderSubtaskSection([]);

    const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add subtask"]');
    expect(addButton).not.toBeNull();
    addButton?.click();
    await waitForNextFrame();

    const input = container.querySelector<HTMLInputElement>('input[placeholder="New subtask..."]');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });
});
