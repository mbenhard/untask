import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Calendar as CalendarIcon, Clock, Bell } from 'lucide-react';

import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import type { ReminderOffset } from '../../stores/taskStore';
import { Button, Calendar, Popover, PopoverContent } from '../ui';
import { formatDueDateDisplay, parseDueDate, parseDueTime, toISODateTime } from './dueDate';

export interface TaskDueDatePickerProps {
  dueDate: string | null;
  onChange: (next: string | null) => void | Promise<void>;
  emptyLabel: string;
  variant: 'row' | 'meta' | 'segment';
  reminderOffset?: ReminderOffset | null;
  onReminderOffsetChange?: (offset: ReminderOffset) => void;
  recurrence?: string | null;
  onRecurrenceChange?: (next: string | null) => void;
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

const RECURRENCE_PRESETS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every 2 weeks', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'every weekday', label: 'Every weekday' },
];

export const TaskDueDatePicker = ({
  dueDate,
  onChange,
  emptyLabel,
  variant,
  reminderOffset,
  onReminderOffsetChange,
  recurrence,
  onRecurrenceChange,
}: TaskDueDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [repeatExpanded, setRepeatExpanded] = useState(!!recurrence);
  const [notifBlocked, setNotifBlocked] = useState(false);
  const [customN, setCustomN] = useState(2);
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const customNRef = useRef(customN);
  const customUnitRef = useRef(customUnit);
  const recurrenceRef = useRef(recurrence);
  customNRef.current = customN;
  customUnitRef.current = customUnit;
  recurrenceRef.current = recurrence;
  const customTouched = useRef(false);
  const presetApplied = useRef(false);

  // Probe notification permission once on mount
  useEffect(() => {
    if (!onReminderOffsetChange) return;
    let cancelled = false;
    getUntask().notifications.probePermission().then((result) => {
      if (!cancelled) setNotifBlocked(result.status === 'denied');
    }).catch(() => {
      // ignore notification permission errors
    });
    return () => { cancelled = true; };
  }, [onReminderOffsetChange]);

  const selected = useMemo(() => parseDueDate(dueDate), [dueDate]);
  const currentTime = useMemo(() => parseDueTime(dueDate), [dueDate]);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const dateLabel = dueDate ? formatDueDateDisplay(dueDate) : emptyLabel;
  const displayLabel = dueDate && recurrence ? `${dateLabel} · ${recurrence}` : dateLabel;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && onRecurrenceChange && customTouched.current && !presetApplied.current) {
        onRecurrenceChange(`every ${customNRef.current} ${customUnitRef.current}`);
      }
      if (next) {
        customTouched.current = false;
        presetApplied.current = false;
        setRepeatExpanded(!!recurrenceRef.current);
      }
      setOpen(next);
    },
    [onRecurrenceChange],
  );

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
    variant === 'segment' && !dueDate && 'text-muted-foreground/70',
    variant === 'meta' && dueDate && 'bg-transparent',
  );

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      const nextValue = toISODateTime(date, currentTime);
      void onChange(nextValue);
    },
    [currentTime, onChange],
  );

  const handleTimeChange = useCallback(
    (time: string | null) => {
      const baseDate = selected ?? today;
      const nextValue = toISODateTime(baseDate, time);
      void onChange(nextValue);
    },
    [onChange, selected, today],
  );

  const handleReminderOffsetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as ReminderOffset;
      onReminderOffsetChange?.(next);
    },
    [onReminderOffsetChange],
  );

  const [draft, setDraft] = useState(currentTime ?? '');

  useEffect(() => {
    setDraft(currentTime ?? '');
  }, [currentTime]);

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        handleTimeChange(null);
        return;
      }

      const match = /^(\d{1,2}):?(\d{2})$/.exec(trimmed);
      if (!match) {
        setDraft(currentTime ?? '');
        return;
      }

      const h = clampHours(Number(match[1]));
      const m = clampMinutes(Number(match[2]));
      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      setDraft(formatted);
      handleTimeChange(formatted);
    },
    [handleTimeChange, currentTime],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(currentTime ?? '');
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const input = timeInputRef.current;
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
      handleTimeChange(next);

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
    raw = raw.replace(/:+/g, ':');

    if (raw.length === 2 && !raw.includes(':') && draft.length < raw.length) {
      raw = `${raw}:`;
    }

    if (raw.length > 5) {
      raw = raw.slice(0, 5);
    }

    setDraft(raw);
  };

  return (
    <Popover.Root open={open} onOpenChange={onRecurrenceChange ? handleOpenChange : setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={dueDate ? 'Edit due date' : 'Add due date'}
          className={triggerClassName}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {variant === 'meta' ? <CalendarIcon className="size-3" aria-hidden="true" /> : null}
          {displayLabel}
        </button>
      </Popover.Trigger>

      <PopoverContent
        className="w-64 p-0"
        align="start"
        onKeyDown={(event) => event.stopPropagation()}
      >
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

        {/* Time — only once a date is picked */}
        {dueDate && (
          <div className="border-t border-border px-2 py-2">
            <div className="flex items-center justify-center gap-2">
              <div className="flex items-center gap-1">
                <Clock className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={timeInputRef}
                  type="text"
                  value={draft}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => commit(draft)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="HH:MM"
                  className="w-14 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-center font-mono text-xs text-foreground outline-none transition-colors focus:border-ring focus:bg-muted/60"
                />
              </div>

              {/* Reminder — only once a time is set */}
              {onReminderOffsetChange && currentTime && (
                <>
                  <div className="h-3 w-px bg-border" />
                  <Bell className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <select
                    value={reminderOffset ?? 'at_due'}
                    onChange={handleReminderOffsetChange}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs text-foreground outline-none transition-colors focus:border-ring"
                  >
                    {(Object.keys(REMINDER_OFFSET_LABELS) as ReminderOffset[]).map((key) => (
                      <option key={key} value={key}>
                        {REMINDER_OFFSET_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            {notifBlocked && currentTime ? (
              <p className="mt-1.5 text-[10px] text-amber-500 leading-relaxed">
                Reminders won&apos;t work — notifications are blocked.{' '}
                <button
                  type="button"
                  className="underline hover:text-amber-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    void getUntask().notifications.openSettings();
                  }}
                >
                  Fix in Settings
                </button>
              </p>
            ) : null}
          </div>
        )}

        {/* Recurrence — only when onRecurrenceChange is provided and date is set */}
        {onRecurrenceChange && dueDate && (
          <div className="border-t border-border/40 p-1">
            <button
              type="button"
              onClick={() => setRepeatExpanded((v) => !v)}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              <span>Repeat{recurrence ? ` · ${recurrence}` : ''}</span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className={cn('transition-transform', repeatExpanded && 'rotate-180')}
              >
                <path d="M3 4L5 6L7 4" />
              </svg>
            </button>
            {repeatExpanded && (
              <>
                {RECURRENCE_PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      presetApplied.current = true;
                      onRecurrenceChange(opt.value);
                    }}
                    className={cn(
                      'flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                      recurrence === opt.value && 'text-foreground',
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
                          onRecurrenceChange(`every ${customN} ${customUnit}`);
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
                        onRecurrenceChange(`every ${customN} ${customUnit}`);
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
                {recurrence && (
                  <button
                    type="button"
                    onClick={() => {
                      presetApplied.current = true;
                      onRecurrenceChange(null);
                    }}
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    Remove repeat
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Clear button — always visible, disabled when no date */}
        <div className="border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              'w-full text-destructive hover:bg-destructive/10 hover:text-destructive',
              !dueDate && 'pointer-events-none opacity-50',
            )}
            disabled={!dueDate}
            onClick={(event) => {
              event.stopPropagation();
              void onChange(null);
              onRecurrenceChange?.(null);
              setOpen(false);
            }}
          >
            Clear date{recurrence ? ' & repeat' : ''}
          </Button>
        </div>
      </PopoverContent>
    </Popover.Root>
  );
};
