import { eq, asc, desc, isNull, and, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import {
  TASK_STATUS_VALUES,
  TERMINAL_STATUSES,
  type TaskStatus,
  type TaskStatusConfig,
  type PredefinedStatusId,
  getDefaultStatusConfig,
} from '../../types/models';
import { getDb } from '../db';
import { tasks, taskEvents, type Task, type TaskEvent, type NewTask } from '../db/schema';
import { calculateNextOccurrence } from './recurrenceEngine';
import { getSetting, setSetting } from './settingsService';

// ─── Validation schemas ─────────────────────────────────────
export const createTaskSchema = z.object({
  title: z.string().min(1),
  parentId: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional(),
  today: z.boolean().optional(),
  client: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueType: z.enum(['hard', 'soft']).nullable().optional(),
  effort: z.enum(['unknown', 'tiny', 'small', 'medium', 'deep']).optional(),
  recurrence: z.string().nullable().optional(),
  recurrenceSourceId: z.string().nullable().optional(),
  reminderOffset: z.enum(['at_due', '15m', '1h', '1d']).nullable().optional(),
  order: z.number().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string(),
});
const reorderTaskIdsSchema = z.array(z.string().min(1));

export type DeleteTaskOptions = {
  cascade?: boolean;
};

export type CompleteTaskOptions = {
  completeChildren?: boolean;
};

export type TaskChangeEvent = {
  taskId: string;
  action: 'create' | 'update' | 'complete' | 'cancel' | 'delete' | 'reopen';
};

export type TaskChangeListener = (event: TaskChangeEvent) => void;

const taskChangeListeners = new Set<TaskChangeListener>();

const emitTaskChange = (event: TaskChangeEvent): void => {
  for (const listener of [...taskChangeListeners]) {
    try {
      listener(event);
    } catch {
      // Ignore listener failures so task mutations always complete.
    }
  }
};

const USER_UNDO_STACK_SIZE = 20;
const userUndoStack: string[] = [];

const pushUserUndoEvent = (eventId: string): void => {
  userUndoStack.unshift(eventId);
  if (userUndoStack.length > USER_UNDO_STACK_SIZE) {
    userUndoStack.pop();
  }
};

const popUserUndoEvent = (): string | null => {
  return userUndoStack.shift() ?? null;
};

export const subscribeTaskChanges = (
  listener: TaskChangeListener,
): (() => void) => {
  taskChangeListeners.add(listener);
  return () => {
    taskChangeListeners.delete(listener);
  };
};

type TaskEventSource = 'user' | 'ai' | 'undo';

// ─── Service functions ──────────────────────────────────────
function logTaskEvent(
  taskId: string,
  action: 'create' | 'update' | 'move' | 'complete' | 'cancel' | 'delete',
  source: TaskEventSource,
  before: Task | null,
  after: Task | null,
): TaskEvent {
  const db = getDb();
  const [created] = db.insert(taskEvents).values({
    taskId,
    action,
    source,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
  }).returning().all();

  if (source === 'user') {
    pushUserUndoEvent(created.id);
  }

  return created;
}

const parseTaskSnapshot = (snapshot: string | null): Task | null => {
  if (!snapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshot) as Task;
    return parsed;
  } catch {
    return null;
  }
};

const updateTaskFromSnapshot = (id: string, snapshot: Task): Task => {
  const db = getDb();
  const { id: snapshotId, ...restoredValues } = snapshot;
  void snapshotId;

  const [updated] = db
    .update(tasks)
    .set(restoredValues)
    .where(eq(tasks.id, id))
    .returning()
    .all();

  return updated;
};

const assertTopLevelParentExists = (
  db: ReturnType<typeof getDb>,
  parentId: string,
): Task => {
  const [parent] = db
    .select()
    .from(tasks)
    .where(eq(tasks.id, parentId))
    .all();

  if (!parent) {
    throw new Error(`Parent task not found: ${parentId}`);
  }

  if (parent.parentId !== null) {
    throw new Error(
      'Tasks support one nesting level only. Choose a top-level parent task.',
    );
  }

  return parent;
};

