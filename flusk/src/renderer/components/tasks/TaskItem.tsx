import { type CSSProperties, useEffect, useState } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Check, GripVertical, Pencil, Sun } from 'lucide-react';

import type { Task } from '../../../types/models';
import { cn } from '../../lib/utils';
import { useTaskStore } from '../../stores/taskStore';
import { TaskBody } from './TaskBody';

export interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  isFocused: boolean;
  isEditingTitle: boolean;
  onStartTitleEdit: (id: string) => void;
  onEndTitleEdit: () => void;
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onBodyEditModeChange?: (editing: boolean) => void;
  onFocus?: () => void;
}

export const TaskItem = ({
  task,
  isExpanded,
  isFocused,
  isEditingTitle,
  onStartTitleEdit,
  onEndTitleEdit,
  onToggleExpand,
  onComplete,
  onToggleToday,
  onBodyEditModeChange,
  onFocus,
}: TaskItemProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const [titleDraft, setTitleDraft] = useState(task.title);

  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCompleted = task.status === 'done';
  const isToday = task.today === true;

  const saveTitleDraft = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      void updateTask({ id: task.id, title: trimmed });
    } else {
      setTitleDraft(task.title);
    }
    onEndTitleEdit();
  };

  const cancelTitleEdit = () => {
    setTitleDraft(task.title);
    onEndTitleEdit();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      role="option"
      aria-selected={isExpanded}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      className={cn(
        'overflow-hidden border-b border-border/40 outline-none transition-colors duration-100',
        isFocused && 'bg-accent/20',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <div
        onClick={() => onToggleExpand(task.id)}
        className="group flex min-h-10 items-center gap-2 px-1.5"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onComplete(task.id);
          }}
          aria-label={`Mark "${task.title}" complete`}
          className="inline-flex size-5 items-center justify-center text-foreground/90 outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <motion.span
            initial={false}
            animate={{
              scale: isCompleted ? 1 : 0.9,
              backgroundColor: isCompleted ? 'var(--foreground)' : 'transparent',
              borderColor: isCompleted ? 'var(--foreground)' : 'var(--border)',
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="inline-flex size-4 items-center justify-center border"
          >
            <Check
              className={cn(
                'size-3 transition-opacity duration-300',
                isCompleted ? 'opacity-100 text-background' : 'opacity-0',
              )}
            />
          </motion.span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveTitleDraft();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTitleEdit();
                  }
                  event.stopPropagation();
                }}
                onBlur={saveTitleDraft}
                onClick={(event) => event.stopPropagation()}
                className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-foreground outline-none ring-1 ring-ring px-1"
              />
            ) : (
              <>
                <p
                  className={cn(
                    'truncate text-[13px] text-foreground',
                    isCompleted && 'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                </p>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartTitleEdit(task.id);
                  }}
                  className="hidden size-5 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:text-foreground focus-visible:flex focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Edit title for "${task.title}"`}
                >
                  <Pencil className="size-3" />
                </button>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleToday(task.id);
          }}
          aria-label={`Toggle today for "${task.title}"`}
          className={cn(
            'inline-flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
            isToday
              ? 'text-foreground'
              : 'hover:text-foreground',
          )}
        >
          <Sun className="size-3.5" />
        </button>

        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(event) => {
            event.stopPropagation();
          }}
          aria-label={`Reorder "${task.title}"`}
          className="inline-flex size-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      <TaskBody
        task={task}
        isExpanded={isExpanded}
        onBodyEditModeChange={onBodyEditModeChange}
      />
    </div>
  );
};
