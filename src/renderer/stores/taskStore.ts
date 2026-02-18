import { create } from 'zustand';

import type { Task } from '../../types/models';
import { getUntask } from '../lib/untask';
import { useToastStore } from './toastStore';

export type ReminderOffset = 'at_due' | '15m' | '1h' | '1d';

export type TaskCreateInput = {
  title: string;
  parentId?: string | null;
  body?: string | null;
  status?: Task['status'];
  priority?: Task['priority'];
  today?: boolean;
  client?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  reminderOffset?: ReminderOffset | null;
  // TODO(untask-task-ux): Transitional backend-only fields; do not add new primary UI controls.
  dueType?: Task['dueType'];
  // TODO(untask-task-ux): Transitional backend-only fields; do not add new primary UI controls.
  effort?: Task['effort'];
  order?: number;
};

export type TaskUpdateInput = {
  id: string;
  parentId?: string | null;
  title?: string;
  body?: string | null;
  status?: Task['status'];
  priority?: Task['priority'];
  today?: boolean;
  client?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  reminderOffset?: ReminderOffset | null;
  // TODO(untask-task-ux): Transitional backend-only fields; do not add new primary UI controls.
  dueType?: Task['dueType'];
  // TODO(untask-task-ux): Transitional backend-only fields; do not add new primary UI controls.
  effort?: Task['effort'];
  order?: number;
};

type TaskStore = {
  // ── State ───────────────────────────────────────────────
  tasks: Task[];
  selectedTaskId: string | null;
  isLoading: boolean;
  error: string | null;

  // ── Actions ─────────────────────────────────────────────
  fetchTasks: () => Promise<void>;
  createTask: (input: TaskCreateInput) => Promise<Task | null>;
  updateTask: (input: TaskUpdateInput) => Promise<Task | null>;
  deleteTask: (id: string, cascade?: boolean) => Promise<boolean>;
  reorderTasks: (ids: string[]) => Promise<boolean>;
  completeTask: (id: string) => Promise<Task | null>;
  cancelTask: (id: string) => Promise<Task | null>;
  reopenTask: (id: string) => Promise<Task | null>;
  toggleToday: (id: string) => Promise<Task | null>;

  // ── UI actions ──────────────────────────────────────────
  selectTask: (id: string | null) => void;
  clearError: () => void;
};

// ─── Helpers ────────────────────────────────────────────────
const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown task operation error.';

const getNextOrder = (tasks: Task[]): number => {
  const currentMax = tasks.reduce((max, task) => {
    if (typeof task.order !== 'number') {
      return max;
    }
    return Math.max(max, task.order);
  }, -1);
  return currentMax + 1;
};

const byOrderThenCreatedAt = (left: Task, right: Task): number => {
  const leftOrder = typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER;
  const rightOrder = typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftCreatedAt = left.createdAt ?? '';
  const rightCreatedAt = right.createdAt ?? '';
  return leftCreatedAt.localeCompare(rightCreatedAt);
};

