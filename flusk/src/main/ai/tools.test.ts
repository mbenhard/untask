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

vi.mock('../services/scratchpadService', () => ({
  getScratchpad: vi.fn(() => ({
    id: 'main',
    content: '',
    updatedAt: '2026-02-16T00:00:00.000Z',
  })),
  saveScratchpad: vi.fn((content: string) => ({
    id: 'main',
    content,
    updatedAt: '2026-02-16T00:01:00.000Z',
  })),
}));

vi.mock('./memory', () => ({
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  getIdentity: vi.fn(() => '# Identity'),
  setIdentity: vi.fn(),
  IDENTITY_TOKEN_HARD_LIMIT: 3000,
  getMemory: vi.fn(() => ''),
  readMemorySection: vi.fn(() => ''),
  updateMemorySection: vi.fn(() => ({})),
  searchMemory: vi.fn(() => []),
}));

import * as taskService from '../services/taskService';
import * as scratchpadService from '../services/scratchpadService';
import * as autonomy from './autonomy';
import { lookup } from 'node:dns/promises';
import { extractFromHtml } from '@extractus/article-extractor';
import { executeToolCall } from './tools';

const createTaskMock = vi.mocked(taskService.createTask);
const updateTaskMock = vi.mocked(taskService.updateTask);
const completeTaskMock = vi.mocked(taskService.completeTask);
const deleteTaskMock = vi.mocked(taskService.deleteTask);
const toggleTodayMock = vi.mocked(taskService.toggleToday);
const getLastTaskEventForTaskMock = vi.mocked(taskService.getLastTaskEventForTask);
const getTaskByIdMock = vi.mocked(taskService.getTaskById);
const listTasksMock = vi.mocked(taskService.listTasks);
const getScratchpadMock = vi.mocked(scratchpadService.getScratchpad);
const saveScratchpadMock = vi.mocked(scratchpadService.saveScratchpad);
const evaluateGateMock = vi.mocked(autonomy.evaluateGate);
const isMutationToolMock = vi.mocked(autonomy.isMutationTool);
const lookupMock = vi.mocked(lookup);
const extractFromHtmlMock = vi.mocked(extractFromHtml);
const originalFetch = globalThis.fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  vi.clearAllMocks();
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  completeTaskMock.mockReset();
  deleteTaskMock.mockReset();
  toggleTodayMock.mockReset();
  getLastTaskEventForTaskMock.mockReset();
  getTaskByIdMock.mockReset();
  listTasksMock.mockReset();
  getScratchpadMock.mockReset();
  saveScratchpadMock.mockReset();
  evaluateGateMock.mockReset();
  isMutationToolMock.mockReset();
  lookupMock.mockReset();
  extractFromHtmlMock.mockReset();
  getScratchpadMock.mockReturnValue({
    id: 'main',
    content: '',
    updatedAt: '2026-02-16T00:00:00.000Z',
  } as never);
  saveScratchpadMock.mockImplementation((content: string) => ({
    id: 'main',
    content,
    updatedAt: '2026-02-16T00:01:00.000Z',
  }) as never);
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  extractFromHtmlMock.mockResolvedValue({
    title: 'Extracted title',
    content: '<p>Extracted content</p>',
  } as never);
  evaluateGateMock.mockReturnValue({ action: 'execute', reason: 'allowed' } as never);
  isMutationToolMock.mockReturnValue(false);
  globalThis.fetch = vi.fn() as typeof fetch;
});