const listChildTasks = (db: ReturnType<typeof getDb>, parentId: string): Task[] =>
  db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, parentId))
    .all();

const listActiveChildTasks = (
  db: ReturnType<typeof getDb>,
  parentId: string,
): Task[] =>
  listChildTasks(db, parentId).filter(
    (task) => !TERMINAL_STATUSES.includes(task.status as PredefinedStatusId),
  );

export function listTasks(filter?: {
  status?: TaskStatus;
  parentId?: string | null;
  today?: boolean;
  priority?: 'none' | 'low' | 'medium' | 'high';
  client?: string;
  search?: string;
  limit?: number;
}): Task[] {
  const db = getDb();
  const conditions: SQL[] = [];

  if (filter?.status) {
    conditions.push(eq(tasks.status, filter.status));
  }
  if (filter?.today !== undefined) {
    conditions.push(eq(tasks.today, filter.today));
  }
  if (filter?.parentId !== undefined) {
    conditions.push(
      filter.parentId === null
        ? isNull(tasks.parentId)
        : eq(tasks.parentId, filter.parentId),
    );
  }
  if (filter?.priority) {
    conditions.push(eq(tasks.priority, filter.priority));
  }
  if (filter?.client) {
    const normalizedClient = filter.client.trim().toLowerCase();
    if (normalizedClient.length > 0) {
      conditions.push(sql`lower(${tasks.client}) LIKE ${`%${normalizedClient}%`}`);
    }
  }
  if (filter?.search) {
    const normalizedSearch = filter.search.trim().toLowerCase();
    if (normalizedSearch.length > 0) {
      conditions.push(sql`lower(${tasks.title}) LIKE ${`%${normalizedSearch}%`}`);
    }
  }

  const query = db
    .select()
    .from(tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(tasks.order));

  const limitedQuery = filter?.limit && filter.limit > 0
    ? query.limit(filter.limit)
    : query;

  return limitedQuery.all();
}

/**
 * Clear the `today` flag on terminal tasks completed/cancelled before today.
 * Called once on app startup so "Done today" doesn't accumulate stale entries.
 */
export function clearStaleTodayFlags(): number {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const result = db
    .update(tasks)
    .set({ today: false })
    .where(
      and(
        eq(tasks.today, true),
        inArray(tasks.status, [...TERMINAL_STATUSES]),
        sql`coalesce(${tasks.completedAt}, ${tasks.cancelledAt}, '1970-01-01') < ${todayIso}`,
      ),
    )
    .returning()
    .all();

  for (const task of result) {
    emitTaskChange({ taskId: task.id, action: 'update' });
  }

  return result.length;
}

export function getTaskById(id: string): Task | null {
  const db = getDb();
  const [row] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  return row ?? null;
}

export function getLastTaskEventForTask(taskId: string): TaskEvent | null {
  const db = getDb();
  const [row] = db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt))
    .all();
  return row ?? null;
}

export function getLastAiTaskEvent(): TaskEvent | null {
  const db = getDb();
  const [row] = db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.source, 'ai'))
    .orderBy(desc(taskEvents.createdAt))
    .all();
  return row ?? null;
}

export type UndoTaskEventResult = {
  undone: boolean;
  targetTaskId: string;
  originalEventId: string;
  originalAction: TaskEvent['action'];
  undoEventId?: string;
  reason?: string;
};

