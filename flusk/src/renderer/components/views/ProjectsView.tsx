import { useMemo } from 'react';

import type { Task } from '../../../types/models';

import { ProjectGroup } from '../tasks/ProjectGroup';

type ProjectsViewProps = {
  allTasks: Task[];
  isLoading: boolean;
  error: string | null;
};

export const ProjectsView = ({
  allTasks,
  isLoading,
  error,
}: ProjectsViewProps) => {
  const projectGroups = useMemo(() => {
    const activeParents = allTasks.filter(
      (task) =>
        task.parentId === null &&
        task.status !== 'done',
    );

    const allSubtasksByParent = new Map<string, Task[]>();
    for (const task of allTasks) {
      if (!task.parentId) {
        continue;
      }

      const parentTasks = allSubtasksByParent.get(task.parentId);
      if (parentTasks) {
        parentTasks.push(task);
        continue;
      }

      allSubtasksByParent.set(task.parentId, [task]);
    }

    return activeParents
      .map((parentTask) => {
        const allSubtasks = allSubtasksByParent.get(parentTask.id) ?? [];
        const activeSubtasks = allSubtasks.filter((task) => task.status !== 'done');
        const completedCount = allSubtasks.filter(
          (task) => task.status === 'done',
        ).length;

        return {
          parentTask,
          subtasks: activeSubtasks,
          completedCount,
          totalCount: allSubtasks.length,
        };
      })
      .filter((group) => group.totalCount > 0);
  }, [allTasks]);

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

        {!isLoading && projectGroups.length === 0 ? (
          <div className="grid min-h-28 place-items-center">
            <p className="text-[13px] text-muted-foreground">No tasks yet.</p>
          </div>
        ) : null}

        {projectGroups.length > 0 ? (
          <div className="space-y-2">
            {projectGroups.map((group) => (
              <ProjectGroup
                key={group.parentTask.id}
                parentTask={group.parentTask}
                subtasks={group.subtasks}
                allTasks={allTasks}
                completedCount={group.completedCount}
                totalCount={group.totalCount}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
