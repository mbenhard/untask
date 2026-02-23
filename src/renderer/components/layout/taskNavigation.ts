import type { Task } from '../../../types/models';

export type TaskNavigationView = 'inbox' | 'today' | 'tasks';

export const resolveTaskNavigationView = (
  task: Task | undefined,
): TaskNavigationView => {
  if (!task) {
    return 'tasks';
  }

  if (task.status === 'inbox') {
    return 'inbox';
  }

  if (task.today) {
    return 'today';
  }

  return 'tasks';
};

export const findTaskForNavigation = async (
  taskId: string,
  getTasks: () => Task[],
  refreshTasks: () => Promise<void>,
): Promise<Task | undefined> => {
  const existing = getTasks().find((task) => task.id === taskId);
  if (existing) {
    return existing;
  }

  await refreshTasks();
  return getTasks().find((task) => task.id === taskId);
};
