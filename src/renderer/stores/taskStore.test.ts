import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../types/models';
import { useTaskStore } from './taskStore';
import { useToastStore } from './toastStore';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeTask = (id: string, overrides?: Partial<Task>): Task => ({
  id,
  parentId: null,
  title: id,
  body: null,
  status: 'active',
  priority: 'none',
  today: false,
  client: null,
  dueDate: null,
  dueType: null,
  effort: 'unknown',
  recurrence: null,
  recurrenceSourceId: null,
  reminderOffset: null,
  order: 0,
  createdAt: '2026-02-23T00:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  ...overrides,
});

type MockTasksApi = {
  list: ReturnType<typeof vi.fn<() => Promise<Task[]>>>;
  create: ReturnType<typeof vi.fn<(payload: Record<string, unknown>) => Promise<Task>>>;
  update: ReturnType<typeof vi.fn<(payload: Record<string, unknown>) => Promise<Task>>>;
  delete: ReturnType<typeof vi.fn<(payload: string | { id: string; cascade?: boolean }) => Promise<void>>>;
  reorder: ReturnType<typeof vi.fn<(ids: string[]) => Promise<void>>>;
  complete: ReturnType<typeof vi.fn<(payload: string | { id: string; completeChildren?: boolean }) => Promise<Task>>>;
  cancel: ReturnType<typeof vi.fn<(id: string) => Promise<Task>>>;
  reopen: ReturnType<typeof vi.fn<(id: string) => Promise<Task>>>;
  toggleToday: ReturnType<typeof vi.fn<(id: string) => Promise<Task>>>;
  undoLastUserAction: ReturnType<typeof vi.fn<() => Promise<{ ok: true; undone: false }>>>;
};

const createMockTasksApi = (): MockTasksApi => ({
  list: vi.fn(async () => []),
  create: vi.fn(async () => makeTask('new')),
  update: vi.fn(async () => makeTask('updated')),
  delete: vi.fn(async () => undefined),
  reorder: vi.fn(async () => undefined),
  complete: vi.fn(async () => makeTask('completed', { status: 'done', completedAt: new Date().toISOString() })),
  cancel: vi.fn(async (id: string) => makeTask(id, { status: 'cancelled', cancelledAt: new Date().toISOString() })),
  reopen: vi.fn(async (id: string) => makeTask(id, { status: 'active', completedAt: null, cancelledAt: null })),
  toggleToday: vi.fn(async (id: string) => makeTask(id, { today: true })),
  undoLastUserAction: vi.fn(async () => ({ ok: true, undone: false })),
});

const getMockTasksApi = (): MockTasksApi =>
  ((globalThis as { window?: unknown }).window as {
    untask: {
      tasks: MockTasksApi;
    };
  }).untask.tasks;

