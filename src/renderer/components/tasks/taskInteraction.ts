import type { Task, TaskStatus, PredefinedStatusId } from '../../../types/models';
import { TERMINAL_STATUSES } from '../../../types/models';

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

/**
 * Cycles through enabled non-terminal statuses in user's custom order.
 * S on inbox → first enabled non-terminal.
 * S on terminal → first enabled non-terminal.
 */
export const getNextStatusInCycle = (
  current: Task['status'],
  enabledNonTerminal: PredefinedStatusId[],
): TaskStatus => {
  const status = current ?? 'active';

  // From inbox or terminal → jump to first enabled non-terminal
  if (
    status === 'inbox' ||
    TERMINAL_STATUSES.includes(status as PredefinedStatusId)
  ) {
    return enabledNonTerminal[0] ?? 'active';
  }

  const currentIndex = enabledNonTerminal.indexOf(status as PredefinedStatusId);
  if (currentIndex < 0) {
    return enabledNonTerminal[0] ?? 'active';
  }

  const nextIndex = (currentIndex + 1) % enabledNonTerminal.length;
  return enabledNonTerminal[nextIndex] ?? 'active';
};

/**
 * Checkbox toggle: check → done, uncheck → first enabled non-terminal.
 */
export const getStatusAfterToggleComplete = (
  current: Task['status'],
  firstEnabledNonTerminal: PredefinedStatusId,
): TaskStatus => {
  return current === 'done' ? firstEnabledNonTerminal : 'done';
};
