import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightLeft,
  Ban,
  Copy,
  FolderInput,
  Trash2,
} from 'lucide-react';

import {
  TERMINAL_STATUSES,
  type PredefinedStatusId,
  type Task,
} from '../../../types/models';
import { fadeVariants } from '../../lib/animation';
import { getUntask } from '../../lib/untask';
import type { ReminderOffset, TaskUpdateInput } from '../../stores/taskStore';
import { useTaskStore } from '../../stores/taskStore';
import { useTaskStatusConfigStore } from '../../stores/taskStatusConfigStore';
import { useToastStore } from '../../stores/toastStore';
import { Popover, PopoverContent } from '../ui';

// ─── Helpers ────────────────────────────────────────────────

const isReminderOffset = (value: string | null): value is ReminderOffset =>
  value !== null && ['at_due', '15m', '1h', '1d'].includes(value);

// ─── Types ──────────────────────────────────────────────────

export type TaskOverflowMenuProps = {
  task: Task;
  /** All tasks (for project list and recursive duplicate). */
  allTasks: Task[];
  /** Whether the menu popover is open. */
  open: boolean;
  /** Callback when open state changes. */
  onOpenChange: (open: boolean) => void;
  /** Number of active (non-terminal) subtasks. */
  activeChildrenCount: number;
  /** Whether the task can be moved to a project. */
  canMoveToProject: boolean;
  /** Called after the task is deleted. */
  onDeleted?: () => void;
  /** The trigger element (button). */
  children: React.ReactNode;
};

// ─── Component ──────────────────────────────────────────────

export const TaskOverflowMenu = ({
  task,
  allTasks,
  open,
  onOpenChange,
  activeChildrenCount,
  canMoveToProject,
  onDeleted,
  children,
}: TaskOverflowMenuProps) => {
  const updateTask = useTaskStore((state) => state.updateTask);
  const createTask = useTaskStore((state) => state.createTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const cancelTask = useTaskStore((state) => state.cancelTask);
  const enabledStatuses = useTaskStatusConfigStore((s) => s.config.enabled);

  const [menuView, setMenuView] = useState<'main' | 'projects' | 'delete-confirm'>('main');

  const cancelledEnabled = enabledStatuses.includes('cancelled');
  const isTerminal = TERMINAL_STATUSES.includes(task.status as PredefinedStatusId);

  const projects = useMemo(
    () =>
      canMoveToProject
        ? allTasks.filter(
            (t) =>
              t.parentId === null &&
              t.id !== task.id &&
              !TERMINAL_STATUSES.includes(t.status as PredefinedStatusId),
          )
        : [],
    [allTasks, canMoveToProject, task.id],
  );
  const showMoveToProject = canMoveToProject && projects.length > 0;

  // Reset menu view when closing
  useEffect(() => {
    if (open) return;
    const timeoutId = window.setTimeout(() => setMenuView('main'), 120);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  const handleDuplicate = useCallback(() => {
    onOpenChange(false);

    const currentTasks = allTasks;

    const duplicateRecursive = async (taskToCopy: Task, newParentId: string | null) => {
      const isTaskTerminal = TERMINAL_STATUSES.includes(taskToCopy.status as PredefinedStatusId);
      const created = await createTask({
        title: taskToCopy.title,
        parentId: newParentId,
        body: taskToCopy.body,
        status: isTaskTerminal ? 'active' : taskToCopy.status,
        priority: taskToCopy.priority,
        today: taskToCopy.today ?? undefined,
        client: taskToCopy.client,
        dueDate: taskToCopy.dueDate,
        dueType: taskToCopy.dueType,
        effort: taskToCopy.effort,
        reminderOffset: isReminderOffset(taskToCopy.reminderOffset)
          ? taskToCopy.reminderOffset
          : null,
        recurrence: taskToCopy.recurrence,
      });

      if (created) {
        const children = currentTasks
          .filter((t) => t.parentId === taskToCopy.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        for (const child of children) {
          await duplicateRecursive(child, created.id);
        }
      }
    };

    void duplicateRecursive(task, task.parentId);
  }, [allTasks, createTask, onOpenChange, task]);

  const handleDelete = useCallback(
    (cascade?: boolean) => {
      void deleteTask(task.id, cascade);
      onOpenChange(false);
      onDeleted?.();
    },
    [deleteTask, onOpenChange, onDeleted, task.id],
  );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {children}
      <PopoverContent
        className="w-auto min-w-[160px] p-1"
        align="end"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <AnimatePresence mode="wait" initial={false}>
          {menuView === 'main' ? (
            <motion.div key="menu-main" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.1 }} role="menu">
              {task.status === 'inbox' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void updateTask({ id: task.id, status: 'active' });
                    useToastStore.getState().showToast('Moved to Tasks', async () => {
                      await getUntask().tasks.undoLastUserAction();
                      await useTaskStore.getState().refreshTasks();
                    });
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowRightLeft aria-hidden="true" className="size-3" />
                  Move to Tasks
                </button>
              )}
              {task.status !== 'inbox' && !isTerminal && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void updateTask({ id: task.id, status: 'inbox' });
                    useToastStore.getState().showToast('Moved to Inbox', async () => {
                      await getUntask().tasks.undoLastUserAction();
                      await useTaskStore.getState().refreshTasks();
                    });
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowRightLeft aria-hidden="true" className="size-3" />
                  Move to Inbox
                </button>
              )}
              {cancelledEnabled && !isTerminal && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void cancelTask(task.id);
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Ban aria-hidden="true" className="size-3" />
                  Cancel task
                </button>
              )}
              {showMoveToProject && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMenuView('projects')}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <FolderInput aria-hidden="true" className="size-3" />
                  <span className="flex-1 text-left">Move to project</span>
                  <span className="text-border">&rarr;</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleDuplicate}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Copy aria-hidden="true" className="size-3" />
                Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuView('delete-confirm')}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 aria-hidden="true" className="size-3" />
                Delete
              </button>
            </motion.div>
          ) : menuView === 'projects' ? (
            <motion.div key="menu-projects" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.1 }} role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuView('main')}
                className="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>&larr;</span> Back
              </button>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const updates: TaskUpdateInput = {
                      id: task.id,
                      parentId: project.id,
                    };
                    if (task.status === 'inbox') updates.status = 'active';
                    void updateTask(updates);
                    onOpenChange(false);
                    setMenuView('main');
                  }}
                  className="flex w-full items-center truncate rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {project.title}
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div key="menu-delete" variants={fadeVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.1 }} className="flex flex-col gap-1.5 px-1 py-1.5">
              <p className="text-xs text-muted-foreground">
                {activeChildrenCount > 0
                  ? `Delete this task and ${activeChildrenCount} active subtask${activeChildrenCount > 1 ? 's' : ''}?`
                  : 'Delete this task?'}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex flex-1 items-center justify-center rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(activeChildrenCount > 0)}
                  className="flex flex-1 items-center justify-center rounded-sm bg-destructive/10 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover.Root>
  );
};