describe('create_task tool', () => {

  it('creates a task for explicit actionable titles', async () => {
    createTaskMock.mockReturnValue({
      id: 'task-1',
      title: 'Call Acme about invoice',
      status: 'active',
      today: true,
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
      expect(result.output.actionCard?.viewIntent).toBe('today');
    }
  });
});

describe('emit_chips tool', () => {
  it('defaults responseText to the chip label for response chips', async () => {
    const result = await executeToolCall({
      name: 'emit_chips',
      input: {
        chips: [
          { label: 'Review Inbox now', type: 'response' },
          {
            label: 'Suggest daily plan',
            type: 'action',
            toolCall: { name: 'suggest_daily_plan', args: { maxTasks: 5 } },
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.data).toEqual({
        chips: [
          {
            label: 'Review Inbox now',
            type: 'response',
            responseText: 'Review Inbox now',
          },
          {
            label: 'Suggest daily plan',
            type: 'action',
            toolCall: { name: 'suggest_daily_plan', args: { maxTasks: 5 } },
          },
        ],
      });
    }
  });
});

describe('view intent mapping', () => {
  it('maps update_task to inbox view when resulting task is in inbox', async () => {
    getTaskByIdMock.mockReturnValue({
      id: 'task-upd-1',
      title: 'Follow up with client',
      status: 'active',
      today: false,
      invoiceStatus: 'none',
    } as never);
    updateTaskMock.mockReturnValue({
      id: 'task-upd-1',
      title: 'Follow up with client',
      status: 'inbox',
      today: false,
      priority: 'none',
      dueDate: null,
      client: null,
      invoiceStatus: 'none',
    } as never);
    getLastTaskEventForTaskMock.mockReturnValue({ id: 'event-upd-1' } as never);

    const result = await executeToolCall({
      name: 'update_task',
      input: {
        id: 'task-upd-1',
        title: 'Follow up with client',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.actionCard?.viewIntent).toBe('inbox');
    }
  });

  it('maps complete_task to tasks view when item is not Today or Inbox', async () => {
    getTaskByIdMock.mockReturnValue({
      id: 'task-done-1',
      title: 'Write summary',
      status: 'active',
      today: false,
      priority: 'none',
      dueDate: null,
      client: null,
      invoiceStatus: 'none',
    } as never);
    listTasksMock.mockReturnValue([] as never);
    completeTaskMock.mockReturnValue({
      completed: {
        id: 'task-done-1',
        title: 'Write summary',
        status: 'done',
        today: false,
        priority: 'none',
        dueDate: null,
        client: null,
      },
      recurredTask: null,
    } as never);
    getLastTaskEventForTaskMock.mockReturnValue({ id: 'event-done-1' } as never);

    const result = await executeToolCall({
      name: 'complete_task',
      input: { id: 'task-done-1' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.actionCard?.viewIntent).toBe('tasks');
    }
  });

  it('maps parse_notes non-inbox destination to today view', async () => {
    createTaskMock
      .mockReturnValueOnce({
        id: 'task-note-1',
        title: 'First',
        status: 'active',
        today: false,
        priority: 'none',
        dueDate: null,
        client: null,
      } as never)
      .mockReturnValueOnce({
        id: 'task-note-2',
        title: 'Second',
        status: 'active',
        today: false,
        priority: 'none',
        dueDate: null,
        client: null,
      } as never);
    getLastTaskEventForTaskMock.mockReturnValue({ id: 'event-note' } as never);

    const result = await executeToolCall({
      name: 'parse_notes',
      input: {
        text: '- First\n- Second',
        status: 'active',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.actionCard?.viewIntent).toBe('today');
    }
  });
});

describe('delete_task safety', () => {
  it('auto-executes delete_task after autonomy gate approval', async () => {
    isMutationToolMock.mockReturnValue(true);
    getTaskByIdMock.mockReturnValue({
      id: 'task-del-1',
      title: 'Archive old invoices',
      status: 'active',
      today: false,
    } as never);
    listTasksMock.mockReturnValue([] as never);

    const result = await executeToolCall({
      name: 'delete_task',
      input: { id: 'task-del-1' },
    });

    expect(deleteTaskMock).toHaveBeenCalledWith('task-del-1', 'ai', {
      cascade: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
    }
  });

  it('executes delete_task only when explicitly replayed with autonomyBypass', async () => {
    getTaskByIdMock.mockReturnValue({
      id: 'task-del-2',
      title: 'Remove stale draft',
      status: 'active',
      today: false,
    } as never);
    listTasksMock.mockReturnValue([] as never);

    const result = await executeToolCall(
      {
        name: 'delete_task',
        input: { id: 'task-del-2' },
      },
      { autonomyBypass: true },
    );

    expect(deleteTaskMock).toHaveBeenCalledWith('task-del-2', 'ai', {
      cascade: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
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

describe('scratchpad tools', () => {
  it('reads the current scratchpad content', async () => {
    getScratchpadMock.mockReturnValue({
      id: 'main',
      content: 'Draft notes for Tuesday.',
      updatedAt: '2026-02-16T12:00:00.000Z',
    } as never);

    const result = await executeToolCall({
      name: 'read_scratchpad',
      input: {},
    });

    expect(getScratchpadMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.data).toEqual({
        scratchpad: {
          id: 'main',
          content: 'Draft notes for Tuesday.',
          updatedAt: '2026-02-16T12:00:00.000Z',
        },
      });
    }
  });

  it('returns replace diff summary when editing scratchpad', async () => {
    getScratchpadMock.mockReturnValue({
      id: 'main',
      content: 'One old sentence.\nAnother line.',
      updatedAt: '2026-02-16T12:00:00.000Z',
    } as never);

    const result = await executeToolCall({
      name: 'edit_scratchpad',
      input: {
        action: 'replace',
        target: 'One old sentence.',
        replacement: 'One improved sentence.',
      },
    });

    expect(saveScratchpadMock).toHaveBeenCalledWith(
      'One improved sentence.\nAnother line.',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.message).toContain('Before: "One old sentence."');
      expect(result.output.message).toContain('After: "One improved sentence."');
      expect(result.output.actionCard?.viewIntent).toBe('scratchpad');
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
