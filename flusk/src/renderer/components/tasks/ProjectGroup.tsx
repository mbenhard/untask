import { useMemo, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

import type { Task } from '../../../types/models';
import { cn } from '../../lib/utils';
import { InlineTaskInput } from './InlineTaskInput';
import { TaskList } from './TaskList';

export interface ProjectGroupProps {
  parentTask: Task;
  subtasks: Task[];
  allTasks: Task[];
  completedCount: number;
  totalCount: number;
}

export const ProjectGroup = ({
  parentTask,
  subtasks,
  allTasks,
  completedCount,
  totalCount,
}: ProjectGroupProps): JSX.Element => {
  const prefersReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useMemo(() => `project-${parentTask.id}`, [parentTask.id]);

  return (
    <section className="rounded-lg border border-border/80 bg-card/60">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {parentTask.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{totalCount}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            id={contentId}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-border/70"
          >
            <div className="space-y-2 px-3 py-2">
              <TaskList
                tasks={subtasks}
                allTasks={allTasks}
                emptyMessage="No active subtasks."
                ariaLabel={`Subtasks for ${parentTask.title}`}
                scopeId={`project:${parentTask.id}`}
                indentPx={20}
              />
              <div className="pl-5">
                <InlineTaskInput parentId={parentTask.id} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};
