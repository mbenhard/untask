import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnimatePresence } from 'framer-motion';

import type { Task, PredefinedStatusId } from '../../../types/models';
import { TERMINAL_STATUSES } from '../../../types/models';

import { selectFocusedTaskId, useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { SectionGroup } from '../tasks/SectionGroup';
import { TaskDetailPage } from '../tasks/TaskDetailPage';
import { TaskList } from '../tasks/TaskList';

type TodayViewProps = {
  allTasks: Task[];
  error: string | null;
};

export const TodayView = ({
  allTasks,
  error,
}: TodayViewProps) => {
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);
  const focusedTaskId = useAppStore(selectFocusedTaskId);
  const setFocusedTaskId = useAppStore((state) => state.setFocusedTaskId);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);

  const [isTodayCollapsed, setIsTodayCollapsed] = useState(false);
  const [isDoneCollapsed, setIsDoneCollapsed] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);
  // Track the subtask that triggered navigation to parent detail page
  const [navigatedSubtaskId, setNavigatedSubtaskId] = useState<string | null>(null);

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

  const handleOpenDetail = useCallback(
    (taskId: string) => {
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) return;

      // If this is a subtask, navigate to the parent task's detail page
      if (task.parentId) {
        setNavigatedSubtaskId(taskId);
        setFocusedTaskId(task.parentId);
      } else {
        setNavigatedSubtaskId(null);
        setFocusedTaskId(taskId);
      }
    },
    [allTasks, setFocusedTaskId],
  );

  // Clear navigated subtask highlight after animation
  useEffect(() => {
    if (!navigatedSubtaskId) return;
    const timer = setTimeout(() => setNavigatedSubtaskId(null), 1200);
    return () => clearTimeout(timer);
  }, [navigatedSubtaskId]);

  if (focusedTaskId) {
    return (
      <AnimatePresence mode="wait">
        <TaskDetailPage
          key={focusedTaskId}
          taskId={focusedTaskId}
          navigatedSubtaskId={navigatedSubtaskId}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 pb-14">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {error ? (
          <p className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}

        <>
          <SectionGroup
            sectionId="today-active"
            label="Today"
            count={activeTodayTasks.length}
            isCollapsed={isTodayCollapsed}
            onToggle={() => setIsTodayCollapsed((c) => !c)}
            addTaskConfig={{
              defaultStatus: 'in_progress',
              defaultToday: true,
              showMetadata: true,
              placeholder: 'Add to today...',
            }}
            triggerAdd={activeView === 'today' ? newTaskTrigger : undefined}
            onRequestFocus={() => setFocusedIndex(0)}
          >
            <TaskList
              tasks={activeTodayTasks}
              allTasks={allTasks}
              emptyMessage="Nothing planned for today."
              ariaLabel="Today tasks"
              scopeId="today"
              isPrimaryList
              focusedIndex={focusedIndex}
              onFocusedIndexChange={setFocusedIndex}
              onOpenDetail={handleOpenDetail}
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
              onOpenDetail={handleOpenDetail}
            />
          </SectionGroup>
        </>
      </div>
    </div>
  );
};
