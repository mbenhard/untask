import { randomUUID } from 'node:crypto';

import { tool } from 'ai';
import { z } from 'zod';

import type { ChatActionCard, ChatToolStatus, ActionLifecycle } from '../../types/chat';
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
  writeJournalEntry,
  writeJournalEntrySchema,
} from '../services/journalService';
import { generateLiveThought } from './liveThought';
import { appendPatternEntry, appendProfileEntry } from './memory';

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
}): string => {
  const tags = [
    task.priority ? `priority:${task.priority}` : null,
    task.client ? `client:${task.client}` : null,
    task.dueDate ? `due:${task.dueDate}` : null,
  ].filter(Boolean);

  return `${task.title}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
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
const completeTaskToolInputSchema = z.object({ id: z.string().min(1) });
const deleteTaskToolInputSchema = z.object({ id: z.string().min(1) });
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
  status: z.enum(['inbox', 'active', 'in_progress']).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
});
const suggestDailyPlanInputSchema = z.object({
  maxTasks: z.number().int().min(1).max(8).default(5),
});
const undoLastActionInputSchema = z.object({
  taskEventId: z.string().min(1).optional(),
});
const updateUserProfileInputSchema = z.object({
  entry: z.string().trim().min(1),
});
const updatePatternsInputSchema = z.object({
  entry: z.string().trim().min(1),
});
const improveTaskInputSchema = z.object({
  id: z.string().min(1),
});
const generateLiveThoughtInputSchema = z.object({
  focus: z.string().trim().optional(),
});

const createTaskTool = {
  name: 'create_task',
  description: 'Create a task or subtask and log an auditable task event.',
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
      },
    );
  },
} satisfies ToolRegistryEntry<'create_task', typeof createTaskToolInputSchema>;

const updateTaskTool = {
  name: 'update_task',
  description: 'Update task fields with policy checks for high-risk changes.',
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
      },
    );
  },
} satisfies ToolRegistryEntry<'update_task', ReturnType<typeof updateTaskSchema.strict>>;

const completeTaskTool = {
  name: 'complete_task',
  description: 'Mark a task as done and set completedAt.',
  schema: completeTaskToolInputSchema,
  execute: async (input, context) => {
    const completed = completeTask(input.id, 'ai');
    const event = getLastTaskEventForTask(completed.id);

    return successResult(
      context,
      'complete_task',
      'Task completed',
      summarizeTask(completed),
      { task: completed },
      {
        taskId: completed.id,
        taskEventId: event?.id,
        undoable: Boolean(event?.id),
      },
    );
  },
} satisfies ToolRegistryEntry<'complete_task', typeof completeTaskToolInputSchema>;

const deleteTaskTool = {
  name: 'delete_task',
  description: 'Delete a task. Always requires explicit confirmation.',
  schema: deleteTaskToolInputSchema,
  execute: async (input, context) => {
    const task = getTaskById(input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
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

    deleteTask(input.id, 'ai');

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
  description: 'Re-parent a task (project/subtask move).',
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
  description: 'Set or toggle a task on the Today list.',
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
      },
    );
  },
} satisfies ToolRegistryEntry<'set_today', typeof setTodayToolInputSchema>;

const suggestDailyPlanTool = {
  name: 'suggest_daily_plan',
  description:
    'Suggest a focused daily plan using due dates, priority, and value-at-risk context.',
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
  description: 'Extract task candidates from raw notes and create tasks when safe.',
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

const undoLastActionTool = {
  name: 'undo_last_action',
  description: 'Undo the latest AI task mutation or a specific task event.',
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
  description: 'Write an AI journal entry for pattern/progress/preference tracking.',
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
  description: 'Read recent AI journal entries.',
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

const generateLiveThoughtTool = {
  name: 'generate_live_thought',
  description: 'Generate a concise, outcome-focused live thought for the current context.',
  schema: generateLiveThoughtInputSchema,
  execute: async (input) => {
    const liveThought = generateLiveThought({
      focus: input.focus ?? null,
    });

    return {
      status: 'success',
      message: 'Generated live thought.',
      data: {
        focus: input.focus ?? null,
        ...liveThought,
      },
    };
  },
} satisfies ToolRegistryEntry<'generate_live_thought', typeof generateLiveThoughtInputSchema>;

const updateUserProfileTool = {
  name: 'update_user_profile',
  description: 'Append a confirmed profile memory entry.',
  schema: updateUserProfileInputSchema,
  execute: async (input) => {
    const content = appendProfileEntry(input.entry);

    return {
      status: 'success',
      message: 'Profile memory updated.',
      data: {
        profile: content,
      },
    };
  },
} satisfies ToolRegistryEntry<'update_user_profile', typeof updateUserProfileInputSchema>;

const updatePatternsTool = {
  name: 'update_patterns',
  description: 'Append a confirmed workflow pattern entry.',
  schema: updatePatternsInputSchema,
  execute: async (input) => {
    const content = appendPatternEntry(input.entry);

    return {
      status: 'success',
      message: 'Pattern memory updated.',
      data: {
        patterns: content,
      },
    };
  },
} satisfies ToolRegistryEntry<'update_patterns', typeof updatePatternsInputSchema>;

const improveTaskTool = {
  name: 'improve_task',
  description: 'Suggest concrete improvements for task clarity and execution readiness.',
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

export const AI_TOOL_REGISTRY = {
  create_task: createTaskTool,
  update_task: updateTaskTool,
  complete_task: completeTaskTool,
  delete_task: deleteTaskTool,
  move_task: moveTaskTool,
  set_today: setTodayTool,
  suggest_daily_plan: suggestDailyPlanTool,
  parse_notes: parseNotesTool,
  undo_last_action: undoLastActionTool,
  write_journal: writeJournalTool,
  read_journal: readJournalTool,
  generate_live_thought: generateLiveThoughtTool,
  update_user_profile: updateUserProfileTool,
  update_patterns: updatePatternsTool,
  improve_task: improveTaskTool,
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
  }

  // ─── Execute tool ──────────────────────────────────────
  const execContext: ToolExecutionContext = context.autonomyBypass
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
          message: result.error.message,
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