// ─── Store ──────────────────────────────────────────────────
export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  isLoading: false,
  error: null,

  // ── Fetch ───────────────────────────────────────────────
  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await getUntask().tasks.list();
      set({ tasks: [...tasks].sort(byOrderThenCreatedAt), isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: toErrorMessage(e) });
    }
  },

  // ── Create (optimistic) ─────────────────────────────────
  createTask: async (input) => {
    const nextOrder = input.order ?? getNextOrder(get().tasks);
    const tempId = `_temp_${Date.now()}`;
    const tempTask: Task = {
      id: tempId,
      parentId: input.parentId ?? null,
      title: input.title,
      body: input.body ?? null,
      status: input.status ?? 'inbox',
      priority: input.priority ?? 'none',
      today: input.today ?? false,
      client: input.client ?? null,
      dueDate: input.dueDate ?? null,
      dueType: input.dueType ?? null,
      effort: input.effort ?? 'unknown',
      recurrence: input.recurrence ?? null,
      recurrenceSourceId: null,
      reminderOffset: input.reminderOffset ?? null,
      order: nextOrder,
      createdAt: new Date().toISOString(),
      completedAt: null,
      cancelledAt: null,
    };

    set((s) => ({ tasks: [...s.tasks, tempTask].sort(byOrderThenCreatedAt), error: null }));

    try {
      const created = await getUntask().tasks.create(input as Record<string, unknown>);
      set((s) => ({
        tasks: s.tasks
          .map((t) => (t.id === tempId ? created : t))
          .sort(byOrderThenCreatedAt),
      }));
      return created;
    } catch (e) {
      // Rollback: remove temp task
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== tempId),
        error: toErrorMessage(e),
      }));
      return null;
    }
  },

  // ── Update (optimistic) ─────────────────────────────────
  updateTask: async (input) => {
    const { id, ...updates } = input;
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    // Optimistic patch
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      error: null,
    }));

    try {
      const updated = await getUntask().tasks.update(input as Record<string, unknown>);
      set((s) => ({
        tasks: s.tasks
          .map((t) => (t.id === id ? updated : t))
          .sort(byOrderThenCreatedAt),
      }));
      return updated;
    } catch (e) {
      // Rollback to previous state
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        error: toErrorMessage(e),
      }));
      return null;
    }
  },

  // ── Delete (optimistic) ─────────────────────────────────
  deleteTask: async (id, cascade) => {
    const previousTasks = get().tasks;
    const deletedIndex = previousTasks.findIndex((task) => task.id === id);
    if (deletedIndex === -1) return false;

    const idsToRemove = new Set([id]);
    if (cascade) {
      for (const t of previousTasks) {
        if (t.parentId === id) idsToRemove.add(t.id);
      }
    }

    set((s) => ({
      tasks: s.tasks.filter((t) => !idsToRemove.has(t.id)),
      selectedTaskId: s.selectedTaskId && idsToRemove.has(s.selectedTaskId) ? null : s.selectedTaskId,
      error: null,
    }));

    try {
      await getUntask().tasks.delete(cascade ? { id, cascade: true } : id);
      useToastStore.getState().showToast('Task deleted', () => {
        void getUntask().tasks.undoLastUserAction();
      });
      return true;
    } catch (e) {
      set(() => ({
        tasks: previousTasks,
        error: toErrorMessage(e),
      }));
      return false;
    }
  },

  // ── Reorder (optimistic) ────────────────────────────────
  reorderTasks: async (ids) => {
    const prevTasks = get().tasks;
    const uniqueIds = new Set(ids);

    if (ids.length !== prevTasks.length) {
      set({
        error:
          'Task reorder requires a complete ordered ID list to avoid order drift.',
      });
      return false;
    }

    if (uniqueIds.size !== ids.length) {
      set({ error: 'Task reorder payload contains duplicate IDs.' });
      return false;
    }

    // Optimistic: reorder tasks array to match new ID order
    const taskMap = new Map(prevTasks.map((t) => [t.id, t]));
    const reordered: Task[] = [];
    for (let i = 0; i < ids.length; i++) {
      const task = taskMap.get(ids[i]);
      if (!task) {
        set({ error: `Task reorder payload contains unknown ID: ${ids[i]}` });
        return false;
      }
      reordered.push({ ...task, order: i });
    }

    set({ tasks: reordered, error: null });

    try {
      await getUntask().tasks.reorder(ids);
      return true;
    } catch (e) {
      // Rollback to previous order
      set({ tasks: prevTasks, error: toErrorMessage(e) });
      return false;
    }
  },

  // ── Complete (optimistic) ───────────────────────────────
  completeTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status: 'done' as const, completedAt: new Date().toISOString() }
          : t,
      ),
      error: null,
    }));

    try {
      const completed = await getUntask().tasks.complete(id);
      set((s) => ({
        tasks: s.tasks
          .map((t) => (t.id === id ? completed : t))
          .sort(byOrderThenCreatedAt),
      }));
      useToastStore.getState().showToast('Task completed', () => {
        void getUntask().tasks.undoLastUserAction();
      });
      return completed;
    } catch (e) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        error: toErrorMessage(e),
      }));
      return null;
    }
  },

  // ── Cancel (optimistic) ────────────────────────────────
  cancelTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status: 'cancelled' as const, cancelledAt: new Date().toISOString() }
          : t,
      ),
      error: null,
    }));

    try {
      const cancelled = await getUntask().tasks.cancel(id);
      set((s) => ({
        tasks: s.tasks
          .map((t) => (t.id === id ? cancelled : t))
          .sort(byOrderThenCreatedAt),
      }));
      useToastStore.getState().showToast('Task cancelled', () => {
        void getUntask().tasks.undoLastUserAction();
      });
      return cancelled;
    } catch (e) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        error: toErrorMessage(e),
      }));
      return null;
    }
  },

  // ── Reopen (optimistic) ───────────────────────────────
  reopenTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status: 'active' as const, completedAt: null, cancelledAt: null }
          : t,
      ),
      error: null,
    }));

    try {
      const reopened = await getUntask().tasks.reopen(id);
      set((s) => ({
        tasks: s.tasks
          .map((t) => (t.id === id ? reopened : t))
          .sort(byOrderThenCreatedAt),
      }));
      useToastStore.getState().showToast('Task reopened', () => {
        void getUntask().tasks.undoLastUserAction();
      });
      return reopened;
    } catch (e) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        error: toErrorMessage(e),
      }));
      return null;
    }
  },

  // ── Toggle today (optimistic) ───────────────────────────
  toggleToday: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, today: !t.today } : t,
      ),
      error: null,
    }));

    try {
      const toggled = await getUntask().tasks.toggleToday(id);
      set((s) => ({
        tasks: s.tasks
          .map((t) => (t.id === id ? toggled : t))
          .sort(byOrderThenCreatedAt),
      }));
      return toggled;
    } catch (e) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        error: toErrorMessage(e),
      }));
      return null;
    }
  },

  // ── UI ──────────────────────────────────────────────────
  selectTask: (id) => set({ selectedTaskId: id }),
  clearError: () => set({ error: null }),
}));

// ─── Selectors ──────────────────────────────────────────────
// IMPORTANT: Zustand v5 uses useSyncExternalStore directly — selectors that
// create new references (e.g. .filter(), .map()) will cause infinite re-renders
// unless consumed via useShallow from 'zustand/react/shallow'.
export const selectTasks = (s: TaskStore) => s.tasks;
export const selectIsLoading = (s: TaskStore) => s.isLoading;
export const selectError = (s: TaskStore) => s.error;
