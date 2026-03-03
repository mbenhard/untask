import { useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Circle } from 'lucide-react';
import type { ChatTaskSummary } from '../../../types/chat';
import { getStatusLabel, isTerminalStatus, type PredefinedStatusId } from '../../../types/models';
import { heightVariants } from '../../lib/animation';
import { cn } from '../../lib/utils';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-amber-400',
  low: 'text-blue-400',
};

const formatRelativeDue = (dueDate: string): string => {
  const dateOnly = dueDate.replace(/T.*$/, '').replace(/Z$/, '');
  const due = new Date(dateOnly + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays < 7) return `in ${diffDays}d`;

  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatPriorityLabel = (priority: string): string =>
  priority
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

type ChatTaskCardProps = {
  task: ChatTaskSummary;
  onClick: (taskId: string) => void;
};

export const ChatTaskCard = ({ task, onClick }: ChatTaskCardProps) => {
  const priority = task.priority && task.priority !== 'none' ? task.priority : null;
  const hasPriority = Boolean(priority);
  const priorityColor = priority ? PRIORITY_COLORS[priority] ?? 'text-muted-foreground' : '';
  const dueLabel = task.dueDate ? formatRelativeDue(task.dueDate) : '';
  const isOverdue = dueLabel.includes('overdue');
  const isCompleted = isTerminalStatus(task.status as PredefinedStatusId);
  const statusLabel = getStatusLabel(task.status as PredefinedStatusId);
  const clientLabel = typeof task.client === 'string' ? task.client.trim() : '';

  return (
    <button
      type="button"
      onClick={() => onClick(task.id)}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors duration-100',
        isCompleted
          ? 'border-border/30 bg-card/20 opacity-60 hover:bg-card/30'
          : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/70',
        'cursor-pointer',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {isCompleted ? (
          <Check className="size-3 shrink-0 text-emerald-400" aria-hidden="true" />
        ) : (
          <Circle className="size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        )}
        <span className={cn(
          'flex-1 truncate text-sm text-foreground/90',
          isCompleted && 'line-through opacity-50',
        )}
        >
          {task.title}
        </span>
        {dueLabel ? (
          <span className={cn(
            'shrink-0 text-[11px]',
            isOverdue ? 'text-red-400' : 'text-muted-foreground/70',
          )}>
            {dueLabel}
          </span>
        ) : null}
      </div>
      <div className="ml-4 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground/60">
        {hasPriority ? <span className={cn('shrink-0 text-[10px]', priorityColor)} aria-hidden="true">●</span> : null}
        {priority ? <span>{formatPriorityLabel(priority)}</span> : null}
        {hasPriority ? <span aria-hidden="true">·</span> : null}
        <span>{statusLabel}</span>
        {clientLabel ? <span aria-hidden="true">·</span> : null}
        {clientLabel ? <span className="truncate">{clientLabel}</span> : null}
      </div>
    </button>
  );
};

type ChatTaskResultsProps = {
  tasks: ChatTaskSummary[];
  onTaskClick: (taskId: string) => void;
};

const MAX_VISIBLE_TASKS = 5;

export const ChatTaskResults = ({ tasks, onTaskClick }: ChatTaskResultsProps) => {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
  const overflow = tasks.slice(MAX_VISIBLE_TASKS);
  const remaining = tasks.length - MAX_VISIBLE_TASKS;

  return (
    <div className="flex flex-col gap-1">
      {visible.map((task) => (
        <ChatTaskCard key={task.id} task={task} onClick={onTaskClick} />
      ))}
      <AnimatePresence initial={false}>
        {expanded && overflow.length > 0 ? (
          <motion.div
            key="task-results-overflow"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1 flex flex-col gap-1">
              {overflow.map((task) => (
                <ChatTaskCard key={task.id} task={task} onClick={onTaskClick} />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="self-start px-1 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground/80"
        >
          {expanded ? 'Show less' : `Show ${remaining} more`}
        </button>
      ) : null}
    </div>
  );
};
