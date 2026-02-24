import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Bookmark } from 'lucide-react';

import type { Task, TaskStatus } from '../../../types/models';
import { cn } from '../../lib/utils';
import { useTaskStore } from '../../stores/taskStore';
import { formatDueDateDisplay } from './dueDate';
import { TaskDueDatePicker } from './TaskDueDatePicker';
import { PRIORITY_DOT, PRIORITY_LABEL, SEGMENT, SEGMENT_EMPTY } from '../../lib/taskConstants';
import { getNextPriority } from './taskInteraction';

type InlineTaskInputProps = {
  parentId?: string | null;
  defaultStatus?: Exclude<TaskStatus, 'done'>;
  defaultToday?: boolean;
  placeholder?: string;
  label?: string;
  alwaysOpen?: boolean;
  showMetadata?: boolean;
  /** Called when the input should be dismissed (Escape, blur with empty). Parent controls visibility. */
  onDismiss?: () => void;
  /** External signal to open the input (e.g. from a keyboard shortcut) */
  triggerOpen?: number;
};

export const InlineTaskInput = ({
  parentId = null,
  defaultStatus = 'active',
  defaultToday,
  placeholder,
  label = parentId ? 'Add subtask' : 'Add task',
  alwaysOpen = false,
  showMetadata = false,
  onDismiss,
  triggerOpen,
}: InlineTaskInputProps) => {
  const createTask = useTaskStore((state) => state.createTask);
  const selectTask = useTaskStore((state) => state.selectTask);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSeenTriggerRef = useRef<number | undefined>(triggerOpen);
  const isCreatingRef = useRef(false);
  const lastCreatedIdRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(alwaysOpen || onDismiss !== undefined);
  const [title, setTitle] = useState('');

  // Metadata state
  const [priority, setPriority] = useState<NonNullable<Task['priority']>>('none');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [today, setToday] = useState(defaultToday ?? false);

  const dueDateLabel = useMemo(
    () => (dueDate ? formatDueDateDisplay(dueDate) : null),
    [dueDate],
  );

  const resetMetadata = useCallback(() => {
    setPriority('none');
    setDueDate(null);
    setToday(defaultToday ?? false);
  }, [defaultToday]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (
      typeof triggerOpen === 'number' &&
      typeof lastSeenTriggerRef.current === 'number' &&
      triggerOpen > lastSeenTriggerRef.current
    ) {
      setIsOpen(true);
      // Re-focus even if already open
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }

    lastSeenTriggerRef.current = triggerOpen;
  }, [triggerOpen]);

  const handleSubmit = useCallback(async (options?: { refocus?: boolean }): Promise<void> => {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || isCreatingRef.current) {
      return;
    }

    isCreatingRef.current = true;
    const created = await createTask({
      title: normalizedTitle,
      parentId: parentId ?? undefined,
      status: defaultStatus,
      priority: priority !== 'none' ? priority : 'none',
      today: today || defaultToday,
      dueDate,
    });
    isCreatingRef.current = false;

    if (!created) {
      return;
    }

    lastCreatedIdRef.current = created.id;
    setTitle('');
    resetMetadata();
    if (options?.refocus !== false) {
      inputRef.current?.focus();
    }
  }, [createTask, defaultStatus, defaultToday, dueDate, parentId, priority, resetMetadata, title, today]);

  if (!isOpen && !alwaysOpen) {
    return null;
  }

  const hasMetadataSet = priority !== 'none' || dueDate !== null || today !== (defaultToday ?? false);

  return (
    <div className="border-b border-border/40">
      {/* Main row — matches TaskItem */}
      <div className="flex min-h-10 items-center gap-2 px-1.5">
        {/* Zone 1: Ghost checkbox + priority dot */}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex size-6 items-center justify-center">
            <span
              className="inline-flex size-4 items-center justify-center rounded-full border border-dashed"
              style={{ borderColor: 'var(--foreground-muted, rgba(255,255,255,0.35))' }}
            />
          </span>
          <span
            className={cn(
              'size-[5px] rounded-full transition-colors duration-200',
              PRIORITY_DOT[priority],
            )}
          />
        </div>

        {/* Zone 2: Title input — matches TaskItem editing input */}
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={(event) => {
              // When focus moves to a task item (user clicked on a task),
              // submit any pending text but don't re-focus — and defer
              // the dismiss so the click lands on the task first.
              const relatedTarget = event.relatedTarget as HTMLElement | null;
              const blurredToTask = relatedTarget?.closest('[data-task-id]') != null;

              if (blurredToTask) {
                const trimmed = title.trim();
                if (trimmed.length > 0 || hasMetadataSet) {
                  void handleSubmit({ refocus: false });
                }
                // Dismiss after the click event has fired
                requestAnimationFrame(() => {
                  onDismiss?.();
                });
                return;
              }

              const trimmed = title.trim();
              if (trimmed.length > 0 || hasMetadataSet) {
                void handleSubmit();
                return;
              }

              if (title.trim().length === 0 && !hasMetadataSet) {
                if (onDismiss) {
                  onDismiss();
                } else if (!alwaysOpen) {
                  setIsOpen(false);
                  resetMetadata();
                }
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSubmit();
                return;
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                const taskIdToSelect = lastCreatedIdRef.current;
                setTitle('');
                resetMetadata();
                lastCreatedIdRef.current = null;
                // Navigate to the last-created task via the store so
                // TaskList focuses and expands it automatically.
                if (taskIdToSelect) {
                  selectTask(taskIdToSelect);
                }
                if (onDismiss) {
                  onDismiss();
                } else if (!alwaysOpen) {
                  setIsOpen(false);
                }
              }
            }}
            placeholder={placeholder ?? 'Type and press Enter'}
            className="min-w-0 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
            aria-label={label}
          />
        </div>

        {/* Zone 3: Right badges — show set metadata as badges */}
        <div className="ml-auto flex items-center gap-1">
          {dueDateLabel && (
            <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
              {dueDateLabel}
            </span>
          )}
          {today && defaultStatus !== 'inbox' && (
            <Bookmark className="size-3.5 text-foreground" fill="currentColor" />
          )}
        </div>
      </div>

      {/* Metadata row — matches TaskBody MetadataLine */}
      {showMetadata && isOpen ? (
        <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono text-muted-foreground">
          {/* Priority toggle */}
          <button
            type="button"
            tabIndex={0}
            onClick={() => setPriority((p) => getNextPriority(p))}
            className={cn(SEGMENT, priority === 'none' && SEGMENT_EMPTY)}
            aria-label={`Priority: ${priority} — click to cycle`}
          >
            {priority !== 'none' && (
              <span
                className={cn('mr-1 inline-block size-1.5 rounded-full', PRIORITY_DOT[priority])}
              />
            )}
            {PRIORITY_LABEL[priority]}
          </button>

          <span aria-hidden="true" className="text-border select-none">·</span>

          {/* Due date picker */}
          <TaskDueDatePicker
            dueDate={dueDate}
            emptyLabel="due date"
            variant="segment"
            onChange={(next) => setDueDate(next)}
          />

          {/* Today toggle — hidden for inbox tasks */}
          {defaultStatus !== 'inbox' ? (
            <>
              <span aria-hidden="true" className="text-border select-none">·</span>
              <button
                type="button"
                tabIndex={0}
                onClick={() => setToday((t) => !t)}
                className={cn(SEGMENT, !today && SEGMENT_EMPTY)}
                aria-label={today ? 'Remove from today' : 'Add to today'}
                aria-pressed={today}
              >
                today
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
