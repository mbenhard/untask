import type { Task } from '../../types/models';

export const PRIORITY_DOT: Record<NonNullable<Task['priority']>, string> = {
  none: 'bg-foreground/15',
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-rose-500',
};

export const PRIORITY_LABEL: Record<NonNullable<Task['priority']>, string> = {
  none: 'priority',
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

export const SEGMENT =
  'inline-flex items-center py-1 -my-1 cursor-pointer transition-colors duration-150 hover:text-foreground focus-visible:bg-accent/30 focus-visible:rounded-sm focus-visible:px-1 focus-visible:-mx-1 outline-none';

export const SEGMENT_EMPTY = 'text-muted-foreground/50';
