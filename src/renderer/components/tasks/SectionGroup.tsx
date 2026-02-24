import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { ChevronRight, Plus } from 'lucide-react';

import type { TaskStatus } from '../../../types/models';
import { cn } from '../../lib/utils';
import { InlineTaskInput } from './InlineTaskInput';

export type AddTaskConfig = {
  defaultStatus: Exclude<TaskStatus, 'done'>;
  defaultToday?: boolean;
  showMetadata?: boolean;
  placeholder?: string;
};

export type SectionGroupProps = {
  sectionId: string;
  label: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  isDropTarget?: boolean;
  dropRef?: (node: HTMLElement | null) => void;
  addTaskConfig?: AddTaskConfig;
  /** External signal to open the add input (e.g. keyboard shortcut `n`) */
  triggerAdd?: number;
  /** Callback when focus should move to the task list */
  onRequestFocus?: () => void;
  children: ReactNode;
};

export const SectionGroup = ({
  sectionId,
  label,
  count,
  isCollapsed,
  onToggle,
  isDropTarget = false,
  dropRef,
  addTaskConfig,
  triggerAdd,
  onRequestFocus,
  children,
}: SectionGroupProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const lastSeenTriggerRef = useRef<number | undefined>(triggerAdd);

  // Dismiss input when section collapses
  useEffect(() => {
    if (isCollapsed) {
      setIsAdding(false);
    }
  }, [isCollapsed]);

  // External trigger (keyboard shortcut)
  useEffect(() => {
    if (
      typeof triggerAdd === 'number' &&
      typeof lastSeenTriggerRef.current === 'number' &&
      triggerAdd > lastSeenTriggerRef.current
    ) {
      if (isCollapsed) {
        onToggle();
      }
      setIsAdding(true);
    }

    lastSeenTriggerRef.current = triggerAdd;
  }, [triggerAdd, isCollapsed, onToggle]);

  const handleAddClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isCollapsed) {
        onToggle();
      }
      setIsAdding(true);
    },
    [isCollapsed, onToggle],
  );

  const handleDismiss = useCallback(() => {
    setIsAdding(false);
    onRequestFocus?.();
  }, [onRequestFocus]);

  return (
    <section
      ref={dropRef}
      className={cn(
        'rounded-md border border-border/60 transition-all duration-200',
        isDropTarget && 'border-ring bg-accent/30 shadow-sm shadow-ring/10',
      )}
    >
      <div className="flex items-center px-2 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={!isCollapsed}
          aria-controls={`section-${sectionId}`}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'size-3.5 text-muted-foreground transition-transform',
              !isCollapsed && 'rotate-90',
            )}
          />
          <span className="text-[12px] font-medium text-foreground">
            {label}
          </span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {count}
          </span>
        </button>

        {addTaskConfig ? (
          <button
            type="button"
            onClick={handleAddClick}
            className="ml-1.5 inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground/40 transition-colors hover:text-foreground"
            aria-label={`Add to ${label}`}
          >
            <Plus className="size-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {!isCollapsed ? (
        <div id={`section-${sectionId}`} className="border-t border-border/60 px-1 py-1">
          {isAdding && addTaskConfig ? (
            <InlineTaskInput
              parentId={null}
              defaultStatus={addTaskConfig.defaultStatus}
              defaultToday={addTaskConfig.defaultToday}
              showMetadata={addTaskConfig.showMetadata ?? false}
              placeholder={addTaskConfig.placeholder}
              alwaysOpen={true}
              onDismiss={handleDismiss}
              triggerOpen={triggerAdd}
            />
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
};
