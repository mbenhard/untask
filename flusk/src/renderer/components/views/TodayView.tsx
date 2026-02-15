import { useMemo } from 'react';

import type { Task } from '../../../types/models';

import { LiveThought } from '../layout/LiveThought';
import { TaskList } from '../tasks/TaskList';

type TodayViewProps = {
  allTasks: Task[];
  isLoading: boolean;
  error: string | null;
};

export const TodayView = ({
  allTasks,
  isLoading,
  error,
}: TodayViewProps): JSX.Element => {
  const todayTasks = useMemo(
    () => allTasks.filter((task) => task.today === true && task.status !== 'done'),
    [allTasks],
  );
  const liveThoughtRefreshKey = useMemo(
    () =>
      allTasks
        .map((task) => `${task.id}:${task.status}:${task.today ? '1' : '0'}:${task.completedAt ?? ''}`)
        .join('|'),
    [allTasks],
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <LiveThought refreshKey={liveThoughtRefreshKey} />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading today list...</p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}

        {!isLoading ? (
          <TaskList
            tasks={todayTasks}
            allTasks={allTasks}
            emptyMessage="Nothing planned for today."
            emptyAction="Ask AI to suggest your day."
            ariaLabel="Today tasks"
            scopeId="today"
          />
        ) : null}
      </div>
    </div>
  );
};
