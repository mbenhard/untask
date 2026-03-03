import { useCallback, useMemo, useState } from 'react';

import { AnimatePresence } from 'framer-motion';

import type { Task } from '../../../types/models';

import { selectFocusedTaskId, useAppStore } from '../../stores/appStore';
import { SectionGroup } from '../tasks/SectionGroup';
import { TaskDetailPage } from '../tasks/TaskDetailPage';
import { TaskList } from '../tasks/TaskList';

type InboxViewProps = {
  allTasks: Task[];
  error: string | null;
};

export const InboxView = ({
  allTasks,
  error,
}: InboxViewProps) => {
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);
  const focusedTaskId = useAppStore(selectFocusedTaskId);
  const setFocusedTaskId = useAppStore((state) => state.setFocusedTaskId);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const inboxTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.status === 'inbox' &&
          task.parentId === null,
      ),
    [allTasks],
  );

  const handleOpenDetail = useCallback(
    (taskId: string) => {
      // For subtasks in the list, navigate to the parent task's detail page
      const task = allTasks.find((t) => t.id === taskId);
      if (task?.parentId) {
        setFocusedTaskId(task.parentId);
      } else {
        setFocusedTaskId(taskId);
      }
    },
    [allTasks, setFocusedTaskId],
  );

  if (focusedTaskId) {
    return (
      <AnimatePresence mode="wait">
        <TaskDetailPage key={focusedTaskId} taskId={focusedTaskId} />
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

        <SectionGroup
          sectionId="inbox"
          label="Inbox"
          count={inboxTasks.length}
          isCollapsed={isCollapsed}
          onToggle={() => setIsCollapsed((c) => !c)}
          addTaskConfig={{
            defaultStatus: 'inbox',
            showMetadata: true,
            placeholder: 'Type to capture...',
          }}
          triggerAdd={activeView === 'inbox' ? newTaskTrigger : undefined}
          onRequestFocus={() => setFocusedIndex(0)}
        >
          <TaskList
            tasks={inboxTasks}
            allTasks={allTasks}
            emptyMessage="Inbox is empty."
            ariaLabel="Inbox tasks"
            scopeId="inbox"
            isPrimaryList
            focusedIndex={focusedIndex}
            onFocusedIndexChange={setFocusedIndex}
            onOpenDetail={handleOpenDetail}
          />
        </SectionGroup>
      </div>
    </div>
  );
};
