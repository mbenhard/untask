import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bookmark,
  Ellipsis,
  Plus,
} from 'lucide-react';
import {
  TERMINAL_STATUSES,
  type PredefinedStatusId,
  type Task,
} from '../../../types/models';
import { fadeVariants, SNAPPY } from '../../lib/animation';
import { suppressTaskRefresh, unsuppressTaskRefresh } from '../../lib/editorSaveGuard';
import { SEGMENT, SEGMENT_EMPTY } from '../../lib/taskConstants';
import { getUntask } from '../../lib/untask';
import { cn } from '../../lib/utils';
import { useFlashHighlight } from '../../hooks/useFlashHighlight';
import {
  selectActiveView,
  useAppStore,
} from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { isEmptyDocument } from '../editor/editorUtils';
import { BlockEditor } from '../editor/BlockEditor';
import { Button } from '../ui/button';
import { Popover, PopoverContent } from '../ui';

import {
  StatusSegment,
  PrioritySegment,
  DueDateSegment,
  ClientSegment,
  RecurrenceSegment,
  MetaDot,
  type UpdateTaskAction,
  getAttachmentSlashMenuItems,
} from './TaskBody';
import { SubtaskSection } from './SubtaskSection';
import { TaskOverflowMenu } from './TaskOverflowMenu';

// ─── Constants ──────────────────────────────────────────────

const VIEW_LABELS: Record<string, string> = {
  today: 'Today',
  tasks: 'Tasks',
  inbox: 'Inbox',
};

const EFFORT_OPTIONS = [
  { value: 'tiny', label: 'Tiny' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'deep', label: 'Deep' },
] as const;

const EFFORT_LABELS: Record<string, string> = {
  unknown: 'Unknown',
  tiny: 'Tiny',
  small: 'Small',
  medium: 'Medium',
  deep: 'Deep',
};

// ─── Effort Segment ─────────────────────────────────────────

const EffortSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [open, setOpen] = useState(false);
  const effort = task.effort ?? 'unknown';
  const label = EFFORT_LABELS[effort] ?? effort;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flash = useFlashHighlight(triggerRef);
  const prevEffort = useRef(effort);

  useEffect(() => {
    if (effort !== prevEffort.current) {
      prevEffort.current = effort;
      flash();
    }
  }, [effort, flash]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={SEGMENT}
          aria-label={`Effort: ${label}`}
        >
          {label}
        </button>
      </Popover.Trigger>
      <PopoverContent
        className="w-auto min-w-[120px] p-1"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {EFFORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              void onUpdate({ id: task.id, effort: opt.value });
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              effort === opt.value && 'text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            void onUpdate({ id: task.id, effort: null });
            setOpen(false);
          }}
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          Remove
        </button>
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Today Segment ──────────────────────────────────────────

const TodaySegment = ({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) => {
  const isToday = task.today === true;
  const ref = useRef<HTMLButtonElement>(null);
  const flash = useFlashHighlight(ref);
  const prevToday = useRef(isToday);

  useEffect(() => {
    if (isToday !== prevToday.current) {
      prevToday.current = isToday;
      flash();
    }
  }, [isToday, flash]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(SEGMENT, !isToday && SEGMENT_EMPTY)}
      aria-label={isToday ? 'Remove from Today' : 'Add to Today'}
    >
      <Bookmark
        aria-hidden="true"
        className="mr-0.5 size-3"
        fill={isToday ? 'currentColor' : 'none'}
      />
      {isToday ? 'Today' : '+ today'}
    </button>
  );
};

// ─── Add Metadata Button ────────────────────────────────────

type MetadataOption = 'dueDate' | 'effort' | 'client' | 'recurrence';

