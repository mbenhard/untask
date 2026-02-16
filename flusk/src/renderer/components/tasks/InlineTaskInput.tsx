import { useCallback, useEffect, useRef, useState } from 'react';

import { Plus } from 'lucide-react';

import { useTaskStore } from '../../stores/taskStore';
import { Input } from '../ui';

type InlineTaskInputProps = {
  parentId?: string | null;
  defaultStatus?: 'inbox' | 'active';
  defaultToday?: boolean;
  placeholder?: string;
  label?: string;
  alwaysOpen?: boolean;
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
  triggerOpen,
}: InlineTaskInputProps) => {
  const createTask = useTaskStore((state) => state.createTask);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSeenTriggerRef = useRef<number | undefined>(triggerOpen);
  const [isOpen, setIsOpen] = useState(alwaysOpen);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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
    }

    lastSeenTriggerRef.current = triggerOpen;
  }, [triggerOpen]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || isCreating) {
      return;
    }

    setIsCreating(true);
    const created = await createTask({
      title: normalizedTitle,
      parentId: parentId ?? undefined,
      status: defaultStatus,
      priority: 'none',
      today: defaultToday,
    });
    setIsCreating(false);

    if (!created) {
      return;
    }

    setTitle('');
  }, [createTask, defaultStatus, defaultToday, isCreating, parentId, title]);

  if (!isOpen && !alwaysOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex size-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={label}
        title={label}
      >
        <Plus className="size-3.5" />
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        if (!alwaysOpen && title.trim().length === 0) {
          setIsOpen(false);
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
          setTitle('');
          if (!alwaysOpen) {
            setIsOpen(false);
          }
        }
      }}
      placeholder={
        isCreating
          ? 'Creating...'
          : (placeholder ?? 'Type and press Enter')
      }
      disabled={isCreating}
      className="h-8 border-0 border-b border-dashed border-border/50 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
      aria-label={label}
    />
  );
};
