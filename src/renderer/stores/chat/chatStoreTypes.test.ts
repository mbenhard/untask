import { describe, expect, it } from 'vitest';
import type { PersistedChatToolMetadata } from '../../../types/chat';
import { reconstructStepsFromMetadata } from './chatStoreTypes';

describe('reconstructStepsFromMetadata', () => {
  it('reconstructs task_results steps from persisted metadata', () => {
    const metadata: PersistedChatToolMetadata = {
      requestId: 'req-1',
      modelId: 'claude-sonnet',
      actionCards: [],
      toolExecutions: [
        {
          toolName: 'list_tasks',
          toolCallId: 'tc-1',
          status: 'success',
          message: 'Found 2 tasks',
          taskResults: [
            { id: 'task-1', title: 'Buy groceries', status: 'todo', priority: 'high', dueDate: '2026-03-03', today: true },
            { id: 'task-2', title: 'Fix login bug', status: 'in_progress', priority: 'medium', dueDate: null, today: false },
          ],
        },
      ],
    };

    const steps = reconstructStepsFromMetadata(metadata, 'Here are your tasks:');

    // text + tool + task_results = 3 steps
    expect(steps).toHaveLength(3);
    expect(steps[0].kind).toBe('text');
    expect(steps[1].kind).toBe('tool');

    const taskStep = steps[2];
    expect(taskStep.kind).toBe('task_results');
    if (taskStep.kind === 'task_results') {
      expect(taskStep.tasks).toHaveLength(2);
      expect(taskStep.tasks[0].title).toBe('Buy groceries');
      expect(taskStep.tasks[1].title).toBe('Fix login bug');
    }
  });
});
