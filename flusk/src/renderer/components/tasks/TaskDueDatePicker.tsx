import { useMemo, useState } from 'react';

import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button, Calendar, Popover, PopoverContent } from '../ui';
import { formatDueDateDisplay, parseDueDate, toISODate } from './dueDate';

export interface TaskDueDatePickerProps {
  dueDate: string | null;
  onChange: (next: string | null) => void | Promise<void>;
  emptyLabel: string;
  variant: 'row' | 'meta';
}

const ROW_TRIGGER_BASE =
  'inline-flex h-6 items-center rounded border px-1.5 text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring';
const META_TRIGGER_BASE =
  'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring';

export const TaskDueDatePicker = ({
  dueDate,
  onChange,
  emptyLabel,
  variant,
}: TaskDueDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseDueDate(dueDate), [dueDate]);
  const displayLabel = dueDate ? formatDueDateDisplay(dueDate) : emptyLabel;

  const triggerClassName = cn(
    variant === 'row' ? ROW_TRIGGER_BASE : META_TRIGGER_BASE,
    dueDate
      ? 'border-border bg-muted text-muted-foreground hover:text-foreground'
      : 'border-dashed border-border text-muted-foreground hover:text-foreground',
    variant === 'meta' && dueDate && 'bg-transparent',
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
        className="w-auto p-0"
        align="start"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          className="p-2 [--cell-size:1.75rem]"
          onSelect={(date) => {
            const nextValue = date ? toISODate(date) : null;
            void onChange(nextValue);
            setOpen(false);
          }}
        />

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
