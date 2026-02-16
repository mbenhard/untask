import { describe, expect, it } from 'vitest';

import type { AssistantLiveContext } from '../../types/assistant';
import type { Task } from '../../types/models';
import { evaluateProactiveTriggers } from './proactiveTriggers';

let idCounter = 0;

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: overrides.id ?? `task-${++idCounter}`,
  parentId: null,
  title: overrides.title ?? 'Task',
  body: null,
  status: overrides.status ?? 'active',
  priority: overrides.priority ?? 'none',
  today: overrides.today ?? false,
  client: overrides.client ?? null,
  dueDate: overrides.dueDate ?? null,
  dueType: null,
  effort: 'unknown',
  invoiceStatus: null,
  valueAtRisk: overrides.valueAtRisk ?? null,
  lastClientTouchAt: overrides.lastClientTouchAt ?? null,
  recurrence: null,
  recurrenceSourceId: null,
  order: 0,
  createdAt: new Date().toISOString(),
  completedAt: null,
});

const makeContext = (tasks: Task[]): AssistantLiveContext => ({
  tasks,
  inboxCount: tasks.filter((t) => t.status === 'inbox').length,
  now: '2026-02-16T12:00:00.000Z',
  timezone: 'UTC',
});

describe('evaluateProactiveTriggers', () => {
  it('prioritizes overdue accumulation for high overdue risk', () => {
    const now = Date.parse('2026-02-16T12:00:00.000Z');
    const tasks = [
      makeTask({ dueDate: new Date(now - 24 * 60 * 60 * 1000).toISOString(), valueAtRisk: 1000 }),
      makeTask({ dueDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), valueAtRisk: 800 }),
      makeTask({ dueDate: new Date(now + 12 * 60 * 60 * 1000).toISOString() }),
    ];

    const triggers = evaluateProactiveTriggers({
      liveContext: makeContext(tasks),
      now: '2026-02-16T12:00:00.000Z',
      timezone: 'UTC',
    });

    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0]?.trigger).toBe('overdue_accumulation');
  });

  it('emits empty_today_list when active tasks exist but no today tasks', () => {
    const tasks = [
      makeTask({ title: 'Backlog item', today: false, status: 'active' }),
      makeTask({ title: 'Another backlog item', today: false, status: 'inbox' }),
    ];

    const triggers = evaluateProactiveTriggers({
      liveContext: makeContext(tasks),
      now: '2026-02-16T12:00:00.000Z',
      timezone: 'UTC',
    });

    expect(triggers.some((entry) => entry.trigger === 'empty_today_list')).toBe(true);
  });
});
