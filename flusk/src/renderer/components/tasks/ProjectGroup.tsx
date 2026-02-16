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
}: ProjectGroupProps) => {
  const prefersReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useMemo(() => `project-${parentTask.id}`, [parentTask.id]);

  return (
    <section>
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            'size-3.5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {parentTask.title}
        </span>
        <span className="text-[11px] text-muted-foreground">
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
            className="overflow-hidden"
          >
            <div className="space-y-2 px-1 pb-2">
              <div>
                <TaskList
                  tasks={[parentTask]}
                  allTasks={allTasks}
                  emptyMessage="No project details."
                  ariaLabel={`Project details for ${parentTask.title}`}
                  scopeId={`project-parent:${parentTask.id}`}
                />
              </div>

              <div className="space-y-1 pl-4">
                <TaskList
                  tasks={subtasks}
                  allTasks={allTasks}
                  emptyMessage="No active subtasks."
                  ariaLabel={`Subtasks for ${parentTask.title}`}
                  scopeId={`project:${parentTask.id}`}
                />
                <InlineTaskInput parentId={parentTask.id} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};
