import { create } from 'zustand';

import type { Task } from '../../types/models';
import { toErrorMessage } from '../lib/errors';
import { getUntask } from '../lib/untask';
import { useToastStore } from './toastStore';

export type ReminderOffset = 'at_due' | '15m' | '1h' | '1d';
const REMINDER_OFFSETS: ReminderOffset[] = ['at_due', '15m', '1h', '1d'];

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
  refreshTasks: () => Promise<void>;
  createTask: (input: TaskCreateInput) => Promise<Task | null>;
  updateTask: (input: TaskUpdateInput) => Promise<Task | null>;
  deleteTask: (id: string, cascade?: boolean) => Promise<boolean>;
  reorderTasks: (ids: string[]) => Promise<boolean>;
  completeTask: (id: string, options?: { completeChildren?: boolean }) => Promise<Task | null>;
  cancelTask: (id: string) => Promise<Task | null>;
  reopenTask: (id: string) => Promise<Task | null>;
  toggleToday: (id: string) => Promise<Task | null>;

  // ── UI actions ──────────────────────────────────────────
  selectTask: (id: string | null) => void;
  clearError: () => void;
};

// ─── Stable key map for optimistic creates ──────────────────
// Maps realId → tempId so React keys survive the temp→real ID swap,
// preventing unmount/remount flash. Cleared on every full refresh.
const _stableKeyMap = new Map<string, string>();
let _latestTaskListRequestId = 0;
let _tempTaskIdCounter = 0;

/** Returns a stable React key for a task, bridging optimistic temp IDs to real IDs. */
export const getStableKey = (taskId: string): string =>
  _stableKeyMap.get(taskId) ?? taskId;

// ─── Helpers ────────────────────────────────────────────────
const getMinOrder = (tasks: Task[]): number => {
  const currentMin = tasks.reduce((min, task) => {
    if (typeof task.order !== 'number') {
      return min;
    }
    return Math.min(min, task.order);
  }, Number.MAX_SAFE_INTEGER);
  return currentMin === Number.MAX_SAFE_INTEGER ? 0 : currentMin - 1;
};

const getMaxOrder = (tasks: Task[]): number => {
  const currentMax = tasks.reduce((max, task) => {
    if (typeof task.order !== 'number') {
      return max;
    }
    return Math.max(max, task.order);
  }, Number.MIN_SAFE_INTEGER);
  return currentMax === Number.MIN_SAFE_INTEGER ? 0 : currentMax + 1;
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

const sortTaskList = (tasks: Task[]): Task[] => [...tasks].sort(byOrderThenCreatedAt);

const replaceTaskAndSort = (
  tasks: Task[],
  matchId: string,
  replacement: Task,
): Task[] =>
  sortTaskList(tasks.map((task) => (task.id === matchId ? replacement : task)));

const patchTaskById = (
  tasks: Task[],
  taskId: string,
  patch: Partial<Task>,
): Task[] =>
  tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task));

const buildChildrenByParent = (tasks: Task[]): Map<string, string[]> => {
  const byParent = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }
    const current = byParent.get(task.parentId);
    if (current) {
      current.push(task.id);
    } else {
      byParent.set(task.parentId, [task.id]);
    }
  }
  return byParent;
};

const collectTaskAndDescendantIds = (tasks: Task[], rootId: string): Set<string> => {
  const ids = new Set<string>();
  const byParent = buildChildrenByParent(tasks);
  const stack = [rootId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || ids.has(currentId)) {
      continue;
    }
    ids.add(currentId);
    const children = byParent.get(currentId);
    if (children) {
      for (const childId of children) {
        stack.push(childId);
      }
    }
  }

  return ids;
};

const resolveDefaultReminderOffset = async (): Promise<ReminderOffset> => {
  try {
    const raw = await getUntask().settings.get('notifications.default_offset');
    if (raw && REMINDER_OFFSETS.includes(raw as ReminderOffset)) {
      return raw as ReminderOffset;
    }
  } catch {
    // Fall back to at_due when settings are unavailable.
  }
  return 'at_due';
};

const markDoneForTaskAndDescendants = (
  tasks: Task[],
  rootId: string,
  completedAt: string,
): Task[] => {
  const idsToMark = collectTaskAndDescendantIds(tasks, rootId);
  return tasks.map((task) => {
    if (!idsToMark.has(task.id)) {
      return task;
    }
    return {
      ...task,
      status: 'done' as const,
      completedAt,
      cancelledAt: null,
    };
  });
};

