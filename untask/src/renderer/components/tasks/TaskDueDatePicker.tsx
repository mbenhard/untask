import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Calendar as CalendarIcon, Clock, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import type { ReminderOffset } from '../../stores/taskStore';
import { Button, Calendar, Popover, PopoverContent } from '../ui';
import { formatDueDateDisplay, parseDueDate, parseDueTime, toISODate, toISODateTime } from './dueDate';

export interface TaskDueDatePickerProps {
  dueDate: string | null;
  onChange: (next: string | null) => void | Promise<void>;
  emptyLabel: string;
  variant: 'row' | 'meta' | 'segment';
  reminderOffset?: ReminderOffset | null;
  onReminderOffsetChange?: (offset: ReminderOffset) => void;
}

const ROW_TRIGGER_BASE =
  'inline-flex h-6 items-center rounded border px-1.5 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring';
const META_TRIGGER_BASE =
  'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring';
const SEGMENT_TRIGGER_BASE =
  'inline-flex items-center py-1 -my-1 cursor-pointer transition-colors duration-150 hover:text-foreground focus-visible:bg-accent/30 focus-visible:rounded-sm focus-visible:px-1 focus-visible:-mx-1 outline-none';

const clampHours = (v: number) => Math.max(0, Math.min(23, v));
const clampMinutes = (v: number) => Math.max(0, Math.min(59, v));

const REMINDER_OFFSET_LABELS: Record<ReminderOffset, string> = {
  at_due: 'At due time',
  '15m': '15 min before',
  '1h': '1 hour before',
  '1d': '1 day before',
};

const getNextMonday = (): Date => {
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  return monday;
};

