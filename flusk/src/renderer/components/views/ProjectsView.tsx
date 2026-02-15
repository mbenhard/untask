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
}: ProjectsViewProps): JSX.Element => {
  const projectGroups = useMemo(() => {
    const activeParents = allTasks.filter(
      (task) =>
        task.parentId === null &&
        task.status !== 'inbox' &&
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
      .filter((group) => group.subtasks.length > 0);
  }, [allTasks]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}

        {!isLoading && projectGroups.length === 0 ? (
          <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-border bg-card/40">
            <p className="text-sm text-muted-foreground">
              No active project subtasks.
            </p>
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
