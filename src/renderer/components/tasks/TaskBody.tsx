import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { Paperclip } from 'lucide-react';

import type { Task, PredefinedStatusId } from '../../../types/models';
import { PREDEFINED_STATUSES } from '../../../types/models';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { suppressTaskRefresh, unsuppressTaskRefresh } from '../../lib/editorSaveGuard';
import { useFlashHighlight } from '../../hooks/useFlashHighlight';
import { PRIORITY_DOT as SHARED_PRIORITY_DOT, SEGMENT, SEGMENT_EMPTY } from '../../lib/taskConstants';
import { useAppStore } from '../../stores/appStore';
import { useToastStore } from '../../stores/toastStore';
import { type TaskUpdateInput, useTaskStore } from '../../stores/taskStore';
import {
  useTaskStatusConfigStore,
  selectEnabledNonTerminal,
  selectEnabledTerminal,
} from '../../stores/taskStatusConfigStore';
import { isEmptyDocument } from '../editor/editorUtils';
import { Popover, PopoverContent } from '../ui';
import { TaskDueDatePicker } from './TaskDueDatePicker';
import { getNextPriority } from './taskInteraction';
import { BlockEditor, type BlockEditorSlashMenuItem, type BlockEditorSlashMenuParams } from '../editor/BlockEditor';

// ─── Types & Constants ──────────────────────────────────────

type UpdateTaskAction = (input: TaskUpdateInput) => Promise<Task | null>;

type DevLatencyApi = {
  start: (flow: string, key: string | number) => void;
  end: (flow: string, key: string | number) => number | null;
  cancel: (flow: string, key: string | number) => void;
};

const NOOP_DEV_LATENCY: DevLatencyApi = {
  start: () => undefined,
  end: () => null,
  cancel: () => undefined,
};

const statusLabelMap = new Map(PREDEFINED_STATUSES.map((s) => [s.id, s.label]));

const PRIORITY_DOT: Record<NonNullable<Task['priority']>, string> = {
  ...SHARED_PRIORITY_DOT,
  none: '',
};

const PRIORITY_LABEL: Record<NonNullable<Task['priority']>, string> = {
  none: '',
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

const UNSUPPORTED_MEDIA_ITEMS = new Set(['Video', 'Audio']);

const getAttachmentSlashMenuItems = (
  { defaultItems }: BlockEditorSlashMenuParams,
): BlockEditorSlashMenuItem[] =>
  defaultItems.filter(
    (item) => !UNSUPPORTED_MEDIA_ITEMS.has(item.title),
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
  const priority = task.priority ?? 'none';
  const dot = PRIORITY_DOT[priority];
  const label = PRIORITY_LABEL[priority];
  const isEmpty = priority === 'none';
  const ref = useRef<HTMLButtonElement>(null);
  const flash = useFlashHighlight(ref);
  const prevPriority = useRef(priority);

  useEffect(() => {
    if (priority !== prevPriority.current) {
      prevPriority.current = priority;
      flash();
    }
  }, [priority, flash]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        void onUpdate({ id: task.id, priority: getNextPriority(priority) });
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(SEGMENT, isEmpty && SEGMENT_EMPTY)}
      aria-label={`Priority: ${priority} — click to cycle`}
    >
      {!isEmpty && (
        <span
          className={cn('mr-1 inline-block size-1.5 rounded-full', dot)}
        />
      )}
      {isEmpty ? '+ priority' : label}
    </button>
  );
};

// ─── Due Date Segment ───────────────────────────────────────

const DueDateSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const flash = useFlashHighlight(ref);
  const prevDueDate = useRef(task.dueDate);

  useEffect(() => {
    if (task.dueDate !== prevDueDate.current) {
      prevDueDate.current = task.dueDate;
      flash();
    }
  }, [task.dueDate, flash]);

  return (
    <span ref={ref}>
      <TaskDueDatePicker
        dueDate={task.dueDate}
        emptyLabel="+ due date"
        variant="segment"
        reminderOffset={(task.reminderOffset as 'at_due' | '15m' | '1h' | '1d') ?? undefined}
        onChange={(nextDueDate) => {
          void onUpdate({ id: task.id, dueDate: nextDueDate });
        }}
        onReminderOffsetChange={(offset) => {
          void onUpdate({ id: task.id, reminderOffset: offset });
        }}
      />
    </span>
  );
};

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
        placeholder="Client"
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
  const label = statusLabelMap.get(status as PredefinedStatusId) ?? status;
  const enabledNonTerminal = useTaskStatusConfigStore(useShallow(selectEnabledNonTerminal));
  const enabledTerminal = useTaskStatusConfigStore(useShallow(selectEnabledTerminal));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={SEGMENT}
          aria-label={`Status: ${label}`}
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
        {/* Inbox always available */}
        <button
          type="button"
          onClick={() => {
            void onUpdate({ id: task.id, status: 'inbox' });
            useToastStore.getState().showToast('Moved to Inbox', async () => {
              await getUntask().tasks.undoLastUserAction();
              await useTaskStore.getState().refreshTasks();
            });
            setOpen(false);
          }}
          className={cn(
            'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            status === 'inbox' && 'text-foreground',
          )}
        >
          Inbox
        </button>
        {/* Enabled non-terminal statuses */}
        {enabledNonTerminal.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              void onUpdate({ id: task.id, status: id });
              useToastStore.getState().showToast(`Moved to ${statusLabelMap.get(id) ?? id}`, async () => {
                await getUntask().tasks.undoLastUserAction();
                await useTaskStore.getState().refreshTasks();
              });
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              status === id && 'text-foreground',
            )}
          >
            {statusLabelMap.get(id) ?? id}
          </button>
        ))}
        {/* Divider + terminal statuses */}
        {enabledTerminal.length > 0 && (
          <div className="my-1 h-px bg-border/40" />
        )}
        {enabledTerminal.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              void onUpdate({ id: task.id, status: id });
              useToastStore.getState().showToast(`Moved to ${statusLabelMap.get(id) ?? id}`, async () => {
                await getUntask().tasks.undoLastUserAction();
                await useTaskStore.getState().refreshTasks();
              });
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              status === id && 'text-foreground',
            )}
          >
            {statusLabelMap.get(id) ?? id}
          </button>
        ))}
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Recurrence Segment ────────────────────────────────────

const RECURRENCE_PRESETS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every 2 weeks', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'every weekday', label: 'Every weekday' },
];

const RecurrenceSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [open, setOpen] = useState(false);
  const [customN, setCustomN] = useState(2);
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const customTouched = useRef(false);
  const presetApplied = useRef(false);
  const isEmpty = !task.recurrence;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flash = useFlashHighlight(triggerRef);
  const prevRecurrence = useRef(task.recurrence);

  useEffect(() => {
    if (task.recurrence !== prevRecurrence.current) {
      prevRecurrence.current = task.recurrence;
      flash();
    }
  }, [task.recurrence, flash]);

  const handleOpenChange = (next: boolean) => {
    if (!next && customTouched.current && !presetApplied.current) {
      void onUpdate({ id: task.id, recurrence: `every ${customN} ${customUnit}` });
    }
    if (next) {
      customTouched.current = false;
      presetApplied.current = false;
    }
    setOpen(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(SEGMENT, isEmpty && SEGMENT_EMPTY)}
          aria-label={isEmpty ? 'Recurrence: none' : `Recurrence: ${task.recurrence}`}
        >
          {isEmpty ? '+ repeat' : task.recurrence}
        </button>
      </Popover.Trigger>
      <PopoverContent
        className="w-auto min-w-[140px] p-1"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {RECURRENCE_PRESETS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              presetApplied.current = true;
              void onUpdate({ id: task.id, recurrence: opt.value });
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              task.recurrence === opt.value && 'text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 border-t border-border/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Every</span>
          <div className="flex items-center rounded border border-border/40">
            <button
              type="button"
              onClick={() => { customTouched.current = true; setCustomN((n) => Math.max(1, n - 1)); }}
              className="px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Decrease"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 5L5 7L7 5" />
              </svg>
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={customN}
              onChange={(e) => {
                customTouched.current = true;
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 365) setCustomN(v);
                if (e.target.value === '') setCustomN(1);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  void onUpdate({ id: task.id, recurrence: `every ${customN} ${customUnit}` });
                  setOpen(false);
                }
                if (e.key === 'ArrowUp') { e.preventDefault(); setCustomN((n) => Math.min(365, n + 1)); }
                if (e.key === 'ArrowDown') { e.preventDefault(); setCustomN((n) => Math.max(1, n - 1)); }
              }}
              className="w-6 bg-transparent py-0.5 text-center text-xs text-foreground outline-none [appearance:textfield]"
            />
            <button
              type="button"
              onClick={() => { customTouched.current = true; setCustomN((n) => Math.min(365, n + 1)); }}
              className="px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Increase"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M7 5L5 3L3 5" />
              </svg>
            </button>
          </div>
          <select
            value={customUnit}
            onChange={(e) => { customTouched.current = true; setCustomUnit(e.target.value as 'days' | 'weeks' | 'months'); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                void onUpdate({ id: task.id, recurrence: `every ${customN} ${customUnit}` });
                setOpen(false);
              }
            }}
            className="rounded border border-border/40 bg-transparent px-1 py-0.5 text-xs text-foreground outline-none"
          >
            <option value="days">day(s)</option>
            <option value="weeks">week(s)</option>
            <option value="months">month(s)</option>
          </select>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => {
              presetApplied.current = true;
              void onUpdate({ id: task.id, recurrence: null });
              setOpen(false);
            }}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            Remove
          </button>
        )}
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

