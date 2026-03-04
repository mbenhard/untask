import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { AlignLeft, Bookmark, Check, GripVertical, Paperclip } from 'lucide-react';

import { type Task } from '../../../types/models';
import { cn } from '../../lib/utils';
import { hasNoteContent } from './noteContent';
import { SNAPPY, fadeVariants, heightVariants } from '../../lib/animation';
import { PRIORITY_DOT } from '../../lib/taskConstants';
import { useFlashHighlight } from '../../hooks/useFlashHighlight';
import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { Popover, PopoverContent, Tooltip, TooltipContent, TooltipTrigger } from '../ui';
import { formatDueDateDisplay, isDueDateOverdue, parseDueDate, parseDueTime } from './dueDate';
import { getNextPriority } from './taskInteraction';

const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

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
  onCompleteWithChildren: (id: string) => void;
  onToggleToday: (id: string) => void;
  onOpenDetail?: (id: string) => void;
  onContextMenu?: (event: React.MouseEvent, taskId: string) => void;
  onFocus?: () => void;
  attachmentCount?: number;
  completeConfirmTrigger?: { taskId: string; ts: number } | null;
  onCompleteConfirmTriggerHandled?: (taskId: string) => void;
  children?: ReactNode;
}

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
  onCompleteWithChildren,
  onToggleToday,
  onOpenDetail,
  onContextMenu,
  onFocus,
  attachmentCount = 0,
  completeConfirmTrigger,
  onCompleteConfirmTriggerHandled,
  children,
}: TaskItemProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const completeConfirmAllButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  // Open complete confirmation popover when triggered (e.g. from keyboard Space).
  // Uses a {taskId, ts} object so repeated triggers on the same task always fire.
  useEffect(() => {
    if (completeConfirmTrigger?.taskId !== task.id) return;

    if (hasChildren && childrenDoneCount < childrenCount) {
      setCompleteConfirmOpen(true);
    }
    onCompleteConfirmTriggerHandled?.(task.id);
  }, [
    completeConfirmTrigger,
    task.id,
    hasChildren,
    childrenCount,
    childrenDoneCount,
    onCompleteConfirmTriggerHandled,
  ]);

  useEffect(() => {
    if (!completeConfirmOpen) return;

    const frameId = requestAnimationFrame(() => {
      completeConfirmAllButtonRef.current?.focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [completeConfirmOpen]);

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
    animateLayoutChanges: (args) =>
      args.isSorting || args.wasDragging,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const bookmarkRef = useRef<HTMLButtonElement>(null);
  const flashBookmark = useFlashHighlight(bookmarkRef);
  const prevToday = useRef(task.today);

  useEffect(() => {
    if (task.today !== prevToday.current) {
      prevToday.current = task.today;
      if (useAppStore.getState().activeView !== 'today') {
        flashBookmark();
      }
    }
  }, [task.today, flashBookmark]);

  const isCompleted = task.status === 'done';
  const isToday = task.today === true;
  const priority = task.priority ?? 'none';
  const dueDateLabel = useMemo(
    () => (task.dueDate ? formatDueDateDisplay(task.dueDate) : null),
    [task.dueDate],
  );
  const isOverdue = !isCompleted && isDueDateOverdue(task.dueDate, Date.now());
  const dueDateTooltip = useMemo(() => {
    if (!task.dueDate) return null;
    const date = parseDueDate(task.dueDate);
    if (!date) return null;
    const time = parseDueTime(task.dueDate);
    let label = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (time) label += ` at ${time}`;
    return label;
  }, [task.dueDate]);

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
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event, task.id);
      }}
      className={cn(
        'group/row overflow-hidden border-b border-border/40 last:border-b-0 outline-none transition-colors duration-100',
        isFocused && 'bg-accent/40',
        isNavigatedTo && 'task-navigated',
        isDragging && 'z-10 opacity-30',
      )}
    >
      <div onClick={() => onToggleExpand(task.id)} className="flex min-h-10 items-center gap-2 px-1.5">
        <div className="flex items-center gap-1.5">
          {hasChildren && childrenDoneCount < childrenCount ? (
            <Popover.Root
              open={completeConfirmOpen}
              onOpenChange={(open) => {
                setCompleteConfirmOpen(open);
                if (!open) {
                  setTimeout(() => {
                    setCompleteConfirmOpen(false);
                  }, 100);
                }
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCompleteConfirmOpen(true);
                      }}
                      aria-label={`Mark "${task.title}" complete`}
                      aria-checked={isCompleted}
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
                          aria-hidden="true"
                          className={cn(
                            'size-2.5 transition-opacity duration-200',
                            isCompleted
                              ? 'opacity-100 text-background'
                              : 'opacity-0 group-hover:opacity-25',
                          )}
                        />
                      </motion.span>
                    </button>
                  </Popover.Trigger>
                </TooltipTrigger>
                <TooltipContent>
                  {isCompleted ? 'Reopen' : 'Complete'}
                </TooltipContent>
              </Tooltip>
              <PopoverContent
                className="w-auto min-w-[200px] p-2"
                align="start"
                sideOffset={4}
                onClick={(event) => event.stopPropagation()}
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  completeConfirmAllButtonRef.current?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onCompleteWithChildren(task.id);
                  setCompleteConfirmOpen(false);
                }}
              >
                <div className="flex flex-col gap-1.5 px-1 py-1.5">
                  <p className="text-xs text-muted-foreground">
                    Complete with {childrenCount - childrenDoneCount} active subtask{childrenCount - childrenDoneCount > 1 ? 's' : ''}?
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onComplete(task.id);
                        setCompleteConfirmOpen(false);
                      }}
                      className="flex flex-1 items-center justify-center rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Only this
                    </button>
                    <button
                      ref={completeConfirmAllButtonRef}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCompleteWithChildren(task.id);
                        setCompleteConfirmOpen(false);
                      }}
                      className="flex flex-1 items-center justify-center rounded-sm bg-emerald-500/10 px-2 py-1 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/20"
                    >
                      All
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover.Root>
          ) : (
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
                  aria-checked={isCompleted}
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
                      aria-hidden="true"
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
          )}
          <span
            className={cn(
              'size-[5px] rounded-full transition-colors duration-200',
              PRIORITY_DOT[priority],
            )}
          />
          <span className="sr-only">Priority: {priority}</span>
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
          <AnimatePresence>
            {hasNoteContent(task.body) ? (
              <motion.div key="body-badge" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.08 }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex h-5 items-center justify-center rounded border border-border/70 bg-muted/40 px-1 text-muted-foreground"
                    >
                      <AlignLeft aria-hidden="true" className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Has notes</TooltipContent>
                </Tooltip>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {attachmentCount > 0 ? (
              <motion.span key="attachment-badge" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.08 }} className="inline-flex h-5 items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
                <Paperclip aria-hidden="true" className="size-2.5" />
                {attachmentCount}
              </motion.span>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {task.recurrence ? (
              <motion.span key="recurrence-badge" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.08 }} className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
                {task.recurrence}
              </motion.span>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {dueDateLabel ? (
              <motion.div key="duedate-badge" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.08 }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn(
                      'inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground',
                      isOverdue && 'text-destructive',
                    )}>
                      {dueDateLabel}
                    </span>
                  </TooltipTrigger>
                  {dueDateTooltip && <TooltipContent>{dueDateTooltip}</TooltipContent>}
                </Tooltip>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {childrenCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
                  {childrenDoneCount}/{childrenCount}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {childrenDoneCount}/{childrenCount} subtasks done
              </TooltipContent>
            </Tooltip>
          )}

          <AnimatePresence>
            {isCompleted && completedAtLabel ? (
              <motion.span key="completedat-badge" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.08 }} className="inline-flex h-5 items-center rounded border border-border/50 px-1.5 font-mono text-[10px] text-muted-foreground">
                {completedAtLabel}
              </motion.span>
            ) : null}
          </AnimatePresence>

          {onOpenDetail && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDetail(task.id);
                  }}
                  aria-label={`Open detail page for "${task.title}"`}
                  className="inline-flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <ArrowRightIcon />
                </button>
              </TooltipTrigger>
              <TooltipContent>Open detail</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={bookmarkRef}
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
                <Bookmark aria-hidden="true" className="size-3.5" fill={isToday ? 'currentColor' : 'none'} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isToday ? 'Remove from Today' : 'Add to Today'}
            </TooltipContent>
          </Tooltip>

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
                className="inline-flex size-6 cursor-grab items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
              >
                <GripVertical aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Drag to reorder</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="task-body"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SNAPPY}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
