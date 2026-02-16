import { useEffect, useMemo, useState } from 'react';

import { ChevronRight } from 'lucide-react';

import type { Task } from '../../../types/models';

import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { cn } from '../../lib/utils';
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
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const [isDoneCollapsed, setIsDoneCollapsed] = useState(true);

  const activeTodayTasks = useMemo(
    () => allTasks.filter((task) => task.today === true && task.status !== 'done'),
    [allTasks],
  );
  const doneTodayTasks = useMemo(
    () => allTasks.filter((task) => task.today === true && task.status === 'done'),
    [allTasks],
  );
  const liveThoughtRefreshKey = useMemo(
    () =>
      allTasks
        .map((task) => `${task.id}:${task.status}:${task.today ? '1' : '0'}:${task.completedAt ?? ''}`)
        .join('|'),
    [allTasks],
  );

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const selectedTask = allTasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask) {
      return;
    }

    if (selectedTask.today === true && selectedTask.status === 'done') {
      setIsDoneCollapsed(false);
    }
  }, [allTasks, selectedTaskId]);

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
          <>
            <TaskList
              tasks={activeTodayTasks}
              allTasks={allTasks}
              emptyMessage="Nothing planned for today."
              ariaLabel="Today tasks"
              scopeId="today"
            />

            <section className="rounded-md border border-border/60">
              <button
                type="button"
                onClick={() => setIsDoneCollapsed((current) => !current)}
                className="flex w-full items-center gap-2 px-2 py-2 text-left"
                aria-expanded={!isDoneCollapsed}
                aria-controls="today-done-group"
              >
                <ChevronRight
                  className={cn(
                    'size-3.5 text-muted-foreground transition-transform',
                    !isDoneCollapsed && 'rotate-90',
                  )}
                />
                <span className="text-[12px] font-medium text-foreground">Done today</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {doneTodayTasks.length}
                </span>
              </button>

              {!isDoneCollapsed ? (
                <div id="today-done-group" className="border-t border-border/60 px-1 py-1">
                  <TaskList
                    tasks={doneTodayTasks}
                    allTasks={allTasks}
                    emptyMessage="No done tasks today."
                    ariaLabel="Done today tasks"
                    scopeId="today-done"
                  />
                </div>
              ) : null}
            </section>
          </>
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
