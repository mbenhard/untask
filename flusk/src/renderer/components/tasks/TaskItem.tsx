import { type CSSProperties, useEffect, useMemo, useState } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Check, GripVertical, Pencil, Sun } from 'lucide-react';

import type { Task, TaskStatus } from '../../../types/models';
import { cn } from '../../lib/utils';
import { useTaskStore } from '../../stores/taskStore';
import { getNextPriority } from './taskInteraction';
import { TaskBody } from './TaskBody';

export interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  isFocused: boolean;
  isEditingTitle: boolean;
  onStartTitleEdit: (id: string) => void;
  onEndTitleEdit: () => void;
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onBodyEditModeChange?: (editing: boolean) => void;
  onFocus?: () => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const formatDueDate = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const PRIORITY_CLASSNAME: Record<NonNullable<Task['priority']>, string> = {
  none: 'border-border bg-transparent',
  low: 'border-emerald-500/60 bg-emerald-500/20',
  medium: 'border-amber-500/70 bg-amber-500/30',
  high: 'border-rose-500/80 bg-rose-500/40',
};

export const TaskItem = ({
  task,
  isExpanded,
  isFocused,
  isEditingTitle,
  onStartTitleEdit,
  onEndTitleEdit,
  onToggleExpand,
  onComplete,
  onToggleToday,
  onBodyEditModeChange,
  onFocus,
}: TaskItemProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [clientDraft, setClientDraft] = useState(task.client ?? '');
  const [dueDateDraft, setDueDateDraft] = useState(task.dueDate ?? '');
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);

  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  useEffect(() => {
    if (!isEditingClient) {
      setClientDraft(task.client ?? '');
    }
  }, [isEditingClient, task.client]);

  useEffect(() => {
    if (!isEditingDueDate) {
      setDueDateDraft(task.dueDate ?? '');
    }
  }, [isEditingDueDate, task.dueDate]);

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

  const isCompleted = task.status === 'done';
  const isToday = task.today === true;
  const priority = task.priority ?? 'none';
  const status = task.status ?? 'active';

  const completedAtLabel = useMemo(() => {
    if (!task.completedAt) {
      return null;
    }

    const date = new Date(task.completedAt);
    if (Number.isNaN(date.getTime())) {
      return task.completedAt;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }, [task.completedAt]);

  const saveTitleDraft = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      void updateTask({ id: task.id, title: trimmed });
    } else {
      setTitleDraft(task.title);
    }
    onEndTitleEdit();
  };

  const cancelTitleEdit = () => {
    setTitleDraft(task.title);
    onEndTitleEdit();
  };

  const saveClient = () => {
    void updateTask({ id: task.id, client: clientDraft.trim() || null });
    setIsEditingClient(false);
  };

  const saveDueDate = () => {
    void updateTask({ id: task.id, dueDate: dueDateDraft.trim() || null });
    setIsEditingDueDate(false);
  };

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
        'overflow-hidden border-b border-border/40 outline-none transition-colors duration-100',
        isFocused && 'bg-accent/20',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <div
        onClick={() => onToggleExpand(task.id)}
        className="group flex min-h-10 items-center gap-2 px-1.5"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onComplete(task.id);
          }}
          aria-label={
            isCompleted
              ? `Reopen "${task.title}"`
              : `Mark "${task.title}" complete`
          }
          className="inline-flex size-5 items-center justify-center text-foreground/90 outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <motion.span
            initial={false}
            animate={{
              scale: isCompleted ? 1 : 0.9,
              backgroundColor: isCompleted ? 'var(--foreground)' : 'transparent',
              borderColor: isCompleted ? 'var(--foreground)' : 'var(--border)',
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="inline-flex size-4 items-center justify-center border"
          >
            <Check
              className={cn(
                'size-3 transition-opacity duration-300',
                isCompleted ? 'opacity-100 text-background' : 'opacity-0',
              )}
            />
          </motion.span>
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            const nextPriority = getNextPriority(task.priority);
            void updateTask({ id: task.id, priority: nextPriority });
          }}
          aria-label={`Cycle priority for "${task.title}"`}
          className="inline-flex size-4 items-center justify-center outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span
            className={cn(
              'inline-flex size-2.5 rounded-full border',
              PRIORITY_CLASSNAME[priority],
            )}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveTitleDraft();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTitleEdit();
                  }
                  event.stopPropagation();
                }}
                onBlur={saveTitleDraft}
                onClick={(event) => event.stopPropagation()}
                className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-foreground outline-none ring-1 ring-ring px-1"
              />
            ) : (
              <>
                <p
                  className={cn(
                    'truncate text-[13px] text-foreground',
                    isCompleted && 'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {isEditingClient ? (
            <input
              autoFocus
              type="text"
              value={clientDraft}
              onChange={(event) => setClientDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveClient();
                  return;
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  setClientDraft(task.client ?? '');
                  setIsEditingClient(false);
                }
              }}
              onBlur={saveClient}
              onClick={(event) => event.stopPropagation()}
              className="h-6 w-24 rounded border border-border bg-transparent px-1.5 text-[11px] text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Client"
              aria-label="Client"
            />
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsEditingClient(true);
              }}
              className={cn(
                'h-6 rounded border px-1.5 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
                task.client
                  ? 'border-border bg-muted text-muted-foreground hover:text-foreground'
                  : 'border-dashed border-border text-muted-foreground hover:text-foreground',
              )}
              aria-label={task.client ? 'Edit client' : 'Add client'}
            >
              {task.client ? `@${task.client}` : '+ Client'}
            </button>
          )}

          {isEditingDueDate ? (
            <input
              autoFocus
              type="date"
              value={dueDateDraft}
              onChange={(event) => setDueDateDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveDueDate();
                  return;
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDueDateDraft(task.dueDate ?? '');
                  setIsEditingDueDate(false);
                }
              }}
              onBlur={saveDueDate}
              onClick={(event) => event.stopPropagation()}
              className="h-6 rounded border border-border bg-transparent px-1 text-[11px] text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Due date"
            />
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsEditingDueDate(true);
              }}
              className={cn(
                'h-6 rounded border px-1.5 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
                task.dueDate
                  ? 'border-border bg-muted text-muted-foreground hover:text-foreground'
                  : 'border-dashed border-border text-muted-foreground hover:text-foreground',
              )}
              aria-label={task.dueDate ? 'Edit due date' : 'Add due date'}
            >
              {task.dueDate ? formatDueDate(task.dueDate) : '+ Due'}
            </button>
          )}

          <select
            value={status}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation();
              const nextStatus = event.target.value as TaskStatus;
              if (nextStatus === status) {
                return;
              }

              if (nextStatus === 'done') {
                onComplete(task.id);
                return;
              }

              void updateTask({ id: task.id, status: nextStatus });
            }}
            className="h-6 rounded border border-border bg-transparent px-1.5 text-[11px] text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Status"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {isCompleted && completedAtLabel ? (
            <span className="text-[11px] text-muted-foreground">{completedAtLabel}</span>
          ) : null}

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartTitleEdit(task.id);
            }}
            className="hidden size-5 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:text-foreground focus-visible:flex focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`Edit title for "${task.title}"`}
          >
            <Pencil className="size-3" />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleToday(task.id);
            }}
            aria-label={`Toggle today for "${task.title}"`}
            className={cn(
              'inline-flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
              isToday
                ? 'text-foreground'
                : 'hover:text-foreground',
            )}
          >
            <Sun className="size-3.5" />
          </button>

          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => {
              event.stopPropagation();
            }}
            aria-label={`Reorder "${task.title}"`}
            className="inline-flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <GripVertical className="size-3.5" />
          </button>
        </div>
      </div>

      <TaskBody
        task={task}
        isExpanded={isExpanded}
        onBodyEditModeChange={onBodyEditModeChange}
      />
    </div>
  );
};
