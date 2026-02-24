import { Check, GripVertical } from 'lucide-react';

import type { Task } from '../../../types/models';
import { cn } from '../../lib/utils';
import { PRIORITY_DOT } from '../../lib/taskConstants';

export const DragPreview = ({ task }: { task: Task }) => {
  const isCompleted = task.status === 'done';
  const priority = task.priority ?? 'none';

  return (
    <div className="flex min-h-10 scale-[1.02] items-center gap-2 rounded-md border border-border/60 bg-background px-1.5 shadow-lg shadow-black/10">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex size-4 items-center justify-center rounded-full border',
            isCompleted
              ? 'border-foreground bg-foreground'
              : 'border-foreground/35',
          )}
        >
          {isCompleted && (
            <Check aria-hidden className="size-2.5 text-background" />
          )}
        </span>
        <span
          className={cn(
            'size-[5px] rounded-full',
            PRIORITY_DOT[priority],
          )}
        />
      </div>
      <p
        className={cn(
          'min-w-0 flex-1 truncate text-[13px] text-foreground',
          isCompleted && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </p>
      <GripVertical aria-hidden className="size-3.5 text-muted-foreground/50" />
    </div>
  );
};
