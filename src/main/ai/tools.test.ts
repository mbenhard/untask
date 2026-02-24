import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('./autonomy', () => ({
  classifyRisk: vi.fn(() => 'low'),
  requiresHardConfirmation: vi.fn(() => false),
  evaluateGate: vi.fn(() => ({ action: 'execute', reason: 'allowed' })),
  getAutonomyMode: vi.fn(() => 'auto'),
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
    undoLastAiTaskEvent: vi.fn(() => null),
    undoTaskEvent: vi.fn(() => null),
    updateTask: vi.fn(),
    updateTaskSchema: createTaskSchema.partial().extend({
      id: z.string(),
    }),
  };
});

vi.mock('../services/notesService', () => ({
  getNote: vi.fn((id: string) => ({
    id,
    title: 'Test note',
    content: '',
    status: 'active',
    isPinned: false,
    createdAt: '2026-02-16T00:00:00.000Z',
    updatedAt: '2026-02-16T00:00:00.000Z',
  })),
  saveNote: vi.fn((id: string, content: string) => ({
    id,
    title: 'Test note',
    content,
    status: 'active',
    isPinned: false,
    createdAt: '2026-02-16T00:00:00.000Z',
    updatedAt: '2026-02-16T00:01:00.000Z',
  })),
  listNotes: vi.fn(() => ({
    active: [{ id: 'note-1', title: 'Test note', content: '', status: 'active', isPinned: false, createdAt: '2026-02-16T00:00:00.000Z', updatedAt: '2026-02-16T00:00:00.000Z' }],
    archived: [],
  })),
  blockNoteToMarkdown: vi.fn((raw: string) => raw),
  getDisplayTitle: vi.fn((note: { title: string }) => note.title || 'Empty note'),
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
import * as notesService from '../services/notesService';
import * as autonomy from './autonomy';
import { executeToolCall } from './tools';

const createTaskMock = vi.mocked(taskService.createTask);
const updateTaskMock = vi.mocked(taskService.updateTask);
const completeTaskMock = vi.mocked(taskService.completeTask);
const deleteTaskMock = vi.mocked(taskService.deleteTask);
const getLastTaskEventForTaskMock = vi.mocked(taskService.getLastTaskEventForTask);
const getTaskByIdMock = vi.mocked(taskService.getTaskById);
const listTasksMock = vi.mocked(taskService.listTasks);
const getNoteMock = vi.mocked(notesService.getNote);
const saveNoteMock = vi.mocked(notesService.saveNote);
const listNotesMock = vi.mocked(notesService.listNotes);
const evaluateGateMock = vi.mocked(autonomy.evaluateGate);
const isMutationToolMock = vi.mocked(autonomy.isMutationTool);

beforeEach(() => {
  vi.clearAllMocks();
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  completeTaskMock.mockReset();
  deleteTaskMock.mockReset();
  getLastTaskEventForTaskMock.mockReset();
  getTaskByIdMock.mockReset();
  listTasksMock.mockReset();
  getNoteMock.mockReset();
  saveNoteMock.mockReset();
  listNotesMock.mockReset();
  evaluateGateMock.mockReset();
  isMutationToolMock.mockReset();
  getNoteMock.mockReturnValue({
    id: 'note-1',
    title: 'Test note',
    content: '',
    status: 'active',
    createdAt: '2026-02-16T00:00:00.000Z',
    updatedAt: '2026-02-16T00:00:00.000Z',
  } as never);
  saveNoteMock.mockImplementation((id: string, content: string) => ({
    id,
    title: 'Test note',
    content,
    status: 'active',
    createdAt: '2026-02-16T00:00:00.000Z',
    updatedAt: '2026-02-16T00:01:00.000Z',
  }) as never);
  listNotesMock.mockReturnValue({
    active: [{ id: 'note-1', title: 'Test note', content: '', status: 'active', createdAt: '2026-02-16T00:00:00.000Z', updatedAt: '2026-02-16T00:00:00.000Z' }],
    archived: [],
  } as never);
  evaluateGateMock.mockReturnValue({ action: 'execute', reason: 'allowed' } as never);
  isMutationToolMock.mockReturnValue(false);
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

  it('skips duplicate mutation calls within the same turn context', async () => {
    isMutationToolMock.mockReturnValue(true);
    createTaskMock.mockReturnValue({
      id: 'task-dup-1',
      title: 'Pupava Ice Arena (Lead)',
      status: 'active',
      today: false,
      priority: 'medium',
      dueDate: null,
      client: null,
    } as never);
    getLastTaskEventForTaskMock.mockReturnValue({ id: 'event-dup-1' } as never);

    const mutationSignatures = new Set<string>();

    const first = await executeToolCall(
      {
        name: 'create_task',
        input: {
          title: 'Pupava Ice Arena (Lead)',
          priority: 'medium',
        },
      },
      { mutationSignatures },
    );
    const second = await executeToolCall(
      {
        name: 'create_task',
        input: {
          title: 'Pupava Ice Arena (Lead)',
          priority: 'medium',
        },
      },
      { mutationSignatures },
    );

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.output.message).toContain('Skipped duplicate create_task call in the same turn.');
    }
  });
});

describe('emit_chips tool', () => {
  it('defaults responseText to the chip label for response chips', async () => {
    const result = await executeToolCall({
      name: 'emit_chips',
      input: {
        chips: [
          { label: 'Review Inbox now' },
          { label: 'Suggest daily plan', responseText: 'Please suggest a daily plan' },
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
            type: 'response',
            responseText: 'Please suggest a daily plan',
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
    } as never);
    updateTaskMock.mockReturnValue({
      id: 'task-upd-1',
      title: 'Follow up with client',
      status: 'inbox',
      today: false,
      priority: 'none',
      dueDate: null,
      client: null,
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

describe('note tools', () => {
  it('reads a note by ID', async () => {
    getNoteMock.mockReturnValue({
      id: 'note-1',
      title: 'Test note',
      content: 'Draft notes for Tuesday.',
      status: 'active',
      isPinned: false,
      createdAt: '2026-02-16T12:00:00.000Z',
      updatedAt: '2026-02-16T12:00:00.000Z',
    } as never);

    const result = await executeToolCall({
      name: 'read_note',
      input: { noteId: 'note-1' },
    });

    expect(getNoteMock).toHaveBeenCalledWith('note-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.data).toEqual({
        note: {
          id: 'note-1',
          title: 'Test note',
          content: 'Draft notes for Tuesday.',
          status: 'active',
          isPinned: false,
          createdAt: '2026-02-16T12:00:00.000Z',
          updatedAt: '2026-02-16T12:00:00.000Z',
        },
      });
    }
  });

  it('falls back to attached snapshot when note is deleted after attach', async () => {
    getNoteMock.mockReturnValue(undefined as never);

    const result = await executeToolCall(
      {
        name: 'read_note',
        input: {},
      },
      {
        activeNoteId: 'note-stale',
        attachedNoteContext: {
          noteId: 'note-stale',
          title: 'Call notes',
          markdown: '- confirm scope',
        },
      },
    );

    expect(getNoteMock).toHaveBeenCalledWith('note-stale');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.message).toContain('attached snapshot');
      expect(result.output.data).toEqual({
        note: expect.objectContaining({
          id: 'note-stale',
          title: 'Call notes',
          content: '- confirm scope',
          fromAttachedContext: true,
        }),
      });
    }
  });

  it('returns actionable error when attached note was deleted before edit', async () => {
    getNoteMock.mockReturnValue(undefined as never);

    const result = await executeToolCall(
      {
        name: 'edit_note',
        input: {
          action: 'append',
          content: 'add this',
        },
      },
      {
        activeNoteId: 'note-stale',
        attachedNoteContext: {
          noteId: 'note-stale',
          title: 'Call notes',
          markdown: '- confirm scope',
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
      expect(result.error.message).toContain('cannot apply edits');
    }
  });

  it('returns replace diff summary when editing a note', async () => {
    getNoteMock.mockReturnValue({
      id: 'note-1',
      title: 'Test note',
      content: 'One old sentence.\nAnother line.',
      status: 'active',
      isPinned: false,
      createdAt: '2026-02-16T12:00:00.000Z',
      updatedAt: '2026-02-16T12:00:00.000Z',
    } as never);

    const result = await executeToolCall({
      name: 'edit_note',
      input: {
        noteId: 'note-1',
        action: 'replace',
        target: 'One old sentence.',
        replacement: 'One improved sentence.',
      },
    });

    expect(saveNoteMock).toHaveBeenCalledWith(
      'note-1',
      'One improved sentence.\nAnother line.',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.status).toBe('success');
      expect(result.output.message).toContain('Before: "One old sentence."');
      expect(result.output.message).toContain('After: "One improved sentence."');
      expect(result.output.actionCard?.viewIntent).toBe('notes');
    }
  });
});
