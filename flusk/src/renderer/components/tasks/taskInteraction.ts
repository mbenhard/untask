import type { Task, TaskStatus } from '../../../types/models';

const PRIORITY_CYCLE: Array<NonNullable<Task['priority']>> = [
  'none',
  'low',
  'medium',
  'high',
];

export const getNextPriority = (
  current: Task['priority'],
): NonNullable<Task['priority']> => {
  const normalized = current ?? 'none';
  const currentIndex = PRIORITY_CYCLE.indexOf(normalized);
  if (currentIndex < 0) {
    return 'none';
  }

  return PRIORITY_CYCLE[(currentIndex + 1) % PRIORITY_CYCLE.length] ?? 'none';
};

export const getNextStatusInCycle = (
  current: Task['status'],
): TaskStatus => {
  const status = current ?? 'active';

  if (status === 'inbox') {
    return 'active';
  }

  if (status === 'active') {
    return 'in_progress';
  }

  if (status === 'in_progress') {
    return 'waiting';
  }

  if (status === 'waiting') {
    return 'done';
  }

  return 'active';
};

export const getStatusAfterToggleComplete = (
  current: Task['status'],
): TaskStatus => {
  return current === 'done' ? 'active' : 'done';
};
