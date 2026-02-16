import { useCallback, useEffect, useRef, useState } from 'react';

import { Plus } from 'lucide-react';

import { useTaskStore } from '../../stores/taskStore';
import { Input } from '../ui';

type InlineTaskInputProps = {
  parentId: string;
};

export const InlineTaskInput = ({ parentId }: InlineTaskInputProps) => {
  const createTask = useTaskStore((state) => state.createTask);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || isCreating) {
      return;
    }

    setIsCreating(true);
    const created = await createTask({
      title: normalizedTitle,
      parentId,
      status: 'active',
      priority: 'none',
    });
    setIsCreating(false);

    if (!created) {
      return;
    }

    setTitle('');
    setIsOpen(false);
  }, [createTask, isCreating, parentId, title]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Plus className="size-3.5" />
        Add subtask
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        if (title.trim().length === 0) {
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
          setIsOpen(false);
        }
      }}
      placeholder={isCreating ? 'Creating...' : 'Write a subtask and press Enter'}
      disabled={isCreating}
      className="h-8 text-xs"
      aria-label="Add subtask"
    />
  );
};
