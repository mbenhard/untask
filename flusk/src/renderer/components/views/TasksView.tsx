import { useEffect, useMemo, useState } from 'react';

import { ChevronRight } from 'lucide-react';

import type { Task, TaskStatus } from '../../../types/models';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { InlineTaskInput } from '../tasks/InlineTaskInput';
import { TaskList } from '../tasks/TaskList';

type TasksViewProps = {
  allTasks: Task[];
  isLoading: boolean;
  error: string | null;
};

type GroupKey = Exclude<TaskStatus, 'inbox'>;

const GROUP_CONFIG: Array<{
  key: GroupKey;
  label: string;
  emptyMessage: string;
}> = [
  { key: 'in_progress', label: 'In Progress', emptyMessage: 'No tasks in progress.' },
  { key: 'active', label: 'Active', emptyMessage: 'No active tasks.' },
  { key: 'waiting', label: 'Waiting', emptyMessage: 'No waiting tasks.' },
  { key: 'done', label: 'Done', emptyMessage: 'No completed tasks.' },
];

const toGroupKey = (status: Task['status']): GroupKey => {
  if (
    status === 'in_progress' ||
    status === 'active' ||
    status === 'waiting' ||
    status === 'done'
  ) {
    return status;
  }

  return 'active';
};

export const TasksView = ({
  allTasks,
  isLoading,
  error,
}: TasksViewProps) => {
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<GroupKey, boolean>>({
    in_progress: false,
    active: false,
    waiting: false,
    done: true,
  });

  const groupedTasks = useMemo(() => {
    const groups: Record<GroupKey, Task[]> = {
      in_progress: [],
      active: [],
      waiting: [],
      done: [],
    };

    for (const task of allTasks) {
      if (task.parentId !== null) {
        continue;
      }

      if (task.status === 'inbox') {
        continue;
      }

      groups[toGroupKey(task.status)].push(task);
    }

    return groups;
  }, [allTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const selectedTask = allTasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask || selectedTask.parentId !== null || selectedTask.status === 'inbox') {
      return;
    }

    const groupKey = toGroupKey(selectedTask.status);
    setCollapsedGroups((current) =>
      current[groupKey]
        ? {
            ...current,
            [groupKey]: false,
          }
        : current,
    );
  }, [allTasks, selectedTaskId]);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        ) : null}

        {error ? (
          <p className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}

        {!isLoading ? (
          <div className="space-y-2">
            {GROUP_CONFIG.map((group) => {
              const tasks = groupedTasks[group.key];
              const isCollapsed = collapsedGroups[group.key];

              return (
                <section key={group.key} className="rounded-md border border-border/60">
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.key]: !current[group.key],
                      }));
                    }}
                    className="flex w-full items-center gap-2 px-2 py-2 text-left"
                    aria-expanded={!isCollapsed}
                    aria-controls={`tasks-group-${group.key}`}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform',
                        !isCollapsed && 'rotate-90',
                      )}
                    />
                    <span className="text-[12px] font-medium text-foreground">
                      {group.label}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {tasks.length}
                    </span>
                  </button>

                  {!isCollapsed ? (
                    <div id={`tasks-group-${group.key}`} className="border-t border-border/60 px-1 py-1">
                      <TaskList
                        tasks={tasks}
                        allTasks={allTasks}
                        emptyMessage={group.emptyMessage}
                        ariaLabel={`${group.label} tasks`}
                        scopeId={`tasks-${group.key}`}
                      />
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}

        <InlineTaskInput
          parentId={null}
          defaultStatus="active"
          placeholder="Add task..."
          triggerOpen={activeView === 'tasks' ? newTaskTrigger : undefined}
        />
      </div>
    </div>
  );
};
