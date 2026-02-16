import { useCallback, useEffect, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { BlockNoteEditor } from '@blocknote/core';
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';

import type { Task, TaskStatus } from '../../../types/models';
import { cn } from '../../lib/utils';
import { type TaskUpdateInput, useTaskStore } from '../../stores/taskStore';
import { BlockEditor } from '../editor/BlockEditor';
import { isEmptyDocument } from '../editor/editorUtils';
import { Popover, PopoverContent } from '../ui';
import { TaskDueDatePicker } from './TaskDueDatePicker';

// ─── Types & Constants ──────────────────────────────────────

type UpdateTaskAction = (input: TaskUpdateInput) => Promise<Task | null>;

const PRIORITY_OPTIONS: Array<{
  value: NonNullable<Task['priority']>;
  label: string;
  dot: string;
}> = [
  { value: 'none', label: 'None', dot: '' },
  { value: 'low', label: 'Low', dot: 'bg-emerald-500' },
  { value: 'medium', label: 'Med', dot: 'bg-amber-500' },
  { value: 'high', label: 'High', dot: 'bg-rose-500' },
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_DOT: Record<NonNullable<Task['priority']>, string> = {
  none: '',
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-rose-500',
};

const PRIORITY_LABEL: Record<NonNullable<Task['priority']>, string> = {
  none: '',
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  active: 'Active',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  done: 'Done',
};

const SEGMENT =
  'inline-flex items-center py-1 -my-1 cursor-pointer transition-colors duration-150 hover:text-foreground focus-visible:bg-accent/30 focus-visible:rounded-sm focus-visible:px-1 focus-visible:-mx-1 outline-none';

const SEGMENT_EMPTY = 'text-muted-foreground/50';

const MEDIA_SLASH_ITEMS = new Set(['Image', 'Video', 'Audio', 'File']);

const getTextOnlySlashMenuItems = (
  editor: BlockNoteEditor,
): DefaultReactSuggestionItem[] =>
  getDefaultReactSlashMenuItems(editor).filter(
    (item) => !MEDIA_SLASH_ITEMS.has(item.title),
  );

// ─── Dot Separator ──────────────────────────────────────────

const MetaDot = () => (
  <span aria-hidden="true" className="text-border select-none">
    ·
  </span>
);

// ─── Priority Segment ───────────────────────────────────────

const PrioritySegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [open, setOpen] = useState(false);
  const priority = task.priority ?? 'none';
  const dot = PRIORITY_DOT[priority];
  const label = PRIORITY_LABEL[priority];
  const isEmpty = priority === 'none';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(SEGMENT, isEmpty && SEGMENT_EMPTY)}
          aria-label="Priority"
        >
          {!isEmpty && (
            <span
              className={cn('mr-1 inline-block size-1.5 rounded-full', dot)}
            />
          )}
          {isEmpty ? '+ priority' : label}
        </button>
      </Popover.Trigger>
      <PopoverContent
        className="w-auto min-w-[100px] p-1"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {PRIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              void onUpdate({ id: task.id, priority: opt.value });
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              priority === opt.value && 'text-foreground',
            )}
          >
            {opt.dot ? (
              <span
                className={cn('inline-block size-1.5 rounded-full', opt.dot)}
              />
            ) : (
              <span className="inline-block size-1.5" />
            )}
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Due Date Segment ───────────────────────────────────────

const DueDateSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => (
  <TaskDueDatePicker
    dueDate={task.dueDate}
    emptyLabel="+ due date"
    variant="segment"
    onChange={(nextDueDate) => {
      void onUpdate({ id: task.id, dueDate: nextDueDate });
    }}
  />
);

// ─── Client Segment ─────────────────────────────────────────

const ClientSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(task.client ?? '');

  useEffect(() => {
    setDraft(task.client ?? '');
  }, [task.client]);

  const isEmpty = !task.client;

  if (isEditing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            void onUpdate({ id: task.id, client: draft.trim() || null });
            setIsEditing(false);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(task.client ?? '');
            setIsEditing(false);
          }
        }}
        onBlur={() => {
          void onUpdate({ id: task.id, client: draft.trim() || null });
          setIsEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="Client name"
        className="min-w-[60px] max-w-[140px] bg-transparent text-[11px] font-mono text-foreground outline-none"
        style={{
          width: `${Math.max(60, Math.min(140, draft.length * 7 + 16))}px`,
        }}
        aria-label="Client"
      />
    );
  }

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className={cn(
        SEGMENT,
        isEmpty && SEGMENT_EMPTY,
        !isEmpty && 'max-w-[140px] truncate',
      )}
      aria-label={isEmpty ? 'Add client' : 'Edit client'}
    >
      {isEmpty ? '+ client' : task.client}
    </button>
  );
};

