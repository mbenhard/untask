import { useCallback, useEffect, useRef, useState } from 'react';

import { Paperclip } from 'lucide-react';

import type { Task, PredefinedStatusId } from '../../../types/models';
import { PREDEFINED_STATUSES } from '../../../types/models';
import type { AttachmentRecord } from '../../../types/ipc';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import {
  type TagSuggestion,
  getTagSuggestions,
  invalidateTagSuggestionsCache,
} from '../../lib/tagSuggestionsCache';
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
import { Popover, PopoverContent } from '../ui';
import { TaskDueDatePicker } from './TaskDueDatePicker';
import { getNextPriority } from './taskInteraction';

import { AttachmentList } from './AttachmentList';
import { NoteSection } from './NoteSection';

// ─── Types & Constants ──────────────────────────────────────

export type UpdateTaskAction = (input: TaskUpdateInput) => Promise<Task | null>;

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

// ─── Dot Separator ──────────────────────────────────────────

export const MetaDot = () => (
  <span aria-hidden="true" className="text-border select-none">
    ·
  </span>
);

// ─── Priority Segment ───────────────────────────────────────

export const PrioritySegment = ({
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

export const DueDateSegment = ({
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

// ─── Tags Segment ──────────────────────────────────────────

const normalizeTag = (raw: string): string =>
  raw.replace(/,/g, '').trim().toLowerCase();

export const TagsSegment = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = task.tags ?? [];
  const isEmpty = tags.length === 0;

  useEffect(() => {
    if (open) {
      void getTagSuggestions().then(setSuggestions).catch(() => setSuggestions([]));
    }
  }, [open]);

  const filteredSuggestions = draft.trim()
    ? suggestions
        .filter((s) => s.tag.includes(draft.trim().toLowerCase()) && !tags.includes(s.tag))
        .slice(0, 6)
    : [];

  const addTag = (raw: string) => {
    const normalized = normalizeTag(raw);
    if (!normalized || tags.includes(normalized)) {
      setDraft('');
      return;
    }
    const next = [...tags, normalized];
    void onUpdate({ id: task.id, tags: next })
      .then((updated) => {
        if (updated) {
          invalidateTagSuggestionsCache();
        }
      })
      .catch(() => {});
    setDraft('');
    setSelectedSuggestionIndex(-1);
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    void onUpdate({ id: task.id, tags: next })
      .then((updated) => {
        if (updated) {
          invalidateTagSuggestionsCache();
        }
      })
      .catch(() => {});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && filteredSuggestions[selectedSuggestionIndex]) {
        addTag(filteredSuggestions[selectedSuggestionIndex].tag);
      } else if (draft.trim()) {
        addTag(draft);
      }
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((i) =>
        i < filteredSuggestions.length - 1 ? i + 1 : i,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((i) => (i > 0 ? i - 1 : -1));
    }
  };

  const displayLabel = isEmpty
    ? '+ tag'
    : tags.length === 1
      ? tags[0]
      : `${tags[0]} +${tags.length - 1}`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            SEGMENT,
            isEmpty && SEGMENT_EMPTY,
            !isEmpty && 'max-w-[140px] truncate',
          )}
          aria-label={isEmpty ? 'Add tag' : `Tags: ${tags.join(', ')}`}
        >
          {displayLabel}
        </button>
      </Popover.Trigger>
      <PopoverContent
        className="w-auto min-w-[180px] max-w-[280px] p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-mono text-foreground"
              >
                <span className="max-w-[100px] truncate">{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove tag ${tag}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSelectedSuggestionIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add tag..."
          className="w-full bg-transparent text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {filteredSuggestions.length > 0 && (
          <div className="mt-1 border-t border-border/40 pt-1">
            {filteredSuggestions.map((s, i) => (
              <button
                key={s.tag}
                type="button"
                onClick={() => addTag(s.tag)}
                className={cn(
                  'flex w-full items-center justify-between rounded-sm px-2 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  i === selectedSuggestionIndex && 'bg-accent text-foreground',
                )}
              >
                <span className="truncate">{s.tag}</span>
                <span className="ml-2 text-[10px] text-muted-foreground/60">{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover.Root>
  );
};

// ─── Status Segment ─────────────────────────────────────────

export const StatusSegment = ({
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

export const RecurrenceSegment = ({
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

// ─── Attachment Segment ─────────────────────────────────────

export const AttachmentSegment = ({
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

// ─── Note Segment ────────────────────────────────────────────

const NoteSegment = ({
  hasContent,
  onClick,
}: {
  hasContent: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    tabIndex={0}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    onKeyDown={(e) => e.stopPropagation()}
    className={cn(SEGMENT, !hasContent && SEGMENT_EMPTY)}
    aria-label={hasContent ? 'Note — click to scroll to note' : 'Add note'}
  >
    {hasContent ? 'note' : '+ note'}
  </button>
);

// ─── Metadata Line ──────────────────────────────────────────

const MetadataLine = ({
  task,
  onUpdate,
  subtaskCount,
  onRequestAddSubtask,
  attachmentCount,
  onAttach,
  noteHasContent,
  onNoteClick,
}: {
  task: Task;
  onUpdate: UpdateTaskAction;
  subtaskCount: number;
  onRequestAddSubtask?: () => void;
  attachmentCount: number;
  onAttach: () => void;
  noteHasContent: boolean;
  onNoteClick: () => void;
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
          <TagsSegment task={task} onUpdate={onUpdate} />
          <MetaDot />
          <AttachmentSegment
            count={attachmentCount}
            onAttach={onAttach}
          />
          <MetaDot />
          <NoteSegment hasContent={noteHasContent} onClick={onNoteClick} />
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
          <MetaDot />
          <NoteSegment hasContent={noteHasContent} onClick={onNoteClick} />
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
  hideParentRef?: boolean;
  onRequestAddSubtask?: () => void;
  onBodyEditModeChange?: (editing: boolean) => void;
};

export const TaskBody = ({
  task,
  isExpanded,
  subtaskCount,
  indentPx = 0,
  hideParentRef = false,
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

  // ── Attachments from DB ──

  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);

  const loadAttachments = useCallback(async () => {
    const result = await window.untask?.attachments.listByTask({ taskId: task.id });
    setAttachments(result ?? []);
  }, [task.id]);

  useEffect(() => {
    if (isExpanded) {
      void loadAttachments();
    }
  }, [isExpanded, loadAttachments]);

  const handleAttach = useCallback(async () => {
    const result = await window.untask?.attachments.pickAndSaveForTask({ taskId: task.id });
    if (!result || result.canceled) return;
    void loadAttachments();
  }, [task.id, loadAttachments]);

  // ── Note state ──

  const [noteHasContent, setNoteHasContent] = useState(() => {
    if (!task.body) return false;
    try {
      const blocks = JSON.parse(task.body) as Array<{ type?: string; content?: unknown[] }>;
      return blocks.some((b) => b.type === 'paragraph' && Array.isArray(b.content) && b.content.length > 0);
    } catch {
      return false;
    }
  });
  const [noteForceOpen, setNoteForceOpen] = useState(false);

  const handleNoteClick = useCallback(() => {
    setNoteForceOpen(true);
  }, []);

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

  return (
    <div className="overflow-hidden">
      {/* Part-of reference — subtask context */}
      {parentTask && indentPx === 0 && !hideParentRef && (
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

      {/* Zone 1 — Metadata Line */}
      <MetadataLine
        task={task}
        onUpdate={updateTask}
        subtaskCount={subtaskCount}
        onRequestAddSubtask={onRequestAddSubtask}
        attachmentCount={attachments.length}
        onAttach={handleAttach}
        noteHasContent={noteHasContent}
        onNoteClick={handleNoteClick}
      />

      {/* Zone 2 — Attachments (only when present) */}
      <AttachmentList
        taskId={task.id}
        attachments={attachments}
        onAttachmentsChange={loadAttachments}
      />

      {/* Zone 3 — Note section (collapsible text-only editor) */}
      <NoteSection
        taskId={task.id}
        body={task.body}
        forceOpen={noteForceOpen}
        onBodyChange={(hasContent) => {
          setNoteHasContent(hasContent);
          const metricKey = openMetricKeyRef.current;
          if (!hasRecordedOpenLatencyRef.current && metricKey) {
            hasRecordedOpenLatencyRef.current = true;
            devLatencyRef.current.end('task-editor-open', metricKey);
          }
        }}
        onOpenStateChange={(isOpen) => {
          if (!isOpen) setNoteForceOpen(false);
        }}
        onEditModeChange={onBodyEditModeChange}
      />
    </div>
  );
};
