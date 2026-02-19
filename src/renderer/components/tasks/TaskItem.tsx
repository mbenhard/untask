import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { AlignLeft, ArrowRightLeft, Ban, Bookmark, Check, ChevronDown, Copy, FolderInput, GripVertical, Trash2 } from 'lucide-react';

import type { Task } from '../../../types/models';
import { TERMINAL_STATUSES, type PredefinedStatusId } from '../../../types/models';
import { cn } from '../../lib/utils';
import { useTaskStatusConfigStore } from '../../stores/taskStatusConfigStore';
import { type TaskUpdateInput, useTaskStore } from '../../stores/taskStore';
import { Popover, PopoverContent, Tooltip, TooltipContent, TooltipTrigger } from '../ui';
import { formatDueDateDisplay, isDueDateOverdue } from './dueDate';
import { getNextPriority } from './taskInteraction';

export interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  isFocused: boolean;
  isEditingTitle: boolean;
  isNavigatedTo: boolean;
  hasChildren: boolean;
  childrenCount: number;
  childrenDoneCount: number;
  onStartTitleEdit: (id: string) => void;
  onEndTitleEdit: () => void;
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onFocus?: () => void;
  children?: ReactNode;
}

const PRIORITY_DOT: Record<NonNullable<Task['priority']>, string> = {
  none: 'bg-foreground/15',
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-rose-500',
};

