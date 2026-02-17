import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { URL } from 'node:url';

import { tool } from 'ai';
import { extractFromHtml } from '@extractus/article-extractor';
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
  toggleToday,
  undoLastAiTaskEvent,
  undoTaskEvent,
  updateTask,
  updateTaskSchema,
} from '../services/taskService';
import {
  readJournalEntries,
  readJournalEntriesSchema,
  searchJournalEntries,
  writeJournalEntry,
  writeJournalEntrySchema,
} from '../services/journalService';
import { getNote, saveNote, listNotes, blockNoteToMarkdown } from '../services/notesService';
import {
  estimateTokens,
  getIdentity,
  setIdentity,
  IDENTITY_TOKEN_HARD_LIMIT,
  getMemory,
  setMemory,
  readMemorySection,
  updateMemorySection,
} from './memory';

const priorityScore: Record<'none' | 'low' | 'medium' | 'high', number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

const todayIso = (): string => new Date().toISOString();

const parseIso = (value: string | null | undefined): number => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const sortPlanningTasks = (
  left: ReturnType<typeof listTasks>[number],
  right: ReturnType<typeof listTasks>[number],
): number => {
  if (Boolean(left.today) !== Boolean(right.today)) {
    return left.today ? -1 : 1;
  }

  const dueDiff = parseIso(left.dueDate) - parseIso(right.dueDate);
  if (dueDiff !== 0) {
    return dueDiff;
  }

  const priorityDiff =
    priorityScore[left.priority ?? 'none'] - priorityScore[right.priority ?? 'none'];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const valueDiff = (right.valueAtRisk ?? 0) - (left.valueAtRisk ?? 0);
  if (valueDiff !== 0) {
    return valueDiff;
  }

  return left.title.localeCompare(right.title);
};

const noteLinePattern = /^\s*(?:[-*•]|\d+[.)]|\[ ?\])\s+/;

const extractTaskTitlesFromNotes = (raw: string): string[] => {
  const normalizedLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(noteLinePattern, '').trim())
    .filter((line) => line.length > 0);

  const deduped: string[] = [];
  const seen = new Set<string>();

  normalizedLines.forEach((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(line);
  });

  return deduped;
};

