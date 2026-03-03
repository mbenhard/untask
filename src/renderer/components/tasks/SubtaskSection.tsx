import { useCallback, useRef, useState } from 'react';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

import type { Task } from '../../../types/models';
import { fadeVariants } from '../../lib/animation';
import { useTaskStore } from '../../stores/taskStore';
import { TaskList } from './TaskList';

// ─── Types ───────────────────────────────────────────────────

type SubtaskSectionProps = {
  parentTask: Task;
  subtasks: Task[];
  allTasks: Task[];
};

// ─── Main Component ─────────────────────────────────────────

export const SubtaskSection = ({
  parentTask,
  subtasks,
  allTasks,
}: SubtaskSectionProps) => {
  const createTask = useTaskStore((state) => state.createTask);

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const newInputRef = useRef<HTMLInputElement>(null);

  const doneCount = subtasks.filter((t) => t.status === 'done').length;

  const handleAddSubtask = useCallback(() => {
    setIsAdding(true);
    setNewTitle('');
    requestAnimationFrame(() => newInputRef.current?.focus());
  }, []);

  const handleCreateSubtask = useCallback(
    (title: string) => {
      if (!title.trim()) return;
      void createTask({
        title: title.trim(),
        parentId: parentTask.id,
        status: 'active',
        priority: 'none',
      });
    },
    [createTask, parentTask.id],
  );

  return (
    <div>
      {/* Section header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-medium text-foreground">
          Subtasks
          {subtasks.length > 0 && (
            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
              {doneCount}/{subtasks.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={handleAddSubtask}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>

      {/* Subtask list or empty state */}
      <div className="-mx-2">
      {subtasks.length === 0 && !isAdding ? (
        <motion.div
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.1 }}
          className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border/40 px-1 text-center"
        >
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground">No subtasks yet</p>
            <p className="text-[11px] text-muted-foreground">Click + Add to create one</p>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-md border border-border/60">
          {subtasks.length > 0 && (
            <TaskList
              tasks={subtasks}
              allTasks={allTasks}
              emptyMessage=""
              ariaLabel={`Subtasks for ${parentTask.title}`}
              scopeId={`detail-subtasks:${parentTask.id}`}
              hideParentRef
            />
          )}

          {/* Inline add input */}
          {isAdding && (
            <div className="flex min-h-9 items-center gap-2 border-t border-border/40 px-1.5">
              <span className="inline-flex size-6 items-center justify-center">
                <span className="inline-flex size-3.5 rounded-full border border-dashed border-border" />
              </span>
              <input
                ref={newInputRef}
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && newTitle.trim()) {
                    e.preventDefault();
                    handleCreateSubtask(newTitle);
                    setNewTitle('');
                    // Keep adding mode open for rapid entry
                  }
                  if (e.key === 'Enter' && !newTitle.trim()) {
                    e.preventDefault();
                    setIsAdding(false);
                    setNewTitle('');
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsAdding(false);
                    setNewTitle('');
                  }
                }}
                onBlur={() => {
                  if (newTitle.trim()) {
                    handleCreateSubtask(newTitle);
                  }
                  setIsAdding(false);
                  setNewTitle('');
                }}
                placeholder="New subtask..."
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};