describe('taskStore edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    const tasks = createMockTasksApi();
    const settingsGet = vi.fn(async () => null);

    (globalThis as { window?: unknown }).window = {
      untask: {
        tasks,
        settings: {
          get: settingsGet,
        },
      },
    };

    useTaskStore.setState({
      tasks: [],
      selectedTaskId: null,
      isLoading: true,
      error: null,
    });

    useToastStore.setState({
      toast: null,
      isUndoing: false,
      showToast: vi.fn(),
      clearToast: vi.fn(),
      markUndoing: vi.fn(),
    });
  });

  it('optimistically removes full descendant tree for cascade delete', async () => {
    const api = getMockTasksApi();
    const deleteDeferred = deferred<void>();
    api.delete.mockImplementationOnce(() => deleteDeferred.promise);

    useTaskStore.setState({
      tasks: [
        makeTask('root'),
        makeTask('child', { parentId: 'root' }),
        makeTask('grandchild', { parentId: 'child' }),
        makeTask('sibling'),
      ],
      selectedTaskId: 'grandchild',
      isLoading: false,
      error: null,
    });

    const deletePromise = useTaskStore.getState().deleteTask('root', true);

    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(['sibling']);
    expect(useTaskStore.getState().selectedTaskId).toBeNull();

    deleteDeferred.resolve();
    await expect(deletePromise).resolves.toBe(true);
    expect(api.delete).toHaveBeenCalledWith({ id: 'root', cascade: true });
  });

  it('restores selected task on cascade delete failure rollback', async () => {
    const api = getMockTasksApi();
    const deleteDeferred = deferred<void>();
    api.delete.mockImplementationOnce(() => deleteDeferred.promise);

    useTaskStore.setState({
      tasks: [
        makeTask('root'),
        makeTask('child', { parentId: 'root' }),
      ],
      selectedTaskId: 'child',
      isLoading: false,
      error: null,
    });

    const deletePromise = useTaskStore.getState().deleteTask('root', true);
    expect(useTaskStore.getState().selectedTaskId).toBeNull();

    deleteDeferred.reject(new Error('delete failed'));
    await expect(deletePromise).resolves.toBe(false);

    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(['root', 'child']);
    expect(useTaskStore.getState().selectedTaskId).toBe('child');
    expect(useTaskStore.getState().error).toContain('delete failed');
  });

  it('marks descendants done optimistically when completing with completeChildren', async () => {
    const api = getMockTasksApi();
    const completeDeferred = deferred<Task>();
    api.complete.mockImplementationOnce(() => completeDeferred.promise);

    useTaskStore.setState({
      tasks: [
        makeTask('root'),
        makeTask('child', { parentId: 'root' }),
      ],
      selectedTaskId: null,
      isLoading: false,
      error: null,
    });

    const completePromise = useTaskStore.getState().completeTask('root', { completeChildren: true });

    expect(useTaskStore.getState().tasks.every((task) => task.status === 'done')).toBe(true);

    completeDeferred.resolve(makeTask('root', { status: 'done', completedAt: '2026-02-23T10:00:00.000Z' }));
    await expect(completePromise).resolves.toEqual(
      makeTask('root', { status: 'done', completedAt: '2026-02-23T10:00:00.000Z' }),
    );
  });

  it('rolls back optimistic completeChildren update on main-process failure', async () => {
    const api = getMockTasksApi();
    const completeDeferred = deferred<Task>();
    api.complete.mockImplementationOnce(() => completeDeferred.promise);

    useTaskStore.setState({
      tasks: [
        makeTask('root'),
        makeTask('child', { parentId: 'root' }),
      ],
      selectedTaskId: null,
      isLoading: false,
      error: null,
    });

    const completePromise = useTaskStore.getState().completeTask('root', { completeChildren: true });
    expect(useTaskStore.getState().tasks.every((task) => task.status === 'done')).toBe(true);

    completeDeferred.reject(new Error('complete failed'));
    await expect(completePromise).resolves.toBeNull();

    expect(useTaskStore.getState().tasks.every((task) => task.status === 'active')).toBe(true);
    expect(useTaskStore.getState().error).toContain('complete failed');
  });

  it('ignores stale list responses when fetch and refresh resolve out of order', async () => {
    const api = getMockTasksApi();
    const first = deferred<Task[]>();
    const second = deferred<Task[]>();

    api.list.mockImplementationOnce(() => first.promise);
    api.list.mockImplementationOnce(() => second.promise);

    const fetchPromise = useTaskStore.getState().fetchTasks();
    const refreshPromise = useTaskStore.getState().refreshTasks();

    second.resolve([makeTask('newest')]);
    await refreshPromise;

    first.resolve([makeTask('stale')]);
    await fetchPromise;

    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(['newest']);
    expect(useTaskStore.getState().isLoading).toBe(false);
  });

  it('clears selected task when refresh result no longer contains selected id', async () => {
    const api = getMockTasksApi();
    api.list.mockResolvedValueOnce([makeTask('task-1')]);

    useTaskStore.setState({
      tasks: [makeTask('selected-task')],
      selectedTaskId: 'selected-task',
      isLoading: false,
      error: null,
    });

    await useTaskStore.getState().refreshTasks();

    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(['task-1']);
    expect(useTaskStore.getState().selectedTaskId).toBeNull();
  });

  it('creates unique optimistic temp IDs when two tasks are created in the same millisecond', async () => {
    const api = getMockTasksApi();
    const firstCreate = deferred<Task>();
    const secondCreate = deferred<Task>();
    api.create
      .mockImplementationOnce(() => firstCreate.promise)
      .mockImplementationOnce(() => secondCreate.promise);
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const firstPromise = useTaskStore.getState().createTask({ title: 'First' });
    const secondPromise = useTaskStore.getState().createTask({ title: 'Second' });

    const optimisticIds = useTaskStore.getState().tasks.map((task) => task.id);
    expect(optimisticIds).toHaveLength(2);
    expect(new Set(optimisticIds).size).toBe(2);

    firstCreate.resolve(makeTask('server-1', { title: 'First' }));
    secondCreate.resolve(makeTask('server-2', { title: 'Second' }));

    await expect(firstPromise).resolves.toMatchObject({ id: 'server-1' });
    await expect(secondPromise).resolves.toMatchObject({ id: 'server-2' });
  });
});