const SORTABLE_TRANSITION = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export const TaskItem = ({
  task,
  isExpanded,
  isFocused,
  isEditingTitle,
  isNavigatedTo,
  hasChildren,
  childrenCount,
  childrenDoneCount,
  onStartTitleEdit,
  onEndTitleEdit,
  onToggleExpand,
  onComplete,
  onToggleToday,
  onFocus,
  children,
}: TaskItemProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const createTask = useTaskStore((state) => state.createTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const cancelTask = useTaskStore((state) => state.cancelTask);
  const allTasks = useTaskStore((state) => state.tasks);
  const enabledStatuses = useTaskStatusConfigStore((s) => s.config.enabled);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'projects' | 'delete-confirm'>('main');

  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    transition: SORTABLE_TRANSITION,
    animateLayoutChanges: (args) => {
      // If sorting or dragging, use standard dnd-kit behavior (which animates moves and container changes)
      if (args.isSorting || args.wasDragging) {
        return true;
      }
      // If moving between containers without dragging (e.g., button click to Complete),
      // DO NOT animate, otherwise the item visually flies across the screen.
      if (args.previousContainerId && args.containerId !== args.previousContainerId) {
        return false;
      }
      // Animate sibling items shifting up/down
      return true;
    },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCompleted = task.status === 'done';
  const isTerminal = TERMINAL_STATUSES.includes(task.status as PredefinedStatusId);
  const cancelledEnabled = enabledStatuses.includes('cancelled');
  const isToday = task.today === true;
  const priority = task.priority ?? 'none';
  const dueDateLabel = useMemo(
    () => (task.dueDate ? formatDueDateDisplay(task.dueDate) : null),
    [task.dueDate],
  );
  const isOverdue = !isCompleted && isDueDateOverdue(task.dueDate, Date.now());

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

  const canMoveToProject =
    task.parentId === null && !hasChildren;

  const projects = useMemo(
    () =>
      canMoveToProject
        ? allTasks.filter(
          (t) =>
            t.parentId === null &&
            t.id !== task.id &&
            !TERMINAL_STATUSES.includes(t.status as PredefinedStatusId),
        )
        : [],
    [allTasks, canMoveToProject, task.id],
  );

  const showMoveToProject = canMoveToProject && projects.length > 0;

  const handleDuplicate = () => {
    void createTask({
      title: task.title,
      parentId: task.parentId,
      body: task.body,
      status: isTerminal ? 'active' : task.status,
      priority: task.priority,
      today: task.today ?? undefined,
      client: task.client,
      dueDate: task.dueDate,
      recurrence: task.recurrence,
    });
    setMenuOpen(false);
  };

  const activeChildrenCount = childrenCount - childrenDoneCount;

  const handleDelete = (cascade?: boolean) => {
    void deleteTask(task.id, cascade);
    setMenuOpen(false);
    setMenuView('main');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      role="option"
      aria-selected={isExpanded}
      tabIndex={isFocused ? 0 : -1}
      onFocus={(event) => {
        event.stopPropagation();
        onFocus?.();
      }}
      className={cn(
        'overflow-hidden border-b border-border/40 last:border-b-0 outline-none transition-colors duration-100',
        isFocused && 'bg-accent/40',
        isNavigatedTo && 'task-navigated',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <div onClick={() => onToggleExpand(task.id)} className="flex min-h-10 items-center gap-2 px-1.5">
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onComplete(task.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const nextPriority = getNextPriority(task.priority);
                  void updateTask({ id: task.id, priority: nextPriority });
                }}
                aria-label={
                  isCompleted
                    ? `Reopen "${task.title}"`
                    : `Mark "${task.title}" complete`
                }
                className="group inline-flex size-6 items-center justify-center text-foreground/90 outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              >
                <motion.span
                  initial={false}
                  animate={{
                    scale: isCompleted ? 1 : 0.96,
                    backgroundColor: isCompleted
                      ? 'var(--foreground)'
                      : 'transparent',
                    borderColor: isCompleted
                      ? 'var(--foreground)'
                      : 'var(--foreground-muted, rgba(255,255,255,0.35))',
                  }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded-full border transition-[border-style] duration-200',
                    isCompleted ? 'border-solid' : 'border-dashed group-hover:border-solid',
                  )}
                >
                  <Check
                    className={cn(
                      'size-2.5 transition-opacity duration-200',
                      isCompleted
                        ? 'opacity-100 text-background'
                        : 'opacity-0 group-hover:opacity-25',
                    )}
                  />
                </motion.span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isCompleted ? 'Reopen' : 'Complete'}
            </TooltipContent>
          </Tooltip>
          <span
            className={cn(
              'size-[5px] rounded-full transition-colors duration-200',
              PRIORITY_DOT[priority],
            )}
          />
        </div>

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
                className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-foreground outline-none"
              />
            ) : (
              <p
                onClick={(event) => {
                  if (isExpanded) {
                    event.stopPropagation();
                    onStartTitleEdit(task.id);
                  }
                }}
                className={cn(
                  'cursor-default text-[13px] text-foreground',
                  !isExpanded && 'truncate',
                  isCompleted && 'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </p>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {task.body && task.body.trim() !== '' && task.body !== '<p></p>' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex h-5 items-center justify-center rounded border border-border/70 bg-muted/40 px-1 text-muted-foreground"
                >
                  <AlignLeft className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Has notes</TooltipContent>
            </Tooltip>
          ) : null}

          {task.recurrence ? (
            <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
              {task.recurrence}
            </span>
          ) : null}

          {dueDateLabel ? (
            <span className={cn(
              'inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground',
              isOverdue && 'text-destructive',
            )}>
              {dueDateLabel}
            </span>
          ) : null}

          {childrenCount > 0 && (
            <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
              {childrenDoneCount}/{childrenCount}
            </span>
          )}

          {isCompleted && completedAtLabel ? (
            <span className="inline-flex h-5 items-center rounded border border-border/50 px-1.5 font-mono text-[10px] text-muted-foreground">
              {completedAtLabel}
            </span>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
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
                <Bookmark className="size-3.5" fill={isToday ? 'currentColor' : 'none'} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isToday ? 'Remove from Today' : 'Add to Today'}
            </TooltipContent>
          </Tooltip>

          <Popover.Root
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) setMenuView('main');
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`More actions for "${task.title}"`}
                    className="inline-flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </Popover.Trigger>
              </TooltipTrigger>
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>
            <PopoverContent
              className="w-auto min-w-[160px] p-1"
              align="end"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {menuView === 'main' ? (
                <div>
                  {task.status === 'inbox' && (
                    <button
                      type="button"
                      onClick={() => {
                        void updateTask({ id: task.id, status: 'active' });
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ArrowRightLeft className="size-3" />
                      Move to Tasks
                    </button>
                  )}
                  {task.status !== 'inbox' && !isTerminal && (
                    <button
                      type="button"
                      onClick={() => {
                        void updateTask({ id: task.id, status: 'inbox' });
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ArrowRightLeft className="size-3" />
                      Move to Inbox
                    </button>
                  )}
                  {cancelledEnabled && !isTerminal && (
                    <button
                      type="button"
                      onClick={() => {
                        void cancelTask(task.id);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Ban className="size-3" />
                      Cancel task
                    </button>
                  )}
                  {showMoveToProject && (
                    <button
                      type="button"
                      onClick={() => setMenuView('projects')}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <FolderInput className="size-3" />
                      <span className="flex-1 text-left">Move to project</span>
                      <span className="text-border">&rarr;</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Copy className="size-3" />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuView('delete-confirm')}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </button>
                </div>
              ) : menuView === 'projects' ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setMenuView('main')}
                    className="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>&larr;</span> Back
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        const updates: TaskUpdateInput = {
                          id: task.id,
                          parentId: project.id,
                        };
                        if (task.status === 'inbox')
                          updates.status = 'active';
                        void updateTask(updates);
                        setMenuOpen(false);
                        setMenuView('main');
                      }}
                      className="flex w-full items-center truncate rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {project.title}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 px-1 py-1.5">
                  <p className="text-xs text-muted-foreground">
                    {activeChildrenCount > 0
                      ? `Delete this task and ${activeChildrenCount} active subtask${activeChildrenCount > 1 ? 's' : ''}?`
                      : 'Delete this task?'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMenuView('main')}
                      className="flex flex-1 items-center justify-center rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(activeChildrenCount > 0)}
                      className="flex flex-1 items-center justify-center rounded-sm bg-destructive/10 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover.Root>

          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>Drag to reorder</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {children}
    </div>
  );
};
