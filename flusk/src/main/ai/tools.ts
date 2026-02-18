import { randomUUID } from 'node:crypto';

import { tool } from 'ai';
import { z } from 'zod';

import type {
  ActionLifecycle,
  ChatActionCard,
  ChipAction,
  ChatToolStatus,
  ChatViewIntent,
} from '../../types/chat';
import { TASK_STATUS_VALUES } from '../../types/models';
import {
  classifyRisk,
  requiresHardConfirmation,
  evaluateGate,
  getAutonomyMode,
  addPendingAction,
  isMutationTool,
} from './autonomy';
import {
  completeTask,
  createTask,
  createTaskSchema,
  deleteTask,
  getLastTaskEventForTask,
  getTaskById,
  listTasks,
  undoLastAiTaskEvent,
  undoTaskEvent,
  updateTask,
  updateTaskSchema,
} from '../services/taskService';
import { TERMINAL_STATUSES, type PredefinedStatusId } from '../../types/models';
import { getNote, saveNote, listNotes, blockNoteToMarkdown } from '../services/notesService';
import {
  updateMemorySection,
} from './memory';

const todayIso = (): string => new Date().toISOString();

const summarizeTask = (task: { title: string }): string => task.title;

const normalizeForSummary = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '(empty)';
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

const resolveTaskLensViewIntent = (task: {
  today?: boolean | null;
  status?: string | null;
}): ChatViewIntent => {
  if (task.today) {
    return 'today';
  }

  if (task.status === 'inbox') {
    return 'inbox';
  }

  return 'tasks';
};

const createActionCard = (
  toolName: string,
  status: ChatToolStatus,
  title: string,
  detail: string,
  options?: {
    taskId?: string;
    taskEventId?: string;
    undoable?: boolean;
    actionId?: string;
    riskLevel?: ChatActionCard['riskLevel'];
    rationale?: string;
    lifecycle?: ActionLifecycle;
    viewIntent?: ChatViewIntent;
  },
): ChatActionCard => ({
  id: randomUUID(),
  toolName,
  status,
  title,
  detail,
  taskId: options?.taskId,
  taskEventId: options?.taskEventId,
  undoable: options?.undoable ?? false,
  createdAt: todayIso(),
  actionId: options?.actionId,
  riskLevel: options?.riskLevel,
  rationale: options?.rationale,
  lifecycle: options?.lifecycle,
  viewIntent: options?.viewIntent,
});

export type ToolExecutionEnvelope = {
  status: ChatToolStatus;
  message: string;
  data?: unknown;
  actionCard?: ChatActionCard;
};

type ToolExecutionContext = {
  toolCallId?: string;
  onActionCard?: (card: ChatActionCard) => void;
  autonomyBypass?: boolean;
  skipInternalConfirmation?: boolean;
  activeNoteId?: string;
  mutationSignatures?: Set<string>;
};

type ToolInputSchema = z.ZodTypeAny;

type ToolRegistryEntry<TName extends string, TSchema extends ToolInputSchema> = {
  name: TName;
  description: string;
  schema: TSchema;
  execute: (
    input: z.infer<TSchema>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionEnvelope>;
};

const emitActionCard = (
  context: ToolExecutionContext,
  card: ChatActionCard,
): void => {
  context.onActionCard?.(card);
};

const confirmationRequired = (
  context: ToolExecutionContext,
  toolName: string,
  title: string,
  detail: string,
  options?: {
    taskId?: string;
    taskEventId?: string;
  },
): ToolExecutionEnvelope => {
  const actionCard = createActionCard(toolName, 'confirmation_required', title, detail, {
    ...options,
    undoable: false,
  });
  emitActionCard(context, actionCard);

  return {
    status: 'confirmation_required',
    message: detail,
    actionCard,
  };
};

const successResult = (
  context: ToolExecutionContext,
  toolName: string,
  title: string,
  detail: string,
  data?: unknown,
  options?: {
    taskId?: string;
    taskEventId?: string;
    undoable?: boolean;
    viewIntent?: ChatViewIntent;
  },
): ToolExecutionEnvelope => {
  const actionCard = createActionCard(toolName, 'success', title, detail, options);
  emitActionCard(context, actionCard);

  return {
    status: 'success',
    message: detail,
    data,
    actionCard,
  };
};

const normalizeSignatureValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSignatureValue(item));
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    Object.keys(objectValue)
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => {
        normalized[key] = normalizeSignatureValue(objectValue[key]);
      });
    return normalized;
  }

  return value;
};

