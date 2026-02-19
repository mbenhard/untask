import { useMemo, useState } from 'react';

import type { Task } from '../../../types/models';

import { useAppStore } from '../../stores/appStore';
import { SectionGroup } from '../tasks/SectionGroup';
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
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);

  const [isCollapsed, setIsCollapsed] = useState(false);

  const inboxTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.status === 'inbox' &&
          task.parentId === null,
      ),
    [allTasks],
  );

  return (
    <div className="h-full overflow-y-auto p-3 pb-14">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading inbox...</p>
        ) : null}

        {error ? (
          <p className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}

        {!isLoading ? (
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
          >
            <TaskList
              tasks={inboxTasks}
              allTasks={allTasks}
              emptyMessage="Inbox is empty."
              ariaLabel="Inbox tasks"
              scopeId="inbox"
              isPrimaryList
            />
          </SectionGroup>
        ) : null}
      </div>
    </div>
  );
};