// ─── Attachment helpers ─────────────────────────────────────

function countAttachments(body: string | null): number {
  if (!body) return 0;
  try {
    const blocks = JSON.parse(body) as Array<{ type?: string }>;
    return blocks.filter(
      (b) => b.type === 'image' || b.type === 'file',
    ).length;
  } catch {
    return 0;
  }
}

// ─── Attachment Segment ─────────────────────────────────────

const AttachmentSegment = ({
  count,
  onAttach,
}: {
  count: number;
  onAttach: () => void;
}) => {
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onAttach();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(SEGMENT, isEmpty && SEGMENT_EMPTY)}
      aria-label={isEmpty ? 'Attach file' : `${count} attachment${count !== 1 ? 's' : ''} — click to add more`}
    >
      <Paperclip aria-hidden="true" className="mr-0.5 size-3" />
      {isEmpty ? 'attach' : count}
    </button>
  );
};

// ─── Metadata Line ──────────────────────────────────────────

const MetadataLine = ({
  task,
  onUpdate,
  subtaskCount,
  onRequestAddSubtask,
  attachmentCount,
  onAttach,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
  subtaskCount: number;
  onRequestAddSubtask?: () => void;
  attachmentCount: number;
  onAttach: () => void;
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
      <DueDateSegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <PrioritySegment task={task} onUpdate={onUpdate} />
      <MetaDot />
      <RecurrenceSegment task={task} onUpdate={onUpdate} />
      {!isSubtask && (
        <>
          <MetaDot />
          <StatusSegment task={task} onUpdate={onUpdate} />
          <MetaDot />
          <ClientSegment task={task} onUpdate={onUpdate} />
          <MetaDot />
          <AttachmentSegment
            count={attachmentCount}
            onAttach={onAttach}
          />
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
      {isSubtask && (
        <>
          <MetaDot />
          <AttachmentSegment
            count={attachmentCount}
            onAttach={onAttach}
          />
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
  indentPx?: number;
  onRequestAddSubtask?: () => void;
  onBodyEditModeChange?: (editing: boolean) => void;
};

export const TaskBody = ({
  task,
  isExpanded,
  subtaskCount,
  indentPx = 0,
  onRequestAddSubtask,
  onBodyEditModeChange,
}: TaskBodyProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const parentTask = useTaskStore(
    useCallback(
      (state: { tasks: Task[] }) =>
        task.parentId
          ? state.tasks.find((t) => t.id === task.parentId) ?? null
          : null,
      [task.parentId],
    ),
  );
  const selectTask = useTaskStore((state) => state.selectTask);
  const setView = useAppStore((state) => state.setView);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<string | null>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const devLatencyRef = useRef<DevLatencyApi>(NOOP_DEV_LATENCY);
  const openMetricKeyRef = useRef<string | null>(null);
  const hasRecordedOpenLatencyRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) {
      let disposed = false;
      void import('../../lib/devLatencyMetrics').then(({ devLatencyMetrics }) => {
        if (!disposed) {
          devLatencyRef.current = devLatencyMetrics;
        }
      });
      return () => {
        disposed = true;
        devLatencyRef.current = NOOP_DEV_LATENCY;
      };
    }
    return undefined;
  }, []);

  const [attachmentCount, setAttachmentCount] = useState(() => countAttachments(task.body));

  const handleAttach = useCallback(async () => {
    const result = await window.untask?.attachments.pickAndSave();
    if (!result || result.canceled || result.urls.length === 0) return;

    const editor = editorRef.current;
    if (!editor) return;

    const newBlocks = result.urls.map((url) => {
      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
      if (isImage) {
        return { type: 'image' as const, props: { url } };
      }
      return { type: 'file' as const, props: { url } };
    });

    const lastBlock = editor.document[editor.document.length - 1];
    editor.insertBlocks(newBlocks, lastBlock, 'after');
  }, []);

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
      const metricKey = openMetricKeyRef.current;
      if (!hasRecordedOpenLatencyRef.current && metricKey) {
        hasRecordedOpenLatencyRef.current = true;
        devLatencyRef.current.end('task-editor-open', metricKey);
      }
      pendingBodyRef.current = json;

      const newCount = countAttachments(json);
      setAttachmentCount((prev) => (prev !== newCount ? newCount : prev));

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const body = isEmptyDocument(json) ? null : json;
        // Do NOT clear pendingBodyRef here — only flushSave should clear it.
        // flushSave goes through updateTask() which syncs the Zustand store,
        // ensuring task.body is up-to-date before the editor unmounts on collapse.
        // Persist directly via IPC — bypass Zustand to avoid re-render/focus loss.
        // Suppress the TASK_DATA_CHANGED refresh so the broadcast from the main
        // process doesn't trigger a full store reload that steals editor focus.
        suppressTaskRefresh();
        void getUntask().tasks.update({ id: task.id, body }).finally(() => {
          setTimeout(unsuppressTaskRefresh, 200);
        });
      }, 2000);
    },
    [task.id],
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

  // Dev-only latency probe: expanded task editor -> first content change.
  useEffect(() => {
    if (!isExpanded) {
      if (!hasRecordedOpenLatencyRef.current && openMetricKeyRef.current) {
        devLatencyRef.current.cancel('task-editor-open', openMetricKeyRef.current);
      }
      openMetricKeyRef.current = null;
      hasRecordedOpenLatencyRef.current = false;
      return;
    }

    const key = String(task.id);
    openMetricKeyRef.current = key;
    hasRecordedOpenLatencyRef.current = false;
    devLatencyRef.current.start('task-editor-open', key);

    return () => {
      if (!hasRecordedOpenLatencyRef.current) {
        devLatencyRef.current.cancel('task-editor-open', key);
      }
      if (openMetricKeyRef.current === key) {
        openMetricKeyRef.current = null;
      }
    };
  }, [isExpanded, task.id]);

  const handleFocus = useCallback(() => {
    onBodyEditModeChange?.(true);
  }, [onBodyEditModeChange]);

  const handleBlur = useCallback(() => {
    onBodyEditModeChange?.(false);
  }, [onBodyEditModeChange]);

  return (
    <div className="overflow-hidden">
      {/* Part-of reference — subtask context */}
      {parentTask && indentPx === 0 && (
        <div className="border-t border-border/30 px-3 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const view = parentTask.today ? 'today'
                : parentTask.status === 'inbox' ? 'inbox'
                : 'tasks';
              setView(view);
              selectTask(parentTask.id);
            }}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/60 transition-colors duration-150 hover:text-muted-foreground"
          >
            <span aria-hidden="true">↳</span>
            {parentTask.title}
          </button>
        </div>
      )}

      {/* Zone 1 — Body Editor (hero) */}
      <div className={cn(
        'px-3 py-3',
        !parentTask && 'border-t border-border/30',
      )}>
        <BlockEditor
          content={task.body ?? ''}
          onChange={handleBodyChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="untask-task-editor"
          preset="task"
          contextMenuMode="off"
          editorRef={editorRef}
          getSlashMenuItems={getAttachmentSlashMenuItems}
        />
      </div>

      {/* Zone 2 — Metadata Line */}
      <MetadataLine
        task={task}
        onUpdate={updateTask}
        subtaskCount={subtaskCount}
        onRequestAddSubtask={onRequestAddSubtask}
        attachmentCount={attachmentCount}
        onAttach={handleAttach}
      />
    </div>
  );
};