export function undoTaskEvent(
  eventId: string,
  source: TaskEventSource = 'user',
): UndoTaskEventResult {
  const db = getDb();
  const [targetEvent] = db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.id, eventId))
    .all();

  if (!targetEvent) {
    throw new Error(`Task event not found: ${eventId}`);
  }

  const before = parseTaskSnapshot(targetEvent.before);
  const after = parseTaskSnapshot(targetEvent.after);

  if (targetEvent.action === 'create') {
    const existing = getTaskById(targetEvent.taskId);
    if (!existing) {
      return {
        undone: false,
        targetTaskId: targetEvent.taskId,
        originalEventId: targetEvent.id,
        originalAction: targetEvent.action,
        reason: 'Task no longer exists.',
      };
    }

    db.delete(tasks).where(eq(tasks.id, targetEvent.taskId)).run();
    const undoEvent = logTaskEvent(
      targetEvent.taskId,
      'delete',
      source,
      existing,
      null,
    );

    emitTaskChange({ taskId: targetEvent.taskId, action: 'delete' });
    return {
      undone: true,
      targetTaskId: targetEvent.taskId,
      originalEventId: targetEvent.id,
      originalAction: targetEvent.action,
      undoEventId: undoEvent.id,
    };
  }

  if (targetEvent.action === 'delete') {
    if (!before) {
      throw new Error(`Cannot undo delete event ${eventId}: missing before snapshot.`);
    }

    const existing = getTaskById(targetEvent.taskId);
    const restored = existing
      ? updateTaskFromSnapshot(targetEvent.taskId, before)
      : db
        .insert(tasks)
        .values(before as NewTask)
        .returning()
        .all()[0];

    const undoEvent = logTaskEvent(
      targetEvent.taskId,
      'create',
      source,
      existing,
      restored,
    );

    emitTaskChange({ taskId: targetEvent.taskId, action: 'create' });
    return {
      undone: true,
      targetTaskId: targetEvent.taskId,
      originalEventId: targetEvent.id,
      originalAction: targetEvent.action,
      undoEventId: undoEvent.id,
    };
  }

  if (!before) {
    throw new Error(`Cannot undo event ${eventId}: missing before snapshot.`);
  }

  const existing = getTaskById(targetEvent.taskId);
  const restored = existing
    ? updateTaskFromSnapshot(targetEvent.taskId, before)
    : db
      .insert(tasks)
      .values(before as NewTask)
      .returning()
      .all()[0];

  const undoEvent = logTaskEvent(
    targetEvent.taskId,
    'update',
    source,
    existing ?? after,
    restored,
  );

  emitTaskChange({ taskId: targetEvent.taskId, action: 'update' });
  return {
    undone: true,
    targetTaskId: targetEvent.taskId,
    originalEventId: targetEvent.id,
    originalAction: targetEvent.action,
    undoEventId: undoEvent.id,
  };
}

export function undoLastAiTaskEvent(
  source: TaskEventSource = 'user',
): UndoTaskEventResult | null {
  const latestAiEvent = getLastAiTaskEvent();
  if (!latestAiEvent) {
    return null;
  }

  return undoTaskEvent(latestAiEvent.id, source);
}

export function undoLastUserTaskEvent(): UndoTaskEventResult | null {
  const eventId = popUserUndoEvent();
  if (!eventId) {
    return null;
  }

  return undoTaskEvent(eventId, 'undo');
}

export function createTask(
  input: z.infer<typeof createTaskSchema>,
  source: TaskEventSource = 'user',
): Task {
  const validated = createTaskSchema.parse(input);
  const db = getDb();
  let parentTask: Task | null = null;

  if (validated.parentId) {
    parentTask = assertTopLevelParentExists(db, validated.parentId);
  }

  const [created] = db
    .insert(tasks)
    .values(validated as NewTask)
    .returning()
    .all();

  logTaskEvent(created.id, 'create', source, null, created);

  if (parentTask && parentTask.status === 'inbox') {
    const [promotedParent] = db
      .update(tasks)
      .set({ status: 'active' })
      .where(eq(tasks.id, parentTask.id))
      .returning()
      .all();

    logTaskEvent(parentTask.id, 'update', source, parentTask, promotedParent);
  }

  emitTaskChange({ taskId: created.id, action: 'create' });
  return created;
}

export function updateTask(
  input: z.infer<typeof updateTaskSchema>,
  source: TaskEventSource = 'user',
): Task {
  const validated = updateTaskSchema.parse(input);
  const { id, ...updates } = validated;
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  if (validated.parentId !== undefined) {
    const nextParentId = validated.parentId;

    if (nextParentId === id) {
      throw new Error('A task cannot be its own parent.');
    }

    if (nextParentId) {
      assertTopLevelParentExists(db, nextParentId);
    }

    const hasChildren = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.parentId, id))
      .all().length > 0;

    if (nextParentId && hasChildren) {
      throw new Error(
        'Cannot move a task with subtasks under another parent. Move or complete subtasks first.',
      );
    }

    if (nextParentId !== null && updates.status === undefined && before.status === 'inbox') {
      updates.status = 'active';
    }
  }

  const [updated] = db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'update', source, before, updated);
  emitTaskChange({ taskId: id, action: 'update' });
  return updated;
}

