import type { ChatTaskSummary } from '../../../types/chat';
import { cn } from '../../lib/utils';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-amber-400',
  low: 'text-blue-400',
};

const formatRelativeDue = (dueDate: string): string => {
  const due = new Date(dueDate + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays < 7) return `in ${diffDays}d`;

  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

type ChatTaskCardProps = {
  task: ChatTaskSummary;
  onClick: (taskId: string) => void;
};

export const ChatTaskCard = ({ task, onClick }: ChatTaskCardProps) => {
  const hasPriority = task.priority && task.priority !== 'none';
  const priorityColor = hasPriority ? PRIORITY_COLORS[task.priority!] ?? 'text-muted-foreground' : '';
  const isOverdue = task.dueDate && formatRelativeDue(task.dueDate).includes('overdue');

  return (
    <button
      type="button"
      onClick={() => onClick(task.id)}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors duration-100',
        'border-border/60 bg-card/40 hover:border-border hover:bg-card/70',
        'cursor-pointer',
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {hasPriority ? (
          <span className={cn('shrink-0 text-[10px]', priorityColor)} aria-hidden="true">●</span>
        ) : null}
        <span className="flex-1 truncate text-sm text-foreground/90">{task.title}</span>
        {task.dueDate ? (
          <span className={cn(
            'shrink-0 text-[11px]',
            isOverdue ? 'text-red-400' : 'text-muted-foreground/70',
          )}>
            {formatRelativeDue(task.dueDate)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1 ml-4 text-[11px] text-muted-foreground/60">
        {hasPriority ? <span>{task.priority}</span> : null}
        {hasPriority ? <span aria-hidden="true">·</span> : null}
        <span>{task.status}</span>
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
  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
  const remaining = tasks.length - MAX_VISIBLE_TASKS;

  return (
    <div className="flex flex-col gap-1">
      {visible.map((task) => (
        <ChatTaskCard key={task.id} task={task} onClick={onTaskClick} />
      ))}
      {remaining > 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground/50">
          and {remaining} more
        </p>
      ) : null}
    </div>
  );
};