const buildMutationSignature = (toolName: string, input: unknown): string =>
  `${toolName}:${JSON.stringify(normalizeSignatureValue(input))}`;

const createTaskToolInputSchema = createTaskSchema.strict();
const completeTaskToolInputSchema = z.object({
  id: z.string().min(1),
  completeChildren: z.boolean().optional(),
});
const deleteTaskToolInputSchema = z.object({
  id: z.string().min(1),
  cascade: z.boolean().optional(),
});
const undoLastActionInputSchema = z.object({
  taskEventId: z.string().min(1).optional(),
});
const updateMemoryInputSchema = z.object({
  section: z.string().min(1),
  content: z.string().min(1),
  mode: z.enum(['merge', 'replace']).default('merge'),
});
const emitChipsInputSchema = z.object({
  chips: z.array(z.object({
    label: z.string().min(1).max(40),
    responseText: z.string().optional(),
  })).min(1).max(4),
});

const normalizeChipActions = (chips: Array<{ label: string; responseText?: string }>): ChipAction[] =>
  chips.map((chip) => {
    const responseText = chip.responseText?.trim().length
      ? chip.responseText.trim()
      : chip.label.trim();

    return {
      label: chip.label,
      type: 'response',
      responseText: responseText.length > 0 ? responseText : chip.label,
    };
  });
