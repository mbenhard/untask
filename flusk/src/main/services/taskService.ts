import { eq, asc, isNull, and, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db';
import { tasks, taskEvents, type Task, type NewTask } from '../db/schema';

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
): void {
  const db = getDb();
  db.insert(taskEvents).values({
    taskId,
    action,
    source,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
  }).run();
}

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