const deleteTaskRecursive = (
  id: string,
  source: TaskEventSource,
  cascade: boolean,
  visited: Set<string>,
): void => {
  if (visited.has(id)) {
    throw new Error(`Task hierarchy cycle detected while deleting task ${id}.`);
  }

  visited.add(id);
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) {
    visited.delete(id);
    throw new Error(`Task not found: ${id}`);
  }

  const children = listChildTasks(db, id);
  const activeChildren = children.filter(
    (task) => !TERMINAL_STATUSES.includes(task.status as PredefinedStatusId),
  );

  if (cascade) {
    for (const child of children) {
      deleteTaskRecursive(child.id, source, true, visited);
    }
  } else {
    if (activeChildren.length > 0) {
      visited.delete(id);
      throw new Error(
        `Cannot delete parent task with active subtasks. Resolve ${activeChildren.length} active subtask(s) first or retry with cascade.`,
      );
    }

    for (const child of children) {
      const [updatedChild] = db
        .update(tasks)
        .set({ parentId: null })
        .where(eq(tasks.id, child.id))
        .returning()
        .all();
      logTaskEvent(child.id, 'move', source, child, updatedChild);
    }
  }

  db.delete(tasks).where(eq(tasks.id, id)).run();

  logTaskEvent(id, 'delete', source, before, null);
  visited.delete(id);
}

export function deleteTask(
  id: string,
  source: TaskEventSource = 'user',
  options?: DeleteTaskOptions,
): void {
  deleteTaskRecursive(id, source, options?.cascade === true, new Set<string>());
  emitTaskChange({ taskId: id, action: 'delete' });
}

const completeTaskRecursive = (
  id: string,
  source: TaskEventSource,
  completeChildren: boolean,
  visited: Set<string>,
): Task => {
  if (visited.has(id)) {
    throw new Error(`Task hierarchy cycle detected while completing task ${id}.`);
  }

  visited.add(id);
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) {
    visited.delete(id);
    throw new Error(`Task not found: ${id}`);
  }

  const activeChildren = listActiveChildTasks(db, id);
  if (activeChildren.length > 0 && !completeChildren) {
    visited.delete(id);
    throw new Error(
      `Cannot complete parent task with active subtasks. Resolve ${activeChildren.length} active subtask(s) first or retry with completeChildren.`,
    );
  }

  if (completeChildren) {
    for (const child of activeChildren) {
      completeTaskRecursive(child.id, source, true, visited);
    }
  }

  const [updated] = db
    .update(tasks)
    .set({ status: 'done', completedAt: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'complete', source, before, updated);
  visited.delete(id);
  return updated;
}

export type CompleteTaskResult = {
  completed: Task;
  recurredTask: Task | null;
};

export function completeTask(
  id: string,
  source: TaskEventSource = 'user',
  options?: CompleteTaskOptions,
): CompleteTaskResult {
  const completed = completeTaskRecursive(
    id,
    source,
    options?.completeChildren === true,
    new Set<string>(),
  );

  // Spawn next recurring instance if applicable
  const recurredTask = spawnRecurringInstance(completed, source);

  emitTaskChange({ taskId: id, action: 'complete' });
  return { completed, recurredTask };
}

function spawnRecurringInstance(
  completedTask: Task,
  source: TaskEventSource,
): Task | null {
  if (!completedTask.recurrence) return null;

  const fromDate = completedTask.dueDate ?? new Date().toISOString().slice(0, 10);
  const next = calculateNextOccurrence(completedTask.recurrence, fromDate);
  if (!next) return null;

  const sourceId = completedTask.recurrenceSourceId ?? completedTask.id;

  return createTask(
    {
      title: completedTask.title,
      body: completedTask.body,
      status: 'inbox',
      priority: completedTask.priority ?? undefined,
      client: completedTask.client,
      effort: completedTask.effort ?? undefined,
      dueDate: next.nextDate,
      recurrence: completedTask.recurrence,
      recurrenceSourceId: sourceId,
    },
    source,
  );
}