const listTasksToolInputSchema = z.object({
  id: z.string().optional().describe('Return a single task by ID (ignores other filters when set).'),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  client: z.string().optional(),
  today: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const readNoteToolInputSchema = z.object({
  noteId: z.string().optional().describe('ID of the note to read. If omitted, reads the most recent active note.'),
});
const editNoteToolInputSchema = z.intersection(
  z.object({
    noteId: z.string().optional().describe('ID of the note to edit. If omitted, edits the most recent active note.'),
  }),
  z.discriminatedUnion('action', [
    z.object({
      action: z.literal('append'),
      content: z.string().trim().min(1),
    }),
    z.object({
      action: z.literal('replace'),
      target: z.string().trim().min(1),
      replacement: z.string(),
    }),
    z.object({
      action: z.literal('rewrite'),
      content: z.string().trim().min(1),
    }),
  ]),
);

const createTaskTool = {
  name: 'create_task',
  description: 'Create a new task. Use when the user asks to add, create, or capture a task, todo, or action item. Title must be concrete and actionable (e.g., "Call Acme about invoice"). If the request is vague, ask for clarification instead. Always set priority — don\'t leave it as none. High: due today/tomorrow, money/client commitments, user said urgent/ASAP. Medium: due this week, meaningful but not time-critical. Low: no deadline, nice-to-have. If unsure, default to medium. Optional: dueDate (date "2026-02-17" or date+time "2026-02-17T14:30"), client, parentId, status, recurrence (e.g., "daily", "weekly", "monthly", "every monday", "every 2 weeks"). To create subtasks, first create the parent task, then use its returned ID as parentId. Never use placeholder IDs.',
  schema: createTaskToolInputSchema,
  execute: async (input, context) => {
    const createdTask = createTask(input, 'ai');
    const event = getLastTaskEventForTask(createdTask.id);

    return successResult(
      context,
      'create_task',
      'Task created',
      summarizeTask(createdTask),
      { task: createdTask },
      {
        taskId: createdTask.id,
        taskEventId: event?.id,
        undoable: Boolean(event?.id),
        viewIntent: resolveTaskLensViewIntent(createdTask),
      },
    );
  },
} satisfies ToolRegistryEntry<'create_task', typeof createTaskToolInputSchema>;

const updateTaskTool = {
  name: 'update_task',
  description: 'Update an existing task. Use when the user wants to change a task title, priority, due date, status, client, notes, or recurrence. Requires the task id. dueDate supports date "2026-02-17" or date+time "2026-02-17T14:30". recurrence accepts rules like "daily", "weekly", "monthly", "every monday", "every 2 weeks". Set recurrence to null to remove. High-risk changes (rewriting completed tasks) trigger confirmation. Provide only the fields that need changing.',
  schema: updateTaskSchema.strict(),
  execute: async (input, context) => {
    const before = getTaskById(input.id);

    if (!before) {
      throw new Error(`Task not found: ${input.id}`);
    }

    if (!context.skipInternalConfirmation) {
      if (before.status === 'done' || before.status === 'cancelled') {
        return confirmationRequired(
          context,
          'update_task',
          'Confirmation required',
          'Rewriting a completed task requires confirmation.',
          { taskId: before.id },
        );
      }
    }

    const updatedTask = updateTask(input, 'ai');
    const event = getLastTaskEventForTask(updatedTask.id);

    return successResult(
      context,
      'update_task',
      'Task updated',
      summarizeTask(updatedTask),
      { task: updatedTask },
      {
        taskId: updatedTask.id,
        taskEventId: event?.id,
        undoable: Boolean(event?.id),
        viewIntent: resolveTaskLensViewIntent(updatedTask),
      },
    );
  },
} satisfies ToolRegistryEntry<'update_task', ReturnType<typeof updateTaskSchema.strict>>;

const completeTaskTool = {
  name: 'complete_task',
  description: 'Mark a task as done. Use when the user says a task is finished, completed, or done. Requires the task id. If the task has active subtasks, set completeChildren=true only after explicit confirmation. Undoable via undo_last_action.',
  schema: completeTaskToolInputSchema,
  execute: async (input, context) => {
    const task = getTaskById(input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const activeChildren = listTasks({ parentId: input.id })
      .filter((child) => !TERMINAL_STATUSES.includes(child.status as PredefinedStatusId));

    if (activeChildren.length > 0 && input.completeChildren !== true) {
      return confirmationRequired(
        context,
        'complete_task',
        'Confirmation required',
        `Task "${task.title}" has ${activeChildren.length} active subtask(s). Confirm and call complete_task with completeChildren=true to complete all descendants.`,
        { taskId: task.id },
      );
    }

    if (
      input.completeChildren === true &&
      activeChildren.length > 0 &&
      !context.skipInternalConfirmation
    ) {
      return confirmationRequired(
        context,
        'complete_task',
        'Confirmation required',
        `Complete "${task.title}" and ${activeChildren.length} active subtask(s) only after explicit confirmation.`,
        { taskId: task.id },
      );
    }

    const { completed, recurredTask } = completeTask(input.id, 'ai', {
      completeChildren: input.completeChildren === true,
    });
    const event = getLastTaskEventForTask(completed.id);

    const summary = recurredTask
      ? `${summarizeTask(completed)}\nRecurring task regenerated: "${recurredTask.title}" — due ${recurredTask.dueDate ?? 'unset'}`
      : summarizeTask(completed);

    return successResult(
      context,
      'complete_task',
      recurredTask ? 'Task completed (recurring — next instance created)' : 'Task completed',
      summary,
      { task: completed, recurredTask },
      {
        taskId: completed.id,
        taskEventId: event?.id,
        undoable: Boolean(event?.id),
        viewIntent: resolveTaskLensViewIntent(completed),
      },
    );
  },
} satisfies ToolRegistryEntry<'complete_task', typeof completeTaskToolInputSchema>;

const deleteTaskTool = {
  name: 'delete_task',
  description: 'Permanently delete a task. Use only when the user explicitly asks to delete or remove a task. Always requires confirmation before execution. If deleting a parent with active subtasks, set cascade=true only after explicit confirmation. This is destructive and not undoable. Requires the task id.',
  schema: deleteTaskToolInputSchema,
  execute: async (input, context) => {
    const task = getTaskById(input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const activeChildren = listTasks({ parentId: input.id })
      .filter((child) => !TERMINAL_STATUSES.includes(child.status as PredefinedStatusId));

    if (activeChildren.length > 0 && input.cascade !== true) {
      return confirmationRequired(
        context,
        'delete_task',
        'Confirmation required',
        `Task "${task.title}" has ${activeChildren.length} active subtask(s). Confirm and call delete_task with cascade=true to delete parent and subtasks together.`,
        { taskId: task.id },
      );
    }

    if (
      input.cascade === true &&
      activeChildren.length > 0 &&
      !context.skipInternalConfirmation
    ) {
      return confirmationRequired(
        context,
        'delete_task',
        'Confirmation required',
        `Delete "${task.title}" and ${activeChildren.length} active subtask(s) only after explicit confirmation.`,
        { taskId: task.id },
      );
    }

    if (!context.skipInternalConfirmation) {
      return confirmationRequired(
        context,
        'delete_task',
        'Confirmation required',
        `Delete "${task.title}" only after explicit confirmation.`,
        { taskId: task.id },
      );
    }

    deleteTask(input.id, 'ai', { cascade: input.cascade === true });

    return successResult(
      context,
      'delete_task',
      'Task deleted',
      `Deleted "${task.title}".`,
      { taskId: task.id },
      { taskId: task.id, undoable: false },
    );
  },
} satisfies ToolRegistryEntry<'delete_task', typeof deleteTaskToolInputSchema>;


const resolveNoteId = (noteId?: string, activeNoteId?: string): string => {
  if (noteId) return noteId;
  if (activeNoteId) return activeNoteId;
  const { active } = listNotes();
  if (active.length === 0) throw new Error('No active notes found.');
  return active[0].id;
};

const readNoteTool = {
  name: 'read_note',
  description: 'Read a specific note by ID. If noteId is omitted, reads the most recent active note. Use before editing to understand current context. If note content is attached in the system prompt, use it directly — do not call read_note.',
  schema: readNoteToolInputSchema,
  execute: async (input, context) => {
    const id = resolveNoteId(input.noteId, context.activeNoteId);
    const note = getNote(id);
    if (!note) throw new Error(`Note ${id} not found.`);
    const markdown = blockNoteToMarkdown(note.content);
    const hasContent = markdown.trim().length > 0;

    return {
      status: 'success',
      message: hasContent
        ? `Loaded note "${note.title}" (${markdown.length} chars).`
        : `Note "${note.title}" is currently empty.`,
      data: { note: { ...note, content: markdown } },
    };
  },
} satisfies ToolRegistryEntry<'read_note', typeof readNoteToolInputSchema>;

const editNoteTool = {
  name: 'edit_note',
  description: 'Edit a note. If noteId is omitted, edits the most recent active note. Use action=append to add text, action=replace to update one specific section, and action=rewrite to replace the full document.',
  schema: editNoteToolInputSchema,
  execute: async (input, context) => {
    const id = resolveNoteId(input.noteId, context.activeNoteId);
    const current = getNote(id);
    if (!current) throw new Error(`Note ${id} not found.`);
    const beforeContent = current.content;

    if (input.action === 'append') {
      const separator =
        beforeContent.length === 0 || beforeContent.endsWith('\n') ? '' : '\n\n';
      const nextContent = `${beforeContent}${separator}${input.content}`;
      const saved = saveNote(id, nextContent);

      return successResult(
        context,
        'edit_note',
        'Note appended',
        `Added ${input.content.length} characters to "${current.title}".`,
        {
          before: beforeContent,
          after: nextContent,
          note: saved,
        },
        { viewIntent: 'notes' },
      );
    }

    if (input.action === 'replace') {
      const startIndex = beforeContent.indexOf(input.target);
      if (startIndex === -1) {
        throw new Error('Note replace target was not found.');
      }

      const nextContent = `${beforeContent.slice(0, startIndex)}${input.replacement}${beforeContent.slice(
        startIndex + input.target.length,
      )}`;
      const saved = saveNote(id, nextContent);

      return successResult(
        context,
        'edit_note',
        'Note section replaced',
        [
          `Updated one section in "${current.title}".`,
          `Before: "${normalizeForSummary(input.target, 72)}"`,
          `After: "${normalizeForSummary(input.replacement, 72)}"`,
        ].join(' '),
        {
          before: beforeContent,
          after: nextContent,
          diff: {
            before: input.target,
            after: input.replacement,
            startIndex,
          },
          note: saved,
        },
        { viewIntent: 'notes' },
      );
    }

    const nextContent = input.content;
    const saved = saveNote(id, nextContent);

    return successResult(
      context,
      'edit_note',
      'Note rewritten',
      `Replaced full note "${current.title}" (${beforeContent.length} -> ${nextContent.length} chars).`,
      {
        before: beforeContent,
        after: nextContent,
        note: saved,
      },
      { viewIntent: 'notes' },
    );
  },
} satisfies ToolRegistryEntry<'edit_note', typeof editNoteToolInputSchema>;

const undoLastActionTool = {
  name: 'undo_last_action',
  description: 'Undo the most recent AI task mutation, or a specific task event by id. Use when the user says "undo", "revert", or "that was wrong". Without taskEventId, reverts the latest AI-initiated change. With taskEventId, reverts that specific event. Not all events are undoable.',
  schema: undoLastActionInputSchema,
  execute: async (input, context) => {
    const undoResult = input.taskEventId
      ? undoTaskEvent(input.taskEventId, 'ai')
      : undoLastAiTaskEvent('ai');

    if (!undoResult) {
      return {
        status: 'success',
        message: 'No AI task mutation available to undo.',
        data: { undone: false },
      };
    }

    if (!undoResult.undone) {
      return {
        status: 'success',
        message: undoResult.reason ?? 'Nothing changed during undo.',
        data: undoResult,
      };
    }

    return successResult(
      context,
      'undo_last_action',
      'Last action undone',
      'Undone',
      undoResult,
      {
        taskId: undoResult.targetTaskId,
        taskEventId: undoResult.undoEventId,
        undoable: false,
      },
    );
  },
} satisfies ToolRegistryEntry<'undo_last_action', typeof undoLastActionInputSchema>;

const updateMemoryTool = {
  name: 'update_memory',
  description: "Update a section of your Memory. Adds new knowledge or replaces existing entries in the specified section. Keep entries atomic (one fact per line). If the section doesn't exist, it's created. Announce what you're saving to Marcus. If Memory exceeds 8000 tokens, you'll get a warning to consolidate.",
  schema: updateMemoryInputSchema,
  execute: async (input) => {
    try {
      const result = updateMemorySection(input.section, input.content, input.mode, 'ai');

      const response: { status: 'success'; message: string; data: Record<string, unknown> } = {
        status: 'success',
        message: `Memory section "${input.section}" updated (mode: ${input.mode}).`,
        data: { section: input.section, mode: input.mode },
      };

      if (result.tokenWarning) {
        response.message += ` Warning: ${result.tokenWarning}`;
        response.data.tokenWarning = result.tokenWarning;
      }

      return response;
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Failed to update Memory.',
      };
    }
  },
} satisfies ToolRegistryEntry<'update_memory', typeof updateMemoryInputSchema>;

const emitChipsTool = {
  name: 'emit_chips',
  description: 'Attach interactive response chips to your current message. This is the ONLY way to present tappable options — never write options as text bullets or numbered lists. Chips let Marcus answer with a tap instead of typing. Call AFTER writing your text, not instead of it. 2-4 chips when used. Only emit chips at genuine decision points, not after routine actions.',
  schema: emitChipsInputSchema,
  execute: async (input) => {
    const normalizedChips = normalizeChipActions(input.chips as Array<{ label: string; responseText?: string }>);

    // No-op execution. The renderer reads the tool call args directly.
    return {
      status: 'success',
      message: `${normalizedChips.length} chips attached.`,
      data: { chips: normalizedChips },
    };
  },
} satisfies ToolRegistryEntry<'emit_chips', typeof emitChipsInputSchema>;

const listTasksTool = {
  name: 'list_tasks',
  description: 'Search and filter the full task list, or retrieve a single task by ID. Use when you need to find a task beyond the top-15 visible in context, or when resolving a user\'s natural-language reference to a task ID. Pass id to look up one task. Accepts optional filters: status, priority, client (case-insensitive partial match), today, search (case-insensitive title substring), limit (default 20). Returns array of task summaries with IDs.',
  schema: listTasksToolInputSchema,
  execute: async (input) => {
    // Single-task lookup by ID (absorbs get_task)
    if (input.id) {
      const task = getTaskById(input.id);
      if (!task) {
        throw new Error(`Task not found: ${input.id}`);
      }

      const children = listTasks({ parentId: task.id });

      return {
        status: 'success',
        message: `Found task "${task.title}".`,
        data: {
          tasks: [{
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            client: task.client,
            dueDate: task.dueDate,
            today: task.today,
            parentId: task.parentId,
            body: task.body,
            effort: task.effort,
            recurrence: task.recurrence,
            childCount: children.length,
          }],
        },
      };
    }

    const results = listTasks({
      status: input.status,
      priority: input.priority,
      client: input.client,
      today: input.today,
      search: input.search,
      limit: input.limit,
    });

    const taskSummaries = results.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      client: task.client,
      dueDate: task.dueDate,
      today: task.today,
      parentId: task.parentId,
    }));

    return {
      status: 'success',
      message: `Found ${taskSummaries.length} task${taskSummaries.length === 1 ? '' : 's'}.`,
      data: { tasks: taskSummaries },
    };
  },
} satisfies ToolRegistryEntry<'list_tasks', typeof listTasksToolInputSchema>;

