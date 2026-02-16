import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

vi.mock('@extractus/article-extractor', () => ({
  extractFromHtml: vi.fn(async (html: string) => ({
    title: 'Extracted title',
    content: html,
  })),
}));

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
    status: z.enum(['inbox', 'active', 'in_progress', 'waiting', 'done']).optional(),
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
import { lookup } from 'node:dns/promises';
import { extractFromHtml } from '@extractus/article-extractor';
import { executeToolCall } from './tools';

const createTaskMock = vi.mocked(taskService.createTask);
const getLastTaskEventForTaskMock = vi.mocked(taskService.getLastTaskEventForTask);
const getTaskByIdMock = vi.mocked(taskService.getTaskById);
const listTasksMock = vi.mocked(taskService.listTasks);
const lookupMock = vi.mocked(lookup);
const extractFromHtmlMock = vi.mocked(extractFromHtml);
const originalFetch = globalThis.fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  vi.clearAllMocks();
  createTaskMock.mockReset();
  getLastTaskEventForTaskMock.mockReset();
  getTaskByIdMock.mockReset();
  listTasksMock.mockReset();
  lookupMock.mockReset();
  extractFromHtmlMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  extractFromHtmlMock.mockResolvedValue({
    title: 'Extracted title',
    content: '<p>Extracted content</p>',
  } as never);
  globalThis.fetch = vi.fn() as typeof fetch;
});

describe('create_task tool', () => {

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

describe('list_tasks tool', () => {
  it('returns filtered task summaries with ids', async () => {
    listTasksMock.mockReturnValue([
      {
        id: 'task-11',
        title: 'Acme invoice follow-up',
        status: 'active',
        priority: 'high',
        client: 'Acme',
        dueDate: '2026-02-20',
        today: true,
        parentId: null,
      },
    ] as never);

    const result = await executeToolCall({
      name: 'list_tasks',
      input: { client: 'acme', limit: 5 },
    });

    expect(listTasksMock).toHaveBeenCalledWith({
      status: undefined,
      priority: undefined,
      client: 'acme',
      today: undefined,
      search: undefined,
      limit: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.data).toEqual({
        tasks: [
          {
            id: 'task-11',
            title: 'Acme invoice follow-up',
            status: 'active',
            priority: 'high',
            client: 'Acme',
            dueDate: '2026-02-20',
            today: true,
            parentId: null,
          },
        ],
      });
    }
  });
});

describe('get_task tool', () => {
  it('returns full task details and subtasks', async () => {
    getTaskByIdMock.mockReturnValue({
      id: 'task-1',
      title: 'Ship weekly report',
      body: 'Use latest numbers',
      notes: null,
      status: 'active',
    } as never);
    listTasksMock.mockReturnValue([
      {
        id: 'task-1-1',
        title: 'Collect metrics',
        status: 'in_progress',
        priority: 'medium',
        today: true,
      },
    ] as never);

    const result = await executeToolCall({
      name: 'get_task',
      input: { id: 'task-1' },
    });

    expect(getTaskByIdMock).toHaveBeenCalledWith('task-1');
    expect(listTasksMock).toHaveBeenCalledWith({ parentId: 'task-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.data).toEqual({
        task: {
          id: 'task-1',
          title: 'Ship weekly report',
          body: 'Use latest numbers',
          notes: null,
          status: 'active',
        },
        subtasks: [
          {
            id: 'task-1-1',
            title: 'Collect metrics',
            status: 'in_progress',
            priority: 'medium',
            today: true,
          },
        ],
      });
    }
  });
});

describe('fetch_url tool', () => {
  it('blocks DNS-resolved private targets before fetch', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);

    const result = await executeToolCall({
      name: 'fetch_url',
      input: { url: 'https://evil.example', maxLength: 500 },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Cannot fetch private or internal URLs.');
    }
  });

  it('enforces response byte cap while streaming', async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(300_000) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(250_001) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      body: { getReader: () => reader },
      arrayBuffer: vi.fn(),
    } as unknown as Response;
    vi.mocked(globalThis.fetch).mockResolvedValue(response);

    const result = await executeToolCall({
      name: 'fetch_url',
      input: { url: 'https://example.com', maxLength: 500 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Response body exceeds 500000 byte limit.');
    }
    expect(reader.cancel).toHaveBeenCalledTimes(1);
  });
});
