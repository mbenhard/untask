import { z } from 'zod';

import { TASK_STATUS_VALUES } from '../../../types/models';
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
} from '../../services/taskService';
import { TERMINAL_STATUSES, type PredefinedStatusId } from '../../../types/models';
import type { ChatViewIntent } from '../../../types/chat';
import type { ToolRegistryEntry, ToolExecutionContext, ToolExecutionEnvelope } from './types';
import { confirmationRequired, successResult } from './helpers';
import { isPostMutationVerifyEnabled } from '../runtimeFlags';
import { logRuntimeDiagnostic } from '../runtimeDiagnostics';

const summarizeTask = (task: { title: string }): string => task.title;

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

const postVerifyEnabled = (): boolean => isPostMutationVerifyEnabled();

const verificationError = (toolName: string, reason: string, message: string): ToolExecutionEnvelope => {
  logRuntimeDiagnostic('ai_runtime.post_verify_failed', { toolName, reason });
  return {
    status: 'error',
    message: `I couldn't fully apply that change: ${message}`,
  };
};

// ─── Schemas ────────────────────────────────────────────────────

export const createTaskToolInputSchema = createTaskSchema.strict();

export const completeTaskToolInputSchema = z.object({
  id: z.string().min(1),
  completeChildren: z.boolean().optional(),
});

export const deleteTaskToolInputSchema = z.object({
  id: z.string().min(1),
  cascade: z.boolean().optional(),
});

export const undoLastActionInputSchema = z.object({
  taskEventId: z.string().min(1).optional(),
});

export const listTasksToolInputSchema = z.object({
  id: z.string().optional().describe('Return a single task by ID (ignores other filters when set).'),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  client: z.string().optional(),
  today: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

// ─── Tool definitions ───────────────────────────────────────────

export const createTaskTool = {
  name: 'create_task',
  description: 'Create a new task. Use when the user asks to add, create, or capture a task, todo, or action item. Title must be concrete and actionable (e.g., "Call Acme about invoice"). If the request is vague, ask for clarification instead. Always set priority — don\'t leave it as none. High: due today/tomorrow, money/client commitments, user said urgent/ASAP. Medium: due this week, meaningful but not time-critical. Low: no deadline, nice-to-have. If unsure, default to medium. Optional: dueDate (date "2026-02-17" or date+time "2026-02-17T14:30"), client, parentId, status, recurrence (e.g., "daily", "weekly", "monthly", "every monday", "every 2 weeks"). To create subtasks, first create the parent task, then use its returned ID as parentId. Never use placeholder IDs.',
  schema: createTaskToolInputSchema,
  execute: async (input: z.infer<typeof createTaskToolInputSchema>, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
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

export const updateTaskTool = {
  name: 'update_task',
  description: 'Update an existing task. Use when the user wants to change a task title, priority, due date, status, client, notes, or recurrence. Requires the task id. dueDate supports date "2026-02-17" or date+time "2026-02-17T14:30". recurrence accepts rules like "daily", "weekly", "monthly", "every monday", "every 2 weeks". Set recurrence to null to remove. High-risk changes (rewriting completed tasks) trigger confirmation. Provide only the fields that need changing.',
  schema: updateTaskSchema.strict(),
  execute: async (input: z.infer<ReturnType<typeof updateTaskSchema.strict>>, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
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

    if (postVerifyEnabled() && Object.prototype.hasOwnProperty.call(input, 'parentId')) {
      const verifiedTask = getTaskById(updatedTask.id);
      const expectedParentId = input.parentId ?? null;
      const actualParentId = verifiedTask?.parentId ?? null;

      if (!verifiedTask || actualParentId !== expectedParentId) {
        return verificationError(
          'update_task',
          'parent_mismatch',
          'The requested parent move did not stick. Move or complete subtasks first, then retry.',
        );
      }
    }

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

export const completeTaskTool = {
  name: 'complete_task',
  description: 'Mark a task as done. Use when the user says a task is finished, completed, or done. Requires the task id. If the task has active subtasks, set completeChildren=true only after explicit confirmation. Undoable via undo_last_action.',
  schema: completeTaskToolInputSchema,
  execute: async (input: z.infer<typeof completeTaskToolInputSchema>, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
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
    const recurrenceExpected = Boolean(task.recurrence);

    if (postVerifyEnabled()) {
      const verifiedCompleted = getTaskById(completed.id);
      if (
        !verifiedCompleted ||
        !TERMINAL_STATUSES.includes(verifiedCompleted.status as PredefinedStatusId)
      ) {
        return verificationError(
          'complete_task',
          'task_not_terminal',
          'the task is still active after completion.',
        );
      }

      if (input.completeChildren === true) {
        const descendants = listTasks({ parentId: completed.id });
        const activeDescendants = descendants.filter(
          (child) => !TERMINAL_STATUSES.includes(child.status as PredefinedStatusId),
        );
        if (activeDescendants.length > 0) {
          return verificationError(
            'complete_task',
            'descendants_not_terminal',
            `${activeDescendants.length} subtask(s) are still active.`,
          );
        }
      }

      if (recurrenceExpected) {
        if (!recurredTask) {
          return verificationError(
            'complete_task',
            'recurrence_missing',
            'the next recurring instance was not created.',
          );
        }

        const recurrenceArtifact = getTaskById(recurredTask.id);
        if (!recurrenceArtifact) {
          return verificationError(
            'complete_task',
            'recurrence_artifact_missing',
            'the recurring follow-up task is missing.',
          );
        }
      }
    }

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

export const deleteTaskTool = {
  name: 'delete_task',
  description: 'Permanently delete a task. Use only when the user explicitly asks to delete or remove a task. Always requires confirmation before execution. If deleting a parent with active subtasks, set cascade=true only after explicit confirmation. This is destructive and not undoable. Requires the task id.',
  schema: deleteTaskToolInputSchema,
  execute: async (input: z.infer<typeof deleteTaskToolInputSchema>, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
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

    if (postVerifyEnabled()) {
      const deleted = getTaskById(input.id);
      if (deleted) {
        return verificationError(
          'delete_task',
          'task_still_exists',
          'the task still exists after delete.',
        );
      }
    }

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

export const undoLastActionTool = {
  name: 'undo_last_action',
  description: 'Undo the most recent AI task mutation, or a specific task event by id. Use when the user says "undo", "revert", or "that was wrong". Without taskEventId, reverts the latest AI-initiated change. With taskEventId, reverts that specific event. Not all events are undoable.',
  schema: undoLastActionInputSchema,
  execute: async (input: z.infer<typeof undoLastActionInputSchema>, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> => {
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

export const listTasksTool = {
  name: 'list_tasks',
  description: 'Search and filter the full task list, or retrieve a single task by ID. Use when you need to find a task beyond the top-15 visible in context, or when resolving a user\'s natural-language reference to a task ID. Pass id to look up one task. Accepts optional filters: status, priority, client (case-insensitive partial match), today, search (case-insensitive title substring), limit (default 20). Returns array of task summaries with IDs.',
  schema: listTasksToolInputSchema,
  execute: async (input: z.infer<typeof listTasksToolInputSchema>): Promise<ToolExecutionEnvelope> => {
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