export function toggleToday(id: string, source: TaskEventSource = 'user'): Task {
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set({ today: !before.today })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'update', source, before, updated);
  emitTaskChange({ taskId: id, action: 'update' });
  return updated;
}

// ─── Cancel / Reopen ────────────────────────────────────────

export function cancelTask(
  id: string,
  source: TaskEventSource = 'user',
): Task {
  const db = getDb();
  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set({ status: 'cancelled', cancelledAt: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'cancel', source, before, updated);
  emitTaskChange({ taskId: id, action: 'cancel' });
  return updated;
}

export function reopenTask(
  id: string,
  source: TaskEventSource = 'user',
): Task {
  const db = getDb();
  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const config = getTaskStatusConfig();
  const targetStatus = config.enabled.find(
    (s) => !TERMINAL_STATUSES.includes(s) && s !== 'inbox',
  ) ?? 'active';

  const [updated] = db
    .update(tasks)
    .set({ status: targetStatus, completedAt: null, cancelledAt: null })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'update', source, before, updated);
  emitTaskChange({ taskId: id, action: 'reopen' });
  return updated;
}

// ─── Task status config ─────────────────────────────────────

const TASK_STATUSES_KEY = 'task_statuses';

export function getTaskStatusConfig(): TaskStatusConfig {
  const raw = getSetting(TASK_STATUSES_KEY);
  if (!raw) return getDefaultStatusConfig();
  try {
    return JSON.parse(raw) as TaskStatusConfig;
  } catch {
    return getDefaultStatusConfig();
  }
}

export function setTaskStatusConfig(config: TaskStatusConfig): TaskStatusConfig {
  setSetting(TASK_STATUSES_KEY, JSON.stringify(config));
  return config;
}

/** Seed default config on first run (no-op if already set). */
export function ensureDefaultTaskStatusConfig(): void {
  const raw = getSetting(TASK_STATUSES_KEY);
  if (!raw) {
    setSetting(TASK_STATUSES_KEY, JSON.stringify(getDefaultStatusConfig()));
  }
}

export function reorderTasks(
  orderedIds: string[],
  source: TaskEventSource = 'user',
): void {
  const validatedIds = reorderTaskIdsSchema.parse(orderedIds);
  const db = getDb();

  db.transaction((tx): void => {
    if (validatedIds.length === 0) {
      return;
    }

    const uniqueIds = new Set(validatedIds);
    if (uniqueIds.size !== validatedIds.length) {
      throw new Error('Task reorder payload contains duplicate task IDs.');
    }

    const beforeRows = tx
      .select()
      .from(tasks)
      .where(inArray(tasks.id, validatedIds))
      .all();

    if (beforeRows.length !== validatedIds.length) {
      const beforeIds = new Set(beforeRows.map((task) => task.id));
      const missing = validatedIds.filter((id) => !beforeIds.has(id));
      throw new Error(`Task(s) not found: ${missing.join(', ')}`);
    }

    const beforeById = new Map(beforeRows.map((task) => [task.id, task]));

    for (let i = 0; i < validatedIds.length; i++) {
      const id = validatedIds[i];
      const before = beforeById.get(id);
      if (!before) {
        continue;
      }

      if (before.order === i) {
        continue;
      }

      const [updated] = tx
        .update(tasks)
        .set({ order: i })
        .where(eq(tasks.id, id))
        .returning()
        .all();

      tx.insert(taskEvents)
        .values({
          taskId: id,
          action: 'move',
          source,
          before: JSON.stringify(before),
          after: JSON.stringify(updated),
        })
        .run();
    }
  });
  // Reorder is a bulk operation — emit update for the first task to trigger rescan
  if (validatedIds.length > 0) {
    emitTaskChange({ taskId: validatedIds[0], action: 'update' });
  }
}