export const AI_TOOL_REGISTRY = {
  create_task: createTaskTool,
  update_task: updateTaskTool,
  complete_task: completeTaskTool,
  delete_task: deleteTaskTool,
  read_note: readNoteTool,
  edit_note: editNoteTool,
  undo_last_action: undoLastActionTool,
  update_memory: updateMemoryTool,
  emit_chips: emitChipsTool,
  list_tasks: listTasksTool,
} as const;

export type AiToolName = keyof typeof AI_TOOL_REGISTRY;

export type AiToolCall = {
  name: string;
  input: unknown;
};

export type AiToolSuccess = {
  ok: true;
  toolName: AiToolName;
  output: ToolExecutionEnvelope;
};

export type AiToolErrorCode =
  | 'UNKNOWN_TOOL'
  | 'INVALID_TOOL_INPUT'
  | 'TOOL_EXECUTION_FAILED';

export type AiToolFailure = {
  ok: false;
  toolName: string;
  error: {
    code: AiToolErrorCode;
    message: string;
    issues?: string[];
  };
};

export type AiToolExecutionResult = AiToolSuccess | AiToolFailure;

const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });

const isToolName = (value: string): value is AiToolName => value in AI_TOOL_REGISTRY;

const buildRiskHint = (
  toolName: string,
  input: Record<string, unknown>,
): { toolName: string; input: Record<string, unknown> } => {
  const hint: Record<string, unknown> = { ...input };

  if (toolName === 'update_task' && typeof input.id === 'string') {
    const before = getTaskById(input.id);
    if (before) {
      hint._beforeStatus = before.status;
    }
  }

  return { toolName, input: hint };
};

