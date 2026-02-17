import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Calendar as CalendarIcon, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button, Calendar, Popover, PopoverContent } from '../ui';
import { formatDueDateDisplay, parseDueDate, parseDueTime, toISODateTime } from './dueDate';

export interface TaskDueDatePickerProps {
  dueDate: string | null;
  onChange: (next: string | null) => void | Promise<void>;
  emptyLabel: string;
  variant: 'row' | 'meta' | 'segment';
}

const ROW_TRIGGER_BASE =
  'inline-flex h-6 items-center rounded border px-1.5 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring';
const META_TRIGGER_BASE =
  'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring';
const SEGMENT_TRIGGER_BASE =
  'inline-flex items-center py-1 -my-1 cursor-pointer transition-colors duration-150 hover:text-foreground focus-visible:bg-accent/30 focus-visible:rounded-sm focus-visible:px-1 focus-visible:-mx-1 outline-none';

const clampHours = (v: number) => Math.max(0, Math.min(23, v));
const clampMinutes = (v: number) => Math.max(0, Math.min(59, v));

const TimeInput = ({
  value,
  onChange,
  onDone,
  inputRef,
  autoFocus = false,
}: {
  value: string | null;
  onChange: (time: string | null) => void;
  onDone?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
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
    <div className="flex items-center justify-center gap-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">Time</span>
      <input
        ref={resolvedInputRef}
        autoFocus={autoFocus}
        type="text"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        onClick={(e) => e.stopPropagation()}
        placeholder="HH:MM"
        className="w-14 rounded border border-border/60 bg-transparent px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground outline-none focus:border-ring"
      />
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
            setDraft('');
          }}
          className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Clear time"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
};

export const TaskDueDatePicker = ({
  dueDate,
  onChange,
  emptyLabel,
  variant,
}: TaskDueDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseDueDate(dueDate), [dueDate]);
  const currentTime = useMemo(() => parseDueTime(dueDate), [dueDate]);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const displayLabel = dueDate ? formatDueDateDisplay(dueDate) : emptyLabel;

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
      if (!date) return; // Prevent accidental clear on re-click
      const nextValue = toISODateTime(date, currentTime);
      void onChange(nextValue);
    },
    [currentTime, onChange],
  );

  const handleTimeChange = useCallback(
    (time: string | null) => {
      if (!selected) return;
      const nextValue = toISODateTime(selected, time);
      void onChange(nextValue);
    },
    [onChange, selected],
  );

  const handleTimeDone = useCallback(() => {
    setOpen(false);
  }, []);

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
        className="w-auto p-0"
        align="start"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Calendar
          mode="single"
          required={!!selected}
          selected={selected}
          defaultMonth={selected}
          className="p-2 [--cell-size:1.5rem]"
          onSelect={handleDateSelect}
        />

        {selected ? (
          <div className="border-t border-border px-3 py-2">
            <TimeInput
              value={currentTime}
              onChange={handleTimeChange}
              onDone={handleTimeDone}
              inputRef={timeInputRef}
            />
          </div>
        ) : null}

        {dueDate ? (
          <div className="border-t border-border px-2 py-2">
            <Button
              variant="ghost"
              size="xs"
              className="w-full text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                void onChange(null);
                setOpen(false);
              }}
            >
              Clear due date
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover.Root>
  );
};