const TimeInput = ({
  value,
  onChange,
  onDone,
  inputRef,
  disabled = false,
}: {
  value: string | null;
  onChange: (time: string | null) => void;
  onDone?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}) => {
  const [draft, setDraft] = useState(value ?? '');
  const localInputRef = useRef<HTMLInputElement>(null);
  const resolvedInputRef = inputRef ?? localInputRef;

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        onChange(null);
        return;
      }

      const match = /^(\d{1,2}):?(\d{2})$/.exec(trimmed);
      if (!match) {
        setDraft(value ?? '');
        return;
      }

      const h = clampHours(Number(match[1]));
      const m = clampMinutes(Number(match[2]));
      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      setDraft(formatted);
      onChange(formatted);
    },
    [onChange, value],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      onDone?.();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value ?? '');
      onDone?.();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const input = resolvedInputRef.current;
      if (!input) return;

      const cursor = input.selectionStart ?? 0;
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      const current = draft || '00:00';
      const parts = current.split(':');
      let h = Number(parts[0]) || 0;
      let m = Number(parts[1]) || 0;

      if (cursor <= 2) {
        h = clampHours(h + delta);
      } else {
        m = clampMinutes(m + delta);
      }

      const next = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      setDraft(next);
      onChange(next);

      requestAnimationFrame(() => {
        if (cursor <= 2) {
          input.setSelectionRange(0, 2);
        } else {
          input.setSelectionRange(3, 5);
        }
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d:]/g, '');

    // Auto-insert colon: when typing "14" → "14:"
    if (raw.length === 2 && !raw.includes(':') && draft.length < raw.length) {
      raw = `${raw}:`;
    }

    // Limit length
    if (raw.length > 5) {
      raw = raw.slice(0, 5);
    }

    setDraft(raw);
  };

  return (
    <div className={cn('flex items-center gap-2', disabled && 'pointer-events-none opacity-40')}>
      <Clock className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Time</span>
      <div className="ml-auto flex items-center gap-1.5">
        <input
          ref={resolvedInputRef}
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          onClick={(e) => e.stopPropagation()}
          placeholder="HH:MM"
          disabled={disabled}
          className="w-16 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-center font-mono text-xs text-foreground outline-none transition-colors focus:border-ring focus:bg-muted/60"
        />
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              setDraft('');
            }}
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Clear time"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export const TaskDueDatePicker = ({
  dueDate,
  onChange,
  emptyLabel,
  variant,
  reminderOffset,
  onReminderOffsetChange,
}: TaskDueDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseDueDate(dueDate), [dueDate]);
  const currentTime = useMemo(() => parseDueTime(dueDate), [dueDate]);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const displayLabel = dueDate ? formatDueDateDisplay(dueDate) : emptyLabel;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const triggerClassName = cn(
    variant === 'row'
      ? ROW_TRIGGER_BASE
      : variant === 'meta'
        ? META_TRIGGER_BASE
        : SEGMENT_TRIGGER_BASE,
    variant !== 'segment' &&
    (dueDate
      ? 'border-border bg-muted text-muted-foreground hover:text-foreground'
      : 'border-dashed border-border text-muted-foreground hover:text-foreground'),
    variant === 'segment' && !dueDate && 'text-muted-foreground/50',
    variant === 'meta' && dueDate && 'bg-transparent',
  );

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      const nextValue = toISODateTime(date, currentTime);
      void onChange(nextValue);
      // Keep popover open so user can optionally set a time
    },
    [currentTime, onChange],
  );

  const handlePresetClick = useCallback(
    (date: Date) => {
      const nextValue = toISODate(date);
      void onChange(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  const handleTimeChange = useCallback(
    (time: string | null) => {
      // If no date is selected yet, default to today
      const baseDate = selected ?? today;
      const nextValue = toISODateTime(baseDate, time);
      void onChange(nextValue);
    },
    [onChange, selected, today],
  );

  const handleTimeDone = useCallback(() => {
    setOpen(false);
  }, []);

  const handleReminderOffsetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onReminderOffsetChange?.(e.target.value as ReminderOffset);
    },
    [onReminderOffsetChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={dueDate ? 'Edit due date' : 'Add due date'}
          className={triggerClassName}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {variant === 'meta' ? <CalendarIcon className="size-3" /> : null}
          {displayLabel}
        </button>
      </Popover.Trigger>

      <PopoverContent
        className="w-64 p-0"
        align="start"
        onKeyDown={(event) => event.stopPropagation()}
      >
        {/* Quick presets */}
        <div className="flex gap-1.5 border-b border-border px-3 py-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePresetClick(new Date());
            }}
            className="flex-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              handlePresetClick(tomorrow);
            }}
            className="flex-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePresetClick(getNextMonday());
            }}
            className="flex-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
          >
            Next Mon
          </button>
        </div>

        {/* Calendar */}
        <Calendar
          mode="single"
          required={!!selected}
          selected={selected}
          defaultMonth={selected}
          disabled={{ before: today }}
          className="w-full p-2"
          onSelect={handleDateSelect}
        />

        {/* Time input — always visible, disabled when no date */}
        <div className="border-t border-border px-3 py-2.5">
          <TimeInput
            value={currentTime}
            onChange={handleTimeChange}
            onDone={handleTimeDone}
            inputRef={timeInputRef}
            disabled={false}
          />
        </div>

        {/* Reminder offset selector — visible only when handler provided */}
        {onReminderOffsetChange ? (
          <div
            className={cn(
              'flex items-center gap-2 border-t border-border px-3 py-2.5',
              !dueDate && 'pointer-events-none opacity-40',
            )}
          >
            <span className="text-xs text-muted-foreground">Remind me</span>
            <select
              value={reminderOffset ?? 'at_due'}
              onChange={handleReminderOffsetChange}
              onClick={(e) => e.stopPropagation()}
              disabled={!dueDate}
              className="ml-auto rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-foreground outline-none transition-colors focus:border-ring"
            >
              {(Object.keys(REMINDER_OFFSET_LABELS) as ReminderOffset[]).map((key) => (
                <option key={key} value={key}>
                  {REMINDER_OFFSET_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Clear button — always visible, disabled when no date */}
        <div className="border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              'w-full text-muted-foreground',
              !dueDate && 'pointer-events-none opacity-40',
            )}
            disabled={!dueDate}
            onClick={(event) => {
              event.stopPropagation();
              void onChange(null);
              setOpen(false);
            }}
          >
            Clear due date
          </Button>
        </div>
      </PopoverContent>
    </Popover.Root>
  );
};
