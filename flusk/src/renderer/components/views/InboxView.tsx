import { useMemo } from 'react';

import type { Task } from '../../../types/models';

import { TaskList } from '../tasks/TaskList';

type InboxViewProps = {
  allTasks: Task[];
  isLoading: boolean;
  error: string | null;
};

export const InboxView = ({
  allTasks,
  isLoading,
  error,
}: InboxViewProps) => {
  const inboxTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.status === 'inbox' &&
          task.parentId === null &&
          task.today !== true,
      ),
    [allTasks],
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading inbox...</p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}

        {!isLoading ? (
          <TaskList
            tasks={inboxTasks}
            allTasks={allTasks}
            emptyMessage="Inbox is empty."
            ariaLabel="Inbox tasks"
            scopeId="inbox"
          />
        ) : null}
      </div>
    </div>
  );
};