const AddMetadataButton = ({
  unsetOptions,
  onAdd,
}: {
  unsetOptions: MetadataOption[];
  onAdd: (option: MetadataOption) => void;
}) => {
  const [open, setOpen] = useState(false);

  if (unsetOptions.length === 0) return null;

  const labels: Record<MetadataOption, string> = {
    dueDate: 'Due date',
    effort: 'Effort',
    client: 'Client',
    recurrence: 'Repeat',
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(SEGMENT, SEGMENT_EMPTY)}
          aria-label="Add metadata"
        >
          <Plus aria-hidden="true" className="size-3" />
        </button>
      </Popover.Trigger>
      <PopoverContent
        className="w-auto min-w-[120px] p-1"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {unsetOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              onAdd(opt);
              setOpen(false);
            }}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {labels[opt]}
          </button>
        ))}
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Detail Page Metadata Line ──────────────────────────────

const DetailMetadataLine = ({
  task,
  onUpdate,
  onToggleToday,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
  onToggleToday: () => void;
}) => {
  // Track which conditional fields have been explicitly added via `+` button
  const [addedFields, setAddedFields] = useState<Set<MetadataOption>>(new Set());

  const hasDueDate = task.dueDate !== null || addedFields.has('dueDate');
  const hasEffort = (task.effort !== null && task.effort !== 'unknown') || addedFields.has('effort');
  const hasClient = (task.client !== null && task.client !== '') || addedFields.has('client');
  const hasRecurrence = task.recurrence !== null || addedFields.has('recurrence');

  const unsetOptions: MetadataOption[] = [];
  if (!hasDueDate) unsetOptions.push('dueDate');
  if (!hasEffort) unsetOptions.push('effort');
  if (!hasClient) unsetOptions.push('client');
  if (!hasRecurrence) unsetOptions.push('recurrence');

  const handleAddMetadata = useCallback((option: MetadataOption) => {
    setAddedFields((prev) => new Set(prev).add(option));
  }, []);

  return (
    <div
      role="toolbar"
      aria-label="Task metadata"
      className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-muted-foreground"
    >
      {/* Core — always visible */}
      <StatusSegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <PrioritySegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <TodaySegment task={task} onToggle={onToggleToday} />

      {/* Conditional — shown when set or explicitly added */}
      {hasDueDate && (
        <>
          <MetaDot />
          <DueDateSegment task={task} onUpdate={onUpdate} />
        </>
      )}
      {hasEffort && (
        <>
          <MetaDot />
          <EffortSegment task={task} onUpdate={onUpdate} />
        </>
      )}
      {hasClient && (
        <>
          <MetaDot />
          <ClientSegment task={task} onUpdate={onUpdate} />
        </>
      )}
      {hasRecurrence && (
        <>
          <MetaDot />
          <RecurrenceSegment task={task} onUpdate={onUpdate} />
        </>
      )}

      {/* Add button for unset metadata */}
      {unsetOptions.length > 0 && (
        <>
          <MetaDot />
          <AddMetadataButton unsetOptions={unsetOptions} onAdd={handleAddMetadata} />
        </>
      )}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────

type TaskDetailPageProps = {
  taskId: string;
  navigatedSubtaskId?: string | null;
};

export const TaskDetailPage = ({ taskId, navigatedSubtaskId = null }: TaskDetailPageProps) => {
  const activeView = useAppStore(selectActiveView);
  const setFocusedTaskId = useAppStore((state) => state.setFocusedTaskId);
  const task = useTaskStore(
    useCallback(
      (state: { tasks: Task[] }) => state.tasks.find((t) => t.id === taskId) ?? null,
      [taskId],
    ),
  );
  const allTasks = useTaskStore((state) => state.tasks);
  const updateTask = useTaskStore((state) => state.updateTask);
  const toggleToday = useTaskStore((state) => state.toggleToday);

  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<string | null>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync title draft when task changes
  useEffect(() => {
    if (task) setTitleDraft(task.title);
  }, [task?.title]);

  const handleBack = useCallback(() => {
    setFocusedTaskId(null);
  }, [setFocusedTaskId]);

  // ── Title editing ──

  const saveTitleDraft = useCallback(() => {
    if (!task) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      void updateTask({ id: task.id, title: trimmed });
    } else {
      setTitleDraft(task.title);
    }
    setIsEditingTitle(false);
  }, [task, titleDraft, updateTask]);

  const cancelTitleEdit = useCallback(() => {
    if (task) setTitleDraft(task.title);
    setIsEditingTitle(false);
  }, [task]);

  // ── Body auto-save ──

  const handleBodyChange = useCallback(
    (json: string) => {
      if (!task) return;
      pendingBodyRef.current = json;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = isEmptyDocument(json) ? null : json;
        suppressTaskRefresh();
        void getUntask().tasks.update({ id: task.id, body }).finally(() => {
          setTimeout(unsuppressTaskRefresh, 200);
        });
      }, 2000);
    },
    [task],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingBodyRef.current !== null) {
        const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (currentTask) {
          const body = isEmptyDocument(pendingBodyRef.current) ? null : pendingBodyRef.current;
          pendingBodyRef.current = null;
          void useTaskStore.getState().updateTask({ id: currentTask.id, body });
        }
      }
    };
  }, [taskId]);

  // ── Today toggle ──

  const handleToggleToday = useCallback(() => {
    if (!task) return;
    void toggleToday(task.id);
  }, [task, toggleToday]);

  // ── Computed values ──

  const subtasks = task
    ? allTasks.filter((t) => t.parentId === task.id)
    : [];
  const activeChildrenCount = subtasks.filter(
    (t) => !TERMINAL_STATUSES.includes(t.status as PredefinedStatusId),
  ).length;
  const canMoveToProject = task ? task.parentId === null && subtasks.length === 0 : false;

  const handleMenuDeleted = useCallback(() => {
    setFocusedTaskId(null);
  }, [setFocusedTaskId]);

  // Task was deleted while viewing — go back via effect (avoid setState during render)
  useEffect(() => {
    if (!task) setFocusedTaskId(null);
  }, [task, setFocusedTaskId]);

  if (!task) return null;

  const viewLabel = VIEW_LABELS[activeView] ?? 'Back';

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={SNAPPY}
      className="flex h-full flex-col overflow-hidden"
    >
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-3 py-2">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleBack}
          aria-label={`Back to ${viewLabel}`}
        >
          <ArrowLeft size={14} />
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Back to {viewLabel}
        </span>

        <div className="min-w-0 flex-1" />

        {/* Overflow menu */}
        <TaskOverflowMenu
          task={task}
          allTasks={allTasks}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          activeChildrenCount={activeChildrenCount}
          canMoveToProject={canMoveToProject}
          onDeleted={handleMenuDeleted}
        >
          <Popover.Trigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="More actions"
            >
              <Ellipsis size={14} />
            </Button>
          </Popover.Trigger>
        </TaskOverflowMenu>
      </header>

      {/* ── Scrollable content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-3 pb-14">
          {/* Title */}
          <div className="mb-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitleDraft();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelTitleEdit();
                  }
                  e.stopPropagation();
                }}
                onBlur={saveTitleDraft}
                className="w-full bg-transparent text-xl font-medium text-foreground outline-none"
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className={cn(
                  'cursor-text text-xl font-medium text-foreground',
                  task.status === 'done' && 'text-muted-foreground line-through',
                )}
              >
                {task.title}
              </h1>
            )}
          </div>

          {/* Metadata line */}
          <div className="mb-4">
            <DetailMetadataLine
              task={task}
              onUpdate={updateTask}
              onToggleToday={handleToggleToday}
            />
          </div>

          {/* Divider */}
          <div className="mb-4 border-t border-border/30" />

          {/* Body editor */}
          <div className="mb-6">
            <BlockEditor
              key={taskId}
              content={task.body ?? ''}
              onChange={handleBodyChange}
              className="untask-task-editor"
              preset="task"
              contextMenuMode="off"
              editorRef={editorRef}
              getSlashMenuItems={getAttachmentSlashMenuItems}
            />
          </div>

          {/* Divider */}
          <div className="mb-4 border-t border-border/30" />

          {/* Subtask section */}
          <SubtaskSection
            parentTask={task}
            subtasks={subtasks}
            allTasks={allTasks}
            navigatedSubtaskId={navigatedSubtaskId}
          />
        </div>
      </div>
    </motion.div>
  );
};