const loadTasks = async (
  set: (partial:
    | Partial<TaskStore>
    | ((state: TaskStore) => Partial<TaskStore>)
  ) => void,
  mode: 'fetch' | 'refresh',
): Promise<void> => {
  const requestId = ++_latestTaskListRequestId;
  if (mode === 'fetch') {
    set({ isLoading: true, error: null });
  }

  try {
    const tasks = await getUntask().tasks.list();
    if (requestId !== _latestTaskListRequestId) {
      return;
    }
    _stableKeyMap.clear();
    set((state) => {
      const sortedTasks = sortTaskList(tasks);
      const selectedTaskId = state.selectedTaskId;
      const hasSelectedTask = selectedTaskId
        ? sortedTasks.some((task) => task.id === selectedTaskId)
        : true;

      return {
        tasks: sortedTasks,
        selectedTaskId: hasSelectedTask ? selectedTaskId : null,
        isLoading: false,
        error: null,
      };
    });
  } catch (e) {
    if (requestId !== _latestTaskListRequestId) {
      return;
    }
    set({
      isLoading: false,
      error: toErrorMessage(e, 'Unknown task operation error.'),
    });
  }
};

const showUndoToastAndRefresh = (
  label: string,
  refreshTasks: () => Promise<void>,
): void => {
  useToastStore.getState().showToast(label, async () => {
    await getUntask().tasks.undoLastUserAction();
    await refreshTasks();
  });
};

const createOptimisticTempTaskId = (): string => {
  _tempTaskIdCounter += 1;
  return `_temp_${Date.now()}_${_tempTaskIdCounter}`;
};

