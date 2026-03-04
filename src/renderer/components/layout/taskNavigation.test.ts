import { describe, expect, it, vi } from 'vitest';

import type { Task } from '../../../types/models';
import {
  findTaskForNavigation,
  resolveTaskNavigationView,
} from './taskNavigation';

const makeTask = (id: string, overrides?: Partial<Task>): Task => ({
  id,
  parentId: null,
  title: id,
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
  createdAt: '2026-02-23T00:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  ...overrides,
});

describe('taskNavigation', () => {
  it('returns in-memory task without triggering refresh', async () => {
    const tasks = [makeTask('task-1')];
    const refreshTasks = vi.fn(async () => undefined);

    const resolved = await findTaskForNavigation(
      'task-1',
      () => tasks,
      refreshTasks,
    );

    expect(resolved?.id).toBe('task-1');
    expect(refreshTasks).not.toHaveBeenCalled();
  });

  it('refreshes once when task is missing and returns refreshed match', async () => {
    let tasks: Task[] = [];
    const refreshTasks = vi.fn(async () => {
      tasks = [makeTask('task-2', { today: true })];
    });

    const resolved = await findTaskForNavigation(
      'task-2',
      () => tasks,
      refreshTasks,
    );

    expect(refreshTasks).toHaveBeenCalledTimes(1);
    expect(resolved?.id).toBe('task-2');
  });

  it('returns undefined when task is still missing after refresh', async () => {
    const refreshTasks = vi.fn(async () => undefined);

    const resolved = await findTaskForNavigation(
      'task-missing',
      () => [],
      refreshTasks,
    );

    expect(refreshTasks).toHaveBeenCalledTimes(1);
    expect(resolved).toBeUndefined();
  });

  it('resolves target view from task attributes', () => {
    expect(resolveTaskNavigationView(makeTask('a', { status: 'inbox' }))).toBe('inbox');
    expect(resolveTaskNavigationView(makeTask('b', { today: true }))).toBe('today');
    expect(resolveTaskNavigationView(makeTask('c', { status: 'active' }))).toBe('tasks');
    expect(resolveTaskNavigationView(undefined)).toBe('tasks');
  });
});
