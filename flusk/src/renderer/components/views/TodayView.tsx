import { useMemo } from 'react';

import type { Task } from '../../../types/models';

import { useAppStore } from '../../stores/appStore';
import { LiveThought } from '../layout/LiveThought';
import { InlineTaskInput } from '../tasks/InlineTaskInput';
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
}: TodayViewProps) => {
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);

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
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <LiveThought refreshKey={liveThoughtRefreshKey} />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading today list...</p>
        ) : null}

        {error ? (
          <p className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}

        {!isLoading ? (
          <TaskList
            tasks={todayTasks}
            allTasks={allTasks}
            emptyMessage="Nothing planned for today."
            ariaLabel="Today tasks"
            scopeId="today"
          />
        ) : null}

        <InlineTaskInput
          parentId={null}
          defaultStatus="active"
          defaultToday={true}
          placeholder="Add to today..."
          triggerOpen={activeView === 'today' ? newTaskTrigger : undefined}
        />
      </div>
    </div>
  );
};