const summarizeTask = (task: {
  title: string;
  priority: string | null;
  dueDate: string | null;
  client: string | null;
  recurrence?: string | null;
}): string => {
  const tags = [
    task.priority ? `priority:${task.priority}` : null,
    task.client ? `client:${task.client}` : null,
    task.dueDate ? `due:${task.dueDate}` : null,
    task.recurrence ? `repeats:${task.recurrence}` : null,
  ].filter(Boolean);

  return `${task.title}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
};

const normalizeForSummary = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '(empty)';
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

const normalizeDiffLines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const summarizeLineDiff = (
  before: string,
  after: string,
): { added: string[]; removed: string[] } => {
  const beforeLines = normalizeDiffLines(before);
  const afterLines = normalizeDiffLines(after);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const added = afterLines.filter((line) => !beforeSet.has(line));
  const removed = beforeLines.filter((line) => !afterSet.has(line));

  return {
    added: added.slice(0, 3),
    removed: removed.slice(0, 3),
  };
};

const formatDiffItems = (items: string[]): string =>
  items.length > 0
    ? items.map((item) => `- ${normalizeForSummary(item, 160)}`).join('\n')
    : '- (none)';

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

const createTaskToolInputSchema = createTaskSchema.strict();
const completeTaskToolInputSchema = z.object({
  id: z.string().min(1),
  completeChildren: z.boolean().optional(),
});
const deleteTaskToolInputSchema = z.object({
  id: z.string().min(1),
  cascade: z.boolean().optional(),
});
const moveTaskToolInputSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  order: z.number().int().optional(),
});
const setTodayToolInputSchema = z.object({
  id: z.string().min(1),
  today: z.boolean().optional(),
});
const parseNotesToolInputSchema = z.object({
  text: z.string().trim().min(1),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  parentId: z.string().optional().describe('Parent task ID to create subtasks under'),
});
const suggestDailyPlanInputSchema = z.object({
  maxTasks: z.number().int().min(1).max(8).default(5),
});
const undoLastActionInputSchema = z.object({
  taskEventId: z.string().min(1).optional(),
});
const updateIdentityInputSchema = z.object({
  content: z.string().min(100).max(12000),
});
const updateMemoryInputSchema = z.object({
  section: z.string().min(1),
  content: z.string().min(1),
  mode: z.enum(['merge', 'replace']).default('merge'),
});
const searchJournalInputSchema = z.object({
  query: z.string().min(1),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
const emitChipsInputSchema = z.object({
  chips: z.array(z.object({
    label: z.string().min(1).max(40),
    type: z.enum(['action', 'response']),
    toolCall: z.object({
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
    }).optional(),
    responseText: z.string().optional(),
  })).min(1).max(4),
});

const normalizeChipActions = (chips: ChipAction[]): ChipAction[] =>
  chips.map((chip) => {
    if (chip.type !== 'response') {
      return chip;
    }

    const responseText = chip.responseText?.trim().length
      ? chip.responseText.trim()
      : chip.label.trim();

    return {
      ...chip,
      responseText: responseText.length > 0 ? responseText : chip.label,
    };
  });
const improveTaskInputSchema = z.object({
  id: z.string().min(1),
});

const listTasksToolInputSchema = z.object({
  status: z.enum(TASK_STATUS_VALUES).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  client: z.string().optional(),
  today: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const getTaskToolInputSchema = z.object({
  id: z.string().min(1),
});

const fetchUrlToolInputSchema = z.object({
  url: z.string().url(),
  maxLength: z.number().int().min(100).max(10000).default(3000),
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
  description: 'Create a new task. Use when the user asks to add, create, or capture a task, todo, or action item. Title must be concrete and actionable (e.g., "Call Acme about invoice"). If the request is vague, ask for clarification instead. Optional: priority, dueDate (date "2026-02-17" or date+time "2026-02-17T14:30"), client, parentId, status, recurrence (e.g., "daily", "weekly", "monthly", "every monday", "every 2 weeks"). To create subtasks, first create the parent task, then use its returned ID as parentId. Never use placeholder IDs.',
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
  description: 'Update an existing task. Use when the user wants to change a task title, priority, due date, status, client, notes, invoice fields, or recurrence. Requires the task id. dueDate supports date "2026-02-17" or date+time "2026-02-17T14:30". recurrence accepts rules like "daily", "weekly", "monthly", "every monday", "every 2 weeks". Set recurrence to null to remove. High-risk changes (invoice transitions, rewriting completed tasks) trigger confirmation. Provide only the fields that need changing.',
  schema: updateTaskSchema.strict(),
  execute: async (input, context) => {
    const before = getTaskById(input.id);

    if (!before) {
      throw new Error(`Task not found: ${input.id}`);
    }

    if (!context.skipInternalConfirmation) {
      const isInvoiceRisk =
        (input.invoiceStatus === 'paid' || input.invoiceStatus === 'overdue') &&
        input.invoiceStatus !== before.invoiceStatus;

      if (isInvoiceRisk) {
        return confirmationRequired(
          context,
          'update_task',
          'Confirmation required',
          'Invoice transitions to paid/overdue require confirmation.',
          { taskId: before.id },
        );
      }

      if (before.status === 'done') {
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
      .filter((child) => child.status !== 'done');

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
      .filter((child) => child.status !== 'done');

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

const moveTaskTool = {
  name: 'move_task',
  description: 'Move a task to a different parent (re-parent as subtask or promote to top-level). Use when the user wants to reorganize tasks, nest a task under a project, or extract a subtask. Requires task id and target parentId (null for top-level).',
  schema: moveTaskToolInputSchema,
  execute: async (input, context) => {
    const before = getTaskById(input.id);
    if (!before) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const moved = updateTask(
      {
        id: input.id,
        parentId: input.parentId,
        ...(typeof input.order === 'number' ? { order: input.order } : {}),
      },
      'ai',
    );

    const event = getLastTaskEventForTask(moved.id);

    return successResult(
      context,
      'move_task',
      'Task moved',
      summarizeTask(moved),
      { task: moved },
      {
        taskId: moved.id,
        taskEventId: event?.id,
        undoable: Boolean(event?.id),
      },
    );
  },
} satisfies ToolRegistryEntry<'move_task', typeof moveTaskToolInputSchema>;

const setTodayTool = {
  name: 'set_today',
  description: 'Add or remove a task from the Today focus list. Use when the user wants to focus on a task today, or remove it from today. Requires task id. Pass today=true to add, today=false to remove, or omit to toggle.',
  schema: setTodayToolInputSchema,
  execute: async (input, context) => {
    const task = getTaskById(input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const updated =
      typeof input.today === 'boolean'
        ? updateTask({ id: input.id, today: input.today }, 'ai')
        : toggleToday(input.id, 'ai');

    const event = getLastTaskEventForTask(updated.id);

    return successResult(
      context,
      'set_today',
      updated.today ? 'Task added to Today' : 'Task removed from Today',
      summarizeTask(updated),
      { task: updated },
      {
        taskId: updated.id,
        taskEventId: event?.id,
        undoable: Boolean(event?.id),
        viewIntent: 'today',
      },
    );
  },
} satisfies ToolRegistryEntry<'set_today', typeof setTodayToolInputSchema>;

const suggestDailyPlanTool = {
  name: 'suggest_daily_plan',
  description:
    'Generate a focused daily plan. Use when the user asks to plan their day, prioritize work, or figure out what to focus on. Ranks tasks by Today list membership, due date proximity, priority level, and value-at-risk. Returns up to maxTasks suggestions (default 5, max 8).',
  schema: suggestDailyPlanInputSchema,
  execute: async (input) => {
    const activeTasks = listTasks().filter((task) => task.status !== 'done');
    const planned = [...activeTasks].sort(sortPlanningTasks).slice(0, input.maxTasks);

    const suggestions = planned.map((task, index) => ({
      rank: index + 1,
      taskId: task.id,
      title: task.title,
      reason: [
        task.today ? 'already on today list' : null,
        task.dueDate ? `due ${task.dueDate}` : null,
        task.priority ? `priority ${task.priority}` : null,
        typeof task.valueAtRisk === 'number' && task.valueAtRisk > 0
          ? `$${task.valueAtRisk} at risk`
          : null,
      ]
        .filter(Boolean)
        .join(', '),
    }));

    return {
      status: 'success',
      message:
        suggestions.length > 0
          ? `Suggested ${suggestions.length} focus tasks for today.`
          : 'No active tasks available for planning.',
      data: {
        suggestions,
      },
    };
  },
} satisfies ToolRegistryEntry<'suggest_daily_plan', typeof suggestDailyPlanInputSchema>;

const parseNotesTool = {
  name: 'parse_notes',
  description: 'Parse raw text into individual tasks. Use when the user pastes notes, a list, or bullet points and wants them converted to tasks. Extracts one task per line, deduplicates, and creates them. Bulk writes above 5 tasks require confirmation. Optional: default status and priority for all created tasks.',
  schema: parseNotesToolInputSchema,
  execute: async (input, context) => {
    const titles = extractTaskTitlesFromNotes(input.text);

    if (titles.length === 0) {
      return {
        status: 'success',
        message: 'No task lines detected in the provided notes.',
        data: { created: [] },
      };
    }

    if (titles.length > 5 && !context.skipInternalConfirmation) {
      return confirmationRequired(
        context,
        'parse_notes',
        'Confirmation required',
        `Parsed ${titles.length} tasks. Bulk writes above 5 tasks require confirmation.`,
      );
    }

    const created = titles.map((title) => {
      const task = createTask(
        {
          title,
          status: input.status ?? 'inbox',
          priority: input.priority ?? 'none',
          ...(input.parentId ? { parentId: input.parentId } : {}),
        },
        'ai',
      );

      const event = getLastTaskEventForTask(task.id);
      return {
        task,
        taskEventId: event?.id,
      };
    });

    const summary = created.map(({ task }) => task.title).join(', ');
    const actionCard = createActionCard(
      'parse_notes',
      'success',
      'Tasks extracted from notes',
      `${created.length} tasks created: ${summary}`,
      {
        undoable: false,
        viewIntent:
          (input.status ?? 'inbox') === 'inbox' ? 'inbox' : 'today',
      },
    );
    emitActionCard(context, actionCard);

    return {
      status: 'success',
      message: `${created.length} tasks created from notes.`,
      data: {
        created,
      },
      actionCard,
    };
  },
} satisfies ToolRegistryEntry<'parse_notes', typeof parseNotesToolInputSchema>;

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
      `Reverted event ${undoResult.originalEventId}.`,
      undoResult,
      {
        taskId: undoResult.targetTaskId,
        taskEventId: undoResult.undoEventId,
        undoable: false,
      },
    );
  },
} satisfies ToolRegistryEntry<'undo_last_action', typeof undoLastActionInputSchema>;

const writeJournalTool = {
  name: 'write_journal',
  description: 'Write a journal entry to record observations about the user. Use to log patterns (recurring workflows), progress (task completion milestones), preferences (stated likes/dislikes), or summaries (session recaps). Entries persist across sessions and inform future context. Keep entries atomic and factual.',
  schema: writeJournalEntrySchema,
  execute: async (input) => {
    const entry = writeJournalEntry(input);

    return {
      status: 'success',
      message: 'Journal entry saved.',
      data: { entry },
    };
  },
} satisfies ToolRegistryEntry<'write_journal', typeof writeJournalEntrySchema>;

const readJournalTool = {
  name: 'read_journal',
  description: 'Read recent journal entries to recall past observations. Use when you need context about previous sessions, user patterns, or past decisions before responding. Supports filtering by category and limiting result count. Read before writing to avoid duplicate entries.',
  schema: readJournalEntriesSchema,
  execute: async (input) => {
    const entries = readJournalEntries(input);

    return {
      status: 'success',
      message: `Loaded ${entries.length} journal entries.`,
      data: { entries },
    };
  },
} satisfies ToolRegistryEntry<'read_journal', typeof readJournalEntriesSchema>;

// ─── New Proactive Assistant OS tools ──────────────────────

const updateIdentityTool = {
  name: 'update_identity',
  description: 'Rewrite your Identity document — your personality, voice, decision rules, and operating principles. This is who you are. Only update when a behavioral shift is confirmed across multiple interactions. You must write_journal with the diff and reasoning BEFORE calling this tool. Content must be under 3000 tokens. Submit the full document, not a patch.',
  schema: updateIdentityInputSchema,
  execute: async (input) => {
    const tokens = estimateTokens(input.content);
    if (tokens > IDENTITY_TOKEN_HARD_LIMIT) {
      return {
        status: 'error' as const,
        message: `Identity document is ~${tokens} tokens (limit: ${IDENTITY_TOKEN_HARD_LIMIT}). Compress it — remove redundancy, tighten language, keep the meaning. Don't truncate.`,
      };
    }

    const previousIdentity = getIdentity();
    const diff = summarizeLineDiff(previousIdentity, input.content);

    try {
      writeJournalEntry({
        category: 'summary',
        content: [
          'Identity update applied.',
          'Reason: autonomous refinement based on observed behavior effectiveness.',
          `Estimated tokens: ${tokens}.`,
          'Added lines:',
          formatDiffItems(diff.added),
          'Removed lines:',
          formatDiffItems(diff.removed),
        ].join('\n'),
      });
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error
          ? `Identity update aborted: journal logging failed (${error.message}).`
          : 'Identity update aborted: journal logging failed.',
      };
    }

    setIdentity(input.content, 'ai');

    return {
      status: 'success',
      message: `Identity updated (~${tokens} tokens). Change logged to Journal and memory events.`,
      data: { estimatedTokens: tokens, journalLogged: true },
    };
  },
} satisfies ToolRegistryEntry<'update_identity', typeof updateIdentityInputSchema>;

