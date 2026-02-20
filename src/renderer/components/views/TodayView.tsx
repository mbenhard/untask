import { useEffect, useMemo, useState } from 'react';

import type { Task, PredefinedStatusId } from '../../../types/models';
import { TERMINAL_STATUSES } from '../../../types/models';

import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { SectionGroup } from '../tasks/SectionGroup';
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
  const [isTodayCollapsed, setIsTodayCollapsed] = useState(false);
  const [isDoneCollapsed, setIsDoneCollapsed] = useState(true);

  const activeTodayTasks = useMemo(
    () => allTasks.filter(
      (task) => task.today === true && !TERMINAL_STATUSES.includes(task.status as PredefinedStatusId),
    ),
    [allTasks],
  );
  const doneTodayTasks = useMemo(
    () => allTasks.filter(
      (task) => task.today === true && TERMINAL_STATUSES.includes(task.status as PredefinedStatusId),
    ),
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

    if (selectedTask.today === true && TERMINAL_STATUSES.includes(selectedTask.status as PredefinedStatusId)) {
      setIsDoneCollapsed(false);
    } else if (selectedTask.today === true && !TERMINAL_STATUSES.includes(selectedTask.status as PredefinedStatusId)) {
      setIsTodayCollapsed(false);
    }
  }, [allTasks, selectedTaskId]);

  return (
    <div className="h-full overflow-y-auto p-3 pb-14">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {error ? (
          <p className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}

        {!isLoading ? (
          <>
            <SectionGroup
              sectionId="today-active"
              label="Today"
              count={activeTodayTasks.length}
              isCollapsed={isTodayCollapsed}
              onToggle={() => setIsTodayCollapsed((c) => !c)}
              addTaskConfig={{
                defaultStatus: 'active',
                defaultToday: true,
                showMetadata: true,
                placeholder: 'Add to today...',
              }}
              triggerAdd={activeView === 'today' ? newTaskTrigger : undefined}
            >
              <TaskList
                tasks={activeTodayTasks}
                allTasks={allTasks}
                emptyMessage="Nothing planned for today."
                ariaLabel="Today tasks"
                scopeId="today"
                isPrimaryList
              />
            </SectionGroup>

            <SectionGroup
              sectionId="today-done"
              label="Done today"
              count={doneTodayTasks.length}
              isCollapsed={isDoneCollapsed}
              onToggle={() => setIsDoneCollapsed((c) => !c)}
            >
              <TaskList
                tasks={doneTodayTasks}
                allTasks={allTasks}
                emptyMessage="No done tasks today."
                ariaLabel="Done today tasks"
                scopeId="today-done"
              />
            </SectionGroup>
          </>
        ) : null}
      </div>
    </div>
  );
};
