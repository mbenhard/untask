import { eq, asc, desc, isNull, and, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db';
import { tasks, taskEvents, type Task, type TaskEvent, type NewTask } from '../db/schema';

// ─── Validation schemas ─────────────────────────────────────
export const createTaskSchema = z.object({
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

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string(),
});
const reorderTaskIdsSchema = z.array(z.string().min(1));

// ─── Service functions ──────────────────────────────────────
function logTaskEvent(
  taskId: string,
  action: 'create' | 'update' | 'move' | 'complete' | 'delete',
  source: 'user' | 'ai',
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

export function listTasks(filter?: {
  status?: 'inbox' | 'active' | 'in_progress' | 'done';
  parentId?: string | null;
  today?: boolean;
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

  return db
    .select()
    .from(tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(tasks.order))
    .all();
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
  source: 'user' | 'ai' = 'user',
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

  return {
    undone: true,
    targetTaskId: targetEvent.taskId,
    originalEventId: targetEvent.id,
    originalAction: targetEvent.action,
    undoEventId: undoEvent.id,
  };
}

export function undoLastAiTaskEvent(
  source: 'user' | 'ai' = 'user',
): UndoTaskEventResult | null {
  const latestAiEvent = getLastAiTaskEvent();
  if (!latestAiEvent) {
    return null;
  }

  return undoTaskEvent(latestAiEvent.id, source);
}

export function createTask(
  input: z.infer<typeof createTaskSchema>,
  source: 'user' | 'ai' = 'user',
): Task {
  const validated = createTaskSchema.parse(input);
  const db = getDb();

  const [created] = db
    .insert(tasks)
    .values(validated as NewTask)
    .returning()
    .all();

  logTaskEvent(created.id, 'create', source, null, created);
  return created;
}

export function updateTask(
  input: z.infer<typeof updateTaskSchema>,
  source: 'user' | 'ai' = 'user',
): Task {
  const validated = updateTaskSchema.parse(input);
  const { id, ...updates } = validated;
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'update', source, before, updated);
  return updated;
}

export function deleteTask(id: string, source: 'user' | 'ai' = 'user'): void {
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  db.delete(tasks).where(eq(tasks.id, id)).run();

  logTaskEvent(id, 'delete', source, before, null);
}

export function completeTask(id: string, source: 'user' | 'ai' = 'user'): Task {
  const db = getDb();

  const [before] = db.select().from(tasks).where(eq(tasks.id, id)).all();
  if (!before) throw new Error(`Task not found: ${id}`);

  const [updated] = db
    .update(tasks)
    .set({ status: 'done', completedAt: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .returning()
    .all();

  logTaskEvent(id, 'complete', source, before, updated);
  return updated;
}

export function toggleToday(id: string, source: 'user' | 'ai' = 'user'): Task {
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
  return updated;
}

export function reorderTasks(
  orderedIds: string[],
  source: 'user' | 'ai' = 'user',
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
}