const updateMemoryTool = {
  name: 'update_memory',
  description: "Update a section of your Memory. Adds new knowledge or replaces existing entries in the specified section. Keep entries atomic (one fact per line). If the section doesn't exist, it's created. Announce what you're saving to Marcus. If Memory exceeds 8000 tokens, you'll get a warning to consolidate.",
  schema: updateMemoryInputSchema,
  execute: async (input) => {
    try {
      const beforeMemory = getMemory();
      const beforeSection = readMemorySection(input.section);
      const result = updateMemorySection(input.section, input.content, input.mode, 'ai');
      const afterSection = readMemorySection(input.section);
      const diff = summarizeLineDiff(beforeSection, afterSection);
      let journalLogged = false;

      try {
        writeJournalEntry({
          category: 'summary',
          content: [
            `Memory update applied.`,
            `Section: ${input.section}. Mode: ${input.mode}.`,
            'Reason: persistent preference/fact/workflow update.',
            'Added lines:',
            formatDiffItems(diff.added),
            'Removed lines:',
            formatDiffItems(diff.removed),
          ].join('\n'),
        });
        journalLogged = true;
      } catch {
        setMemory(beforeMemory, 'system');
        return {
          status: 'error' as const,
          message: `Memory update for section "${input.section}" was rolled back because journal logging failed.`,
        };
      }

      const response: { status: 'success'; message: string; data: Record<string, unknown> } = {
        status: 'success',
        message: `Memory section "${input.section}" updated (mode: ${input.mode}).`,
        data: { section: input.section, mode: input.mode, journalLogged },
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

const searchJournalTool = {
  name: 'search_journal',
  description: 'Search your Journal by keyword with optional date range. Use to recall past reasoning, find self-corrections, or verify patterns before updating Identity.',
  schema: searchJournalInputSchema,
  execute: async (input) => {
    const entries = searchJournalEntries({
      query: input.query,
      fromDate: input.fromDate,
      toDate: input.toDate,
      limit: input.limit,
    });

    return {
      status: 'success',
      message: `Found ${entries.length} journal entries matching "${input.query}".`,
      data: { entries },
    };
  },
} satisfies ToolRegistryEntry<'search_journal', typeof searchJournalInputSchema>;

const emitChipsTool = {
  name: 'emit_chips',
  description: 'Attach interactive chips to your current message. Response chips let Marcus answer with a tap instead of typing. Action chips execute a tool call on tap. Call AFTER writing your text, not instead of it. 2-4 chips when used. Only emit chips at genuine decision points, not after routine actions.',
  schema: emitChipsInputSchema,
  execute: async (input) => {
    const normalizedChips = normalizeChipActions(input.chips as ChipAction[]);

    // No-op execution. The renderer reads the tool call args directly.
    return {
      status: 'success',
      message: `${normalizedChips.length} chips attached.`,
      data: { chips: normalizedChips },
    };
  },
} satisfies ToolRegistryEntry<'emit_chips', typeof emitChipsInputSchema>;

const improveTaskTool = {
  name: 'improve_task',
  description: 'Analyze a task and suggest improvements. Use when the user asks to refine, improve, or review a specific task. Checks for missing body, due date, client, and priority. Returns actionable suggestions to make the task more concrete and execution-ready. Requires task id.',
  schema: improveTaskInputSchema,
  execute: async (input) => {
    const task = getTaskById(input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const suggestions: string[] = [];

    if (!task.body || task.body.trim().length < 30) {
      suggestions.push('Add brief acceptance criteria and context in the task body.');
    }

    if (!task.dueDate) {
      suggestions.push('Set a due date (hard or soft) to reduce drift risk.');
    }

    if (!task.client) {
      suggestions.push('Attach a client tag to improve planning and reporting.');
    }

    if ((task.priority ?? 'none') === 'none') {
      suggestions.push('Set priority to reflect urgency and impact.');
    }

    if (suggestions.length === 0) {
      suggestions.push('Task already looks actionable. Next step: execute first sub-step now.');
    }

    return {
      status: 'success',
      message: `Generated ${suggestions.length} improvements for "${task.title}".`,
      data: {
        task,
        suggestions,
      },
    };
  },
} satisfies ToolRegistryEntry<'improve_task', typeof improveTaskInputSchema>;

const listTasksTool = {
  name: 'list_tasks',
  description: 'Search and filter the full task list. Use when you need to find a task beyond the top-15 visible in context, or when resolving a user\'s natural-language reference to a task ID. Accepts optional filters: status, priority, client (case-insensitive partial match), today, search (case-insensitive title substring), limit (default 20). Returns array of task summaries with IDs.',
  schema: listTasksToolInputSchema,
  execute: async (input) => {
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

const getTaskTool = {
  name: 'get_task',
  description: 'Fetch full details of a single task by ID. Returns all task fields (body, notes, invoice fields, timestamps) plus child subtasks. Use when you need complete context before acting on a task.',
  schema: getTaskToolInputSchema,
  execute: async (input) => {
    const task = getTaskById(input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const subtasks = listTasks({ parentId: input.id }).map((child) => ({
      id: child.id,
      title: child.title,
      status: child.status,
      priority: child.priority,
      today: child.today,
    }));

    return {
      status: 'success',
      message: `Loaded task "${task.title}"${subtasks.length > 0 ? ` with ${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'}` : ''}.`,
      data: { task, subtasks },
    };
  },
} satisfies ToolRegistryEntry<'get_task', typeof getTaskToolInputSchema>;

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^127\./,
];

const isPrivateIpAddress = (address: string): boolean => {
  const normalized = address.toLowerCase();

  if (normalized === '::1') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.replace('::ffff:', '');
    return isPrivateIpAddress(mapped);
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) {
    return true;
  }

  if (isIP(address) !== 4) {
    return false;
  }

  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const resolveHostAddresses = async (hostname: string): Promise<string[]> => {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
};

const isPrivateUrl = async (urlString: string): Promise<boolean> => {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return true;
    }

    if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
      return true;
    }

    if (isIP(hostname) > 0) {
      return isPrivateIpAddress(hostname);
    }

    const addresses = await resolveHostAddresses(hostname);
    if (addresses.length === 0) {
      return true;
    }

    return addresses.some((address) => isPrivateIpAddress(address));
  } catch {
    return true;
  }
};

const FETCH_TIMEOUT_MS = 10_000;
const FETCH_MAX_BODY_BYTES = 500_000;
const FETCH_MAX_REDIRECTS = 5;

const isRedirectStatus = (status: number): boolean =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

const readResponseBodyWithLimit = async (
  response: Response,
  maxBytes: number,
): Promise<string> => {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(declaredBytes) && declaredBytes > maxBytes) {
      throw new Error(`Response body exceeds ${maxBytes} byte limit.`);
    }
  }

  if (!response.body) {
    const fallback = await response.arrayBuffer();
    if (fallback.byteLength > maxBytes) {
      throw new Error(`Response body exceeds ${maxBytes} byte limit.`);
    }
    return new TextDecoder().decode(fallback);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      streamDone = true;
      continue;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response body exceeds ${maxBytes} byte limit.`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return new TextDecoder().decode(merged);
};

const fetchReadableHtml = async (
  inputUrl: string,
  signal: AbortSignal,
): Promise<{ html: string; finalUrl: string }> => {
  let currentUrl = inputUrl;

  for (let redirectCount = 0; redirectCount <= FETCH_MAX_REDIRECTS; redirectCount += 1) {
    if (await isPrivateUrl(currentUrl)) {
      throw new Error('Cannot fetch private or internal URLs.');
    }

    const response = await fetch(currentUrl, {
      signal,
      redirect: 'manual',
      headers: {
        'User-Agent': 'Flusk/1.0 (Article Extractor)',
        Accept: 'text/html, application/xhtml+xml, text/plain',
      },
    });

    if (isRedirectStatus(response.status)) {
      if (redirectCount === FETCH_MAX_REDIRECTS) {
        throw new Error('Too many redirects while fetching URL.');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing Location header.');
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (
      !contentType.includes('text/') &&
      !contentType.includes('html') &&
      !contentType.includes('application/xhtml')
    ) {
      throw new Error(`Unsupported content type: ${contentType}. Only text/HTML is supported.`);
    }

    const html = await readResponseBodyWithLimit(response, FETCH_MAX_BODY_BYTES);
    return { html, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects while fetching URL.');
};

const fetchUrlTool = {
  name: 'fetch_url',
  description: 'Fetch a URL and return its readable content. Use when the user pastes a link and asks you to summarize or read it. Only processes text/HTML content. Returns extracted article title and content, truncated to maxLength.',
  schema: fetchUrlToolInputSchema,
  execute: async (input) => {
    if (await isPrivateUrl(input.url)) {
      throw new Error('Cannot fetch private or internal URLs.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const { html, finalUrl } = await fetchReadableHtml(input.url, controller.signal);
      const article = await extractFromHtml(html, finalUrl);
      const title = article?.title ?? 'Untitled';
      let content = article?.content ?? html;

      // Strip HTML tags for plain text output
      content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (content.length > input.maxLength) {
        content = content.slice(0, input.maxLength).trimEnd() + '...';
      }

      return {
        status: 'success',
        message: `Fetched "${title}" (${content.length} chars).`,
        data: { title, content, url: finalUrl },
      };
    } finally {
      clearTimeout(timeout);
    }
  },
} satisfies ToolRegistryEntry<'fetch_url', typeof fetchUrlToolInputSchema>;

export const AI_TOOL_REGISTRY = {
  create_task: createTaskTool,
  update_task: updateTaskTool,
  complete_task: completeTaskTool,
  delete_task: deleteTaskTool,
  move_task: moveTaskTool,
  set_today: setTodayTool,
  suggest_daily_plan: suggestDailyPlanTool,
  parse_notes: parseNotesTool,
  read_note: readNoteTool,
  edit_note: editNoteTool,
  undo_last_action: undoLastActionTool,
  write_journal: writeJournalTool,
  read_journal: readJournalTool,
  update_identity: updateIdentityTool,
  update_memory: updateMemoryTool,
  search_journal: searchJournalTool,
  emit_chips: emitChipsTool,
  improve_task: improveTaskTool,
  list_tasks: listTasksTool,
  get_task: getTaskTool,
  fetch_url: fetchUrlTool,
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

  if (toolName === 'parse_notes' && typeof input.text === 'string') {
    hint._parsedCount = extractTaskTitlesFromNotes(input.text).length;
  }

  return { toolName, input: hint };
};

const buildPendingRationale = (toolName: string, input: Record<string, unknown>): string => {
  switch (toolName) {
    case 'delete_task': {
      const task = typeof input.id === 'string' ? getTaskById(input.id) : null;
      return task ? `Delete task "${task.title}".` : `Delete task ${String(input.id)}.`;
    }
    case 'update_task':
      return `Update task ${String(input.id)}.`;
    case 'complete_task':
      return `Mark task ${String(input.id)} as done.`;
    case 'move_task':
      return `Move task ${String(input.id)}.`;
    case 'create_task':
      return `Create task "${String(input.title ?? '')}".`;
    case 'set_today':
      return `Toggle Today for task ${String(input.id)}.`;
    case 'parse_notes':
      return `Create tasks from notes.`;
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

  // ─── Autonomy gate ─────────────────────────────────────
  let gateApproved = false;
  if (!context.autonomyBypass && isMutationTool(rawToolName)) {
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
        gate.reason,
        {
          actionId: pending.actionId,
          riskLevel: risk,
          rationale,
          lifecycle: 'pending',
        },
      );
      emitActionCard(context, actionCard);

      return {
        ok: true,
        toolName: rawToolName,
        output: {
          status: 'confirmation_required',
          message: gate.reason,
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

export const createSdkTools = (context: ToolExecutionContext = {}) => {
  const tools: Record<string, unknown> = {};

  (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).forEach((toolName) => {
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