const resolveTaskTitle = (id: unknown): string => {
  if (typeof id !== 'string') return 'unknown task';
  const task = getTaskById(id);
  return task ? `"${task.title}"` : 'unknown task';
};

const buildPendingRationale = (toolName: string, input: Record<string, unknown>): string => {
  switch (toolName) {
    case 'delete_task':
      return `Delete task ${resolveTaskTitle(input.id)}.`;
    case 'update_task':
      return `Update task ${resolveTaskTitle(input.id)}.`;
    case 'complete_task':
      return `Mark task ${resolveTaskTitle(input.id)} as done.`;
    case 'create_task':
      return `Create task "${String(input.title ?? '')}".`;
    case 'edit_note': {
      const action = String(input.action ?? '');
      if (action === 'rewrite') {
        return 'Rewrite the full note content.';
      }
      if (action === 'replace') {
        const before = normalizeForSummary(String(input.target ?? ''), 48);
        const after = normalizeForSummary(String(input.replacement ?? ''), 48);
        return `Replace note section "${before}" with "${after}".`;
      }
      return 'Append content to note.';
    }
    default:
      return `Execute ${toolName}.`;
  }
};

export const executeToolCall = async (
  call: AiToolCall,
  context: ToolExecutionContext = {},
): Promise<AiToolExecutionResult> => {
  const rawToolName = call.name.trim();

  if (!isToolName(rawToolName)) {
    return {
      ok: false,
      toolName: rawToolName,
      error: {
        code: 'UNKNOWN_TOOL',
        message: `Unknown tool: ${rawToolName}`,
      },
    };
  }

  const definition = AI_TOOL_REGISTRY[rawToolName] as ToolRegistryEntry<
    AiToolName,
    ToolInputSchema
  >;
  const parsed = definition.schema.safeParse(call.input);

  if (!parsed.success) {
    return {
      ok: false,
      toolName: rawToolName,
      error: {
        code: 'INVALID_TOOL_INPUT',
        message: `Invalid payload for ${rawToolName}.`,
        issues: formatZodIssues(parsed.error),
      },
    };
  }

  const mutationCall = isMutationTool(rawToolName);
  const mutationSignature = mutationCall
    ? buildMutationSignature(rawToolName, parsed.data)
    : null;

  if (
    mutationCall &&
    mutationSignature &&
    context.mutationSignatures?.has(mutationSignature)
  ) {
    return {
      ok: true,
      toolName: rawToolName,
      output: {
        status: 'success',
        message: `Skipped duplicate ${rawToolName} call in the same turn.`,
      },
    };
  }

  // ─── Autonomy gate ─────────────────────────────────────
  let gateApproved = false;
  if (!context.autonomyBypass && mutationCall) {
    const hint = buildRiskHint(rawToolName, parsed.data as Record<string, unknown>);
    const risk = classifyRisk(hint);
    const hardOverride = requiresHardConfirmation(hint);
    const mode = getAutonomyMode();
    const gate = evaluateGate(mode, risk, hardOverride);

    if (gate.action === 'pending') {
      const rationale = buildPendingRationale(rawToolName, parsed.data as Record<string, unknown>);
      const pending = addPendingAction(
        rawToolName,
        parsed.data,
        risk,
        rationale,
        hardOverride,
      );

      const actionCard = createActionCard(
        rawToolName,
        'confirmation_required',
        'Approval required',
        rationale,
        {
          actionId: pending.actionId,
          riskLevel: risk,
          rationale: gate.reason,
          lifecycle: 'pending',
        },
      );
      emitActionCard(context, actionCard);
      if (mutationSignature) {
        context.mutationSignatures?.add(mutationSignature);
      }

      return {
        ok: true,
        toolName: rawToolName,
        output: {
          status: 'confirmation_required',
          message: rationale,
          actionCard,
        },
      };
    }

    gateApproved = true;
  }

  // ─── Execute tool ──────────────────────────────────────
  const execContext: ToolExecutionContext = context.autonomyBypass || gateApproved
    ? { ...context, skipInternalConfirmation: true }
    : context;

  try {
    const output = await definition.execute(parsed.data, execContext);
    if (mutationSignature) {
      context.mutationSignatures?.add(mutationSignature);
    }

    return {
      ok: true,
      toolName: rawToolName,
      output,
    };
  } catch (error) {
    return {
      ok: false,
      toolName: rawToolName,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message:
          error instanceof Error
            ? error.message
            : `Tool ${rawToolName} failed unexpectedly.`,
      },
    };
  }
};

