import { describe, expect, it } from 'vitest';
import type { PersistedChatToolMetadata } from '../../../types/chat';
import { parseToolMetadata, reconstructStepsFromMetadata } from './chatStoreTypes';

const taskResults = [
  {
    id: 'task-1',
    title: 'Buy groceries',
    status: 'active',
    priority: 'high',
    dueDate: '2026-03-03',
    today: true,
    client: null,
  },
  {
    id: 'task-2',
    title: 'Fix login bug',
    status: 'in_progress',
    priority: 'medium',
    dueDate: null,
    today: false,
    client: 'Acme',
  },
] as const;

describe('reconstructStepsFromMetadata', () => {
  it('uses stepOrder when present to preserve tool/task/text order', () => {
    const metadata: PersistedChatToolMetadata = {
      requestId: 'req-1',
      modelId: 'claude-sonnet',
      actionCards: [],
      reasoningText: 'Thinking...',
      stepOrder: ['thinking', 'tool:0', 'task_results:0', 'text'],
      toolExecutions: [
        {
          toolName: 'list_tasks',
          toolCallId: 'tc-1',
          status: 'success',
          message: 'Found 2 tasks',
          taskResults: [...taskResults],
        },
      ],
    };

    const steps = reconstructStepsFromMetadata(metadata, 'Here are your tasks.');

    expect(steps).toHaveLength(4);
    expect(steps[0].kind).toBe('thinking');
    expect(steps[1].kind).toBe('tool');
    expect(steps[2].kind).toBe('task_results');
    expect(steps[3].kind).toBe('text');
  });

  it('falls back to legacy order when stepOrder is absent', () => {
    const metadata: PersistedChatToolMetadata = {
      requestId: 'req-2',
      modelId: 'claude-sonnet',
      actionCards: [],
      toolExecutions: [
        {
          toolName: 'list_tasks',
          toolCallId: 'tc-1',
          status: 'success',
          message: 'Found 2 tasks',
          taskResults: [...taskResults],
        },
      ],
    };

    const steps = reconstructStepsFromMetadata(metadata, 'Here are your tasks:');

    expect(steps).toHaveLength(3);
    expect(steps[0].kind).toBe('text');
    expect(steps[1].kind).toBe('tool');
    expect(steps[2].kind).toBe('task_results');
  });
});

describe('parseToolMetadata', () => {
  it('passes through stepOrder when present', () => {
    const raw = JSON.stringify({
      requestId: 'req-3',
      modelId: 'claude-sonnet',
      actionCards: [],
      toolExecutions: [],
      stepOrder: ['thinking', 'tool:0', 'text'],
    });

    const parsed = parseToolMetadata(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.stepOrder).toEqual(['thinking', 'tool:0', 'text']);
  });
});