// ─── Store ──────────────────────────────────────────────────
export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  isLoading: false,
  error: null,

  // ── Fetch ───────────────────────────────────────────────
  fetchTasks: async () => loadTasks(set, 'fetch'),

  refreshTasks: async () => loadTasks(set, 'refresh'),

  // ── Create (optimistic) ─────────────────────────────────
  createTask: async (input) => {
    // Auto-populate reminderOffset from default setting when dueDate is set
    const resolvedReminderOffset =
      input.dueDate && input.reminderOffset === undefined
        ? await resolveDefaultReminderOffset()
        : input.reminderOffset;

    const nextOrder = input.order ?? (input.parentId ? getMaxOrder(get().tasks) : getMinOrder(get().tasks));
    const tempId = createOptimisticTempTaskId();
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
      recurrence: input.recurrence ?? null,
      recurrenceSourceId: null,
      reminderOffset: resolvedReminderOffset ?? null,
      order: nextOrder,
      createdAt: new Date().toISOString(),
      completedAt: null,
      cancelledAt: null,
    };

    set((s) => ({ tasks: sortTaskList([...s.tasks, tempTask]), error: null }));

    try {
      const created = await getUntask().tasks.create({
        ...input,
        reminderOffset: resolvedReminderOffset,
        order: nextOrder,
      } as Record<string, unknown>);
      // Bridge the temp→real ID so React keys stay stable (no unmount/remount flash).
      _stableKeyMap.set(created.id, tempId);
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, tempId, created),
      }));
      return created;
    } catch (e) {
      // Rollback: remove temp task
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== tempId),
        error: toErrorMessage(e, 'Unknown task operation error.'),
      }));
      return null;
    }
  },

  // ── Update (optimistic) ─────────────────────────────────
  updateTask: async (input) => {
    const { id, ...updates } = input;
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    const resolvedUpdates = { ...updates };
    // Auto-populate reminderOffset when adding a due date to a task that had none
    if (resolvedUpdates.dueDate && !prev.dueDate && resolvedUpdates.reminderOffset === undefined) {
      resolvedUpdates.reminderOffset = await resolveDefaultReminderOffset();
    }

    // Optimistic patch
    set((s) => ({
      tasks: patchTaskById(s.tasks, id, resolvedUpdates),
      error: null,
    }));

    try {
      const updated = await getUntask().tasks.update({ id, ...resolvedUpdates } as Record<string, unknown>);
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, updated),
      }));
      return updated;
    } catch (e) {
      // Rollback to previous state
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, prev),
        error: toErrorMessage(e, 'Unknown task operation error.'),
      }));
      return null;
    }
  },

  // ── Delete (optimistic) ─────────────────────────────────
  deleteTask: async (id, cascade) => {
    const previousTasks = get().tasks;
    const previousSelectedTaskId = get().selectedTaskId;
    if (!previousTasks.some((task) => task.id === id)) return false;

    const idsToRemove = new Set([id]);
    if (cascade) {
      const cascaded = collectTaskAndDescendantIds(previousTasks, id);
      for (const cascadedId of cascaded) {
        idsToRemove.add(cascadedId);
      }
    }

    set((s) => ({
      tasks: s.tasks.filter((t) => !idsToRemove.has(t.id)),
      selectedTaskId: s.selectedTaskId && idsToRemove.has(s.selectedTaskId) ? null : s.selectedTaskId,
      error: null,
    }));

    try {
      await getUntask().tasks.delete(cascade ? { id, cascade: true } : id);
      showUndoToastAndRefresh('Task deleted', get().refreshTasks);
      return true;
    } catch (e) {
      set(() => ({
        tasks: previousTasks,
        selectedTaskId: previousSelectedTaskId,
        error: toErrorMessage(e, 'Unknown task operation error.'),
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
      set({ tasks: prevTasks, error: toErrorMessage(e, 'Unknown task operation error.') });
      return false;
    }
  },

  // ── Complete (optimistic) ───────────────────────────────
  completeTask: async (id, options?: { completeChildren?: boolean }) => {
    const previousTasks = get().tasks;
    const prev = previousTasks.find((t) => t.id === id);
    if (!prev) return null;

    const completedAt = new Date().toISOString();
    const optimisticTasks = options?.completeChildren
      ? markDoneForTaskAndDescendants(previousTasks, id, completedAt)
      : patchTaskById(previousTasks, id, {
        status: 'done',
        completedAt,
        cancelledAt: null,
      });

    set({
      tasks: optimisticTasks,
      error: null,
    });

    try {
      const completed = await getUntask().tasks.complete(
        options?.completeChildren ? { id, completeChildren: true } : id,
      );
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, completed),
      }));
      showUndoToastAndRefresh('Task completed', get().refreshTasks);
      return completed;
    } catch (e) {
      set(() => ({
        tasks: previousTasks,
        error: toErrorMessage(e, 'Unknown task operation error.'),
      }));
      return null;
    }
  },

  // ── Cancel (optimistic) ────────────────────────────────
  cancelTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: patchTaskById(s.tasks, id, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      }),
      error: null,
    }));

    try {
      const cancelled = await getUntask().tasks.cancel(id);
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, cancelled),
      }));
      showUndoToastAndRefresh('Task cancelled', get().refreshTasks);
      return cancelled;
    } catch (e) {
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, prev),
        error: toErrorMessage(e, 'Unknown task operation error.'),
      }));
      return null;
    }
  },

  // ── Reopen (optimistic) ───────────────────────────────
  reopenTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: patchTaskById(s.tasks, id, {
        status: 'active',
        completedAt: null,
        cancelledAt: null,
      }),
      error: null,
    }));

    try {
      const reopened = await getUntask().tasks.reopen(id);
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, reopened),
      }));
      showUndoToastAndRefresh('Task reopened', get().refreshTasks);
      return reopened;
    } catch (e) {
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, prev),
        error: toErrorMessage(e, 'Unknown task operation error.'),
      }));
      return null;
    }
  },

  // ── Toggle today (optimistic) ───────────────────────────
  toggleToday: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return null;

    set((s) => ({
      tasks: patchTaskById(s.tasks, id, { today: !prev.today }),
      error: null,
    }));

    try {
      const toggled = await getUntask().tasks.toggleToday(id);
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, toggled),
      }));
      return toggled;
    } catch (e) {
      set((s) => ({
        tasks: replaceTaskAndSort(s.tasks, id, prev),
        error: toErrorMessage(e, 'Unknown task operation error.'),
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
export const selectError = (s: TaskStore) => s.error;

// ─── Eager initial fetch ────────────────────────────────────
// Fire at module load so data is ready before React's first paint.
// Uses 'refresh' mode (no isLoading flash). Guard for test environments.
if (typeof window !== 'undefined' && window.untask) {
  void loadTasks(useTaskStore.setState, 'refresh');
}