export const PROACTIVE_ALLOWED_TOOLS: ReadonlySet<AiToolName> = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'list_tasks',
  'emit_chips',
]);

export const createSdkTools = (
  context: ToolExecutionContext = {},
  allowedTools?: ReadonlySet<AiToolName>,
) => {
  const tools: Record<string, unknown> = {};

  (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).filter(
    (name) => !allowedTools || allowedTools.has(name),
  ).forEach((toolName) => {
    const definition = AI_TOOL_REGISTRY[toolName] as ToolRegistryEntry<
      AiToolName,
      ToolInputSchema
    >;

    tools[toolName] = tool({
      description: definition.description,
      inputSchema: definition.schema,
      execute: async (input: unknown, options: { toolCallId: string }) => {
        const result = await executeToolCall(
          { name: toolName, input },
          { ...context, toolCallId: options.toolCallId },
        );

        if (result.ok) {
          return result.output;
        }

        return {
          status: 'error' as const,
          message: `${result.error.message} — Do not retry this tool. Tell the user what happened.`,
        };
      },
    });
  });

  return tools as Record<AiToolName, unknown>;
};

export const getToolDefinitions = (): {
  name: AiToolName;
  description: string;
  inputSchema: ToolInputSchema;
}[] =>
  (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).map((toolName) => {
    const definition = AI_TOOL_REGISTRY[toolName];

    return {
      name: toolName,
      description: definition.description,
      inputSchema: definition.schema,
    };
  });
