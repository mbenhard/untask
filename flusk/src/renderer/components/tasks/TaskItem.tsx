import type { CSSProperties } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Check, GripVertical, Sun } from 'lucide-react';

import type { Task } from '../../../types/models';
import { cn } from '../../lib/utils';
import { TaskBody } from './TaskBody';

const PRIORITY_INDICATOR_CLASS: Record<'none' | 'low' | 'medium' | 'high', string> = {
  none: 'bg-transparent',
  low: 'bg-border',
  medium: 'bg-muted-foreground/70',
  high: 'bg-foreground',
};

export interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  isFocused: boolean;
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onBodyEditModeChange?: (editing: boolean) => void;
  onFocus?: () => void;
}

export const TaskItem = ({
  task,
  isExpanded,
  isFocused,
  onToggleExpand,
  onComplete,
  onToggleToday,
  onBodyEditModeChange,
  onFocus,
}: TaskItemProps): JSX.Element => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = task.priority ?? 'none';
  const isCompleted = task.status === 'done';
  const isToday = task.today === true;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      role="option"
      aria-selected={isExpanded}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      className={cn(
        'overflow-hidden rounded-md border border-border/80 bg-card/60 outline-none transition-colors duration-100 hover:bg-accent/40',
        isFocused && 'ring-1 ring-ring',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      <div
        onClick={() => onToggleExpand(task.id)}
        className="flex min-h-11 items-center gap-2 px-2"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-6 w-0.5 rounded-full',
            PRIORITY_INDICATOR_CLASS[priority],
          )}
        />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onComplete(task.id);
          }}
          aria-label={`Mark "${task.title}" complete`}
          className="inline-flex size-5 items-center justify-center rounded-sm text-foreground/90 outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
        >
          <motion.span
            initial={false}
            animate={{
              scale: isCompleted ? 1 : 0.9,
              backgroundColor: isCompleted ? 'var(--foreground)' : 'transparent',
              borderColor: isCompleted ? 'var(--foreground)' : 'var(--border)',
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="inline-flex size-4 items-center justify-center rounded-sm border"
          >
            <Check
              className={cn(
                'size-3 transition-opacity duration-300',
                isCompleted ? 'opacity-100 text-background' : 'opacity-0',
              )}
            />
          </motion.span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                'truncate text-sm text-foreground',
                isCompleted && 'text-muted-foreground line-through',
              )}
            >
              {task.title}
            </p>
            {task.client ? (
              <span className="rounded-sm border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {task.client}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleToday(task.id);
          }}
          aria-label={`Toggle today for "${task.title}"`}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
            isToday
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <Sun className="size-3" />
          Today
        </button>

        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(event) => {
            event.stopPropagation();
          }}
          aria-label={`Reorder "${task.title}"`}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      <TaskBody
        task={task}
        isExpanded={isExpanded}
        onBodyEditModeChange={onBodyEditModeChange}
      />
    </div>
  );
};