// ─── Status Segment ─────────────────────────────────────────

const StatusSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [open, setOpen] = useState(false);
  const status = task.status ?? 'active';
  const label = STATUS_LABEL[status];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={SEGMENT}
          aria-label="Status"
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
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              void onUpdate({ id: task.id, status: opt.value });
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              status === opt.value && 'text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Subtasks Segment ───────────────────────────────────────

const SubtasksSegment = ({
  count,
  onAdd,
}: {
  count: number;
  onAdd: () => void;
}) => {
  const label =
    count > 0 ? `${count} subtask${count !== 1 ? 's' : ''}` : '+ subtask';

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(SEGMENT, count === 0 && SEGMENT_EMPTY)}
      aria-label={count > 0 ? `${count} subtasks — click to add` : 'Add subtask'}
    >
      {label}
    </button>
  );
};

// ─── Metadata Line ──────────────────────────────────────────

const MetadataLine = ({
  task,
  onUpdate,
  subtaskCount,
  onRequestAddSubtask,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
  subtaskCount: number;
  onRequestAddSubtask?: () => void;
}) => {
  const isCompleted = task.status === 'done';
  const isSubtask = task.parentId !== null;

  return (
    <div
      role="toolbar"
      aria-label="Task metadata"
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono text-muted-foreground',
        isCompleted && 'opacity-60',
      )}
    >
      <PrioritySegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <DueDateSegment task={task} onUpdate={onUpdate} />
      {!isSubtask && (
        <>
          <MetaDot />
          <ClientSegment task={task} onUpdate={onUpdate} />
          <MetaDot />
          <StatusSegment task={task} onUpdate={onUpdate} />
          {onRequestAddSubtask && (
            <>
              <MetaDot />
              <SubtasksSegment
                count={subtaskCount}
                onAdd={onRequestAddSubtask}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────

export type TaskBodyProps = {
  task: Task;
  isExpanded: boolean;
  subtaskCount: number;
  onRequestAddSubtask?: () => void;
  onBodyEditModeChange?: (editing: boolean) => void;
};

export const TaskBody = ({
  task,
  isExpanded,
  subtaskCount,
  onRequestAddSubtask,
  onBodyEditModeChange,
}: TaskBodyProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const prefersReducedMotion = useReducedMotion();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<string | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (pendingBodyRef.current !== null) {
      const body = isEmptyDocument(pendingBodyRef.current)
        ? null
        : pendingBodyRef.current;
      pendingBodyRef.current = null;
      void updateTask({ id: task.id, body });
    }
  }, [task.id, updateTask]);

  const handleBodyChange = useCallback(
    (json: string) => {
      pendingBodyRef.current = json;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = isEmptyDocument(json) ? null : json;
        pendingBodyRef.current = null;
        void updateTask({ id: task.id, body });
      }, 2000);
    },
    [task.id, updateTask],
  );

  useEffect(() => {
    if (!isExpanded) {
      flushSave();
    }
  }, [isExpanded, flushSave]);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const handleFocus = useCallback(() => {
    onBodyEditModeChange?.(true);
  }, [onBodyEditModeChange]);

  const handleBlur = useCallback(() => {
    onBodyEditModeChange?.(false);
  }, [onBodyEditModeChange]);

  return (
    <AnimatePresence initial={false}>
      {isExpanded ? (
        <motion.div
          initial={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }
          }
          animate={
            prefersReducedMotion
              ? { opacity: 1 }
              : { opacity: 1, height: 'auto' }
          }
          exit={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }
          }
          transition={{
            duration: prefersReducedMotion ? 0.1 : 0.2,
            ease: 'easeOut',
          }}
          className="overflow-hidden"
        >
          {/* Zone 1 — Body Editor (hero) */}
          <div className="border-t border-border/30 px-3 py-3">
            <BlockEditor
              content={task.body ?? ''}
              onChange={handleBodyChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="flusk-task-editor"
              getSlashMenuItems={
                task.parentId !== null ? getTextOnlySlashMenuItems : undefined
              }
            />
          </div>

          {/* Zone 2 — Metadata Line */}
          <MetadataLine
            task={task}
            onUpdate={updateTask}
            subtaskCount={subtaskCount}
            onRequestAddSubtask={onRequestAddSubtask}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
