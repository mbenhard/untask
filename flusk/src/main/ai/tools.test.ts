import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('./autonomy', () => ({
  classifyRisk: vi.fn(() => 'low'),
  requiresHardConfirmation: vi.fn(() => false),
  evaluateGate: vi.fn(() => ({ action: 'execute', reason: 'allowed' })),
  getAutonomyMode: vi.fn(() => 'safe'),
  addPendingAction: vi.fn(() => ({ actionId: 'pending-1' })),
  isMutationTool: vi.fn(() => false),
}));

vi.mock('../services/taskService', () => {
  const createTaskSchema = z.object({
    title: z.string().min(1),
    parentId: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    status: z.enum(['inbox', 'active', 'in_progress', 'done']).optional(),
    priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
    today: z.boolean().optional(),
    client: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    dueType: z.enum(['hard', 'soft']).nullable().optional(),
    effort: z.enum(['unknown', 'tiny', 'small', 'medium', 'deep']).optional(),
    invoiceStatus: z.enum(['none', 'draft', 'sent', 'paid', 'overdue']).nullable().optional(),
    valueAtRisk: z.number().nullable().optional(),
    lastClientTouchAt: z.string().nullable().optional(),
    order: z.number().optional(),
  });

  return {
    completeTask: vi.fn(),
    createTask: vi.fn(),
    createTaskSchema,
    deleteTask: vi.fn(),
    getLastTaskEventForTask: vi.fn(),
    getTaskById: vi.fn(() => null),
    listTasks: vi.fn(() => []),
    toggleToday: vi.fn(),
    undoLastAiTaskEvent: vi.fn(() => null),
    undoTaskEvent: vi.fn(() => null),
    updateTask: vi.fn(),
    updateTaskSchema: createTaskSchema.partial().extend({
      id: z.string(),
    }),
  };
});

vi.mock('../services/journalService', () => ({
  readJournalEntries: vi.fn(() => []),
  readJournalEntriesSchema: z.object({
    category: z.enum(['pattern', 'progress', 'preference', 'summary']).optional(),
    limit: z.number().optional(),
  }),
  writeJournalEntry: vi.fn(() => ({ id: 'journal-1' })),
  writeJournalEntrySchema: z.object({
    category: z.enum(['pattern', 'progress', 'preference', 'summary']),
    content: z.string(),
  }),
}));

vi.mock('./liveThought', () => ({
  generateLiveThought: vi.fn(() => ({
    thought: 'Focus on one high-impact task.',
    actionLabel: 'Start now',
    suggestedPrompt: 'What is the most important task?',
    generatedAt: new Date().toISOString(),
  })),
}));

vi.mock('./memory', () => ({
  appendPatternEntry: vi.fn((entry: string) => entry),
  appendProfileEntry: vi.fn((entry: string) => entry),
}));

import * as taskService from '../services/taskService';
import { assessCreateTaskTitle, executeToolCall } from './tools';

const createTaskMock = vi.mocked(taskService.createTask);
const getLastTaskEventForTaskMock = vi.mocked(taskService.getLastTaskEventForTask);

describe('assessCreateTaskTitle', () => {
  it('marks vague titles as ambiguous', () => {
    expect(assessCreateTaskTitle('for me?').ok).toBe(false);
    expect(assessCreateTaskTitle('a task').ok).toBe(false);
    expect(assessCreateTaskTitle('ok').ok).toBe(false);
  });

  it('allows concrete action-oriented titles', () => {
    expect(assessCreateTaskTitle('Call Acme about invoice')).toEqual({ ok: true });
  });
});

describe('create_task tool quality guard', () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    getLastTaskEventForTaskMock.mockReset();
  });

  it('rejects ambiguous titles before task creation', async () => {
    const result = await executeToolCall({
      name: 'create_task',
      input: {
        title: 'for me?',
      },
    });

    expect(createTaskMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('error');
      expect(result.output.message).toContain('ambiguous');
    }
  });

  it('creates a task for explicit actionable titles', async () => {
    createTaskMock.mockReturnValue({
      id: 'task-1',
      title: 'Call Acme about invoice',
      priority: 'none',
      dueDate: null,
      client: null,
    } as never);
    getLastTaskEventForTaskMock.mockReturnValue({ id: 'event-1' } as never);

    const result = await executeToolCall({
      name: 'create_task',
      input: {
        title: 'Call Acme about invoice',
      },
    });

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.message).toContain('Call Acme about invoice');
    }
  });
});
