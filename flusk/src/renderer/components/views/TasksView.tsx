import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DropAnimation,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Task } from '../../../types/models';
import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { type AddTaskConfig, SectionGroup } from '../tasks/SectionGroup';
import { TaskList } from '../tasks/TaskList';
import {
  flattenStatusLaneTaskIds,
  getStatusLaneId,
  getTopLevelStatusScopedIds,
  moveTaskAcrossStatusLanes,
  reconcileScopedReorder,
  type StatusLaneKey,
  type StatusLaneTaskIds,
} from '../tasks/statusLaneDrag';

type TasksViewProps = {
  allTasks: Task[];
  isLoading: boolean;
  error: string | null;
};

type GroupKey = StatusLaneKey;

const GROUP_CONFIG: Array<{
  key: GroupKey;
  label: string;
  emptyMessage: string;
}> = [
  { key: 'in_progress', label: 'In Progress', emptyMessage: 'No tasks in progress.' },
  { key: 'active', label: 'Backlog', emptyMessage: 'No tasks in backlog.' },
  { key: 'waiting', label: 'On Hold', emptyMessage: 'No tasks on hold.' },
  { key: 'done', label: 'Done', emptyMessage: 'No completed tasks.' },
];

const toGroupKey = (status: Task['status']): GroupKey => {
  if (
    status === 'in_progress' ||
    status === 'active' ||
    status === 'waiting' ||
    status === 'done'
  ) {
    return status;
  }

  return 'active';
};

const toTaskIdsByGroup = (groups: Record<GroupKey, Task[]>): StatusLaneTaskIds => ({
  in_progress: groups.in_progress.map((task) => task.id),
  active: groups.active.map((task) => task.id),
  waiting: groups.waiting.map((task) => task.id),
  done: groups.done.map((task) => task.id),
});

const SHARED_DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.45',
      },
    },
  }),
};

type StatusGroupSectionProps = {
  group: (typeof GROUP_CONFIG)[number];
  tasks: Task[];
  isCollapsed: boolean;
  onToggle: () => void;
  allTasks: Task[];
  activeDragId: string | null;
  addTaskConfig?: AddTaskConfig;
  triggerAdd?: number;
};

const StatusGroupSection = ({
  group,
  tasks,
  isCollapsed,
  onToggle,
  allTasks,
  activeDragId,
  addTaskConfig,
  triggerAdd,
}: StatusGroupSectionProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: getStatusLaneId(group.key),
  });

  return (
    <SectionGroup
      sectionId={`tasks-${group.key}`}
      label={group.label}
      count={tasks.length}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
      isDropTarget={isOver && activeDragId !== null}
      dropRef={setNodeRef}
      addTaskConfig={addTaskConfig}
      triggerAdd={triggerAdd}
    >
      <TaskList
        tasks={tasks}
        allTasks={allTasks}
        emptyMessage={group.emptyMessage}
        ariaLabel={`${group.label} tasks`}
        scopeId={`tasks-${group.key}`}
        dndMode="shared"
        sharedActiveDragId={activeDragId}
      />
    </SectionGroup>
  );
};

export const TasksView = ({
  allTasks,
  isLoading,
  error,
}: TasksViewProps) => {
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const reorderTasks = useTaskStore((state) => state.reorderTasks);
  const updateTask = useTaskStore((state) => state.updateTask);
  const completeTask = useTaskStore((state) => state.completeTask);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<GroupKey, boolean>>({
    in_progress: false,
    active: false,
    waiting: false,
    done: true,
  });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const groupedTasks = useMemo(() => {
    const groups: Record<GroupKey, Task[]> = {
      in_progress: [],
      active: [],
      waiting: [],
      done: [],
    };

    for (const task of allTasks) {
      if (task.parentId !== null) {
        continue;
      }

      if (task.status === 'inbox') {
        continue;
      }

      groups[toGroupKey(task.status)].push(task);
    }

    return groups;
  }, [allTasks]);
  const groupedTaskIds = useMemo(
    () => toTaskIdsByGroup(groupedTasks),
    [groupedTasks],
  );
  const topLevelStatusScopedIds = useMemo(
    () => getTopLevelStatusScopedIds(allTasks),
    [allTasks],
  );
  const activeDragTask = useMemo(
    () => allTasks.find((task) => task.id === activeDragId) ?? null,
    [activeDragId, allTasks],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const selectedTask = allTasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask || selectedTask.parentId !== null || selectedTask.status === 'inbox') {
      return;
    }

    const groupKey = toGroupKey(selectedTask.status);
    setCollapsedGroups((current) =>
      current[groupKey]
        ? {
            ...current,
            [groupKey]: false,
          }
        : current,
    );
  }, [allTasks, selectedTaskId]);

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      setActiveDragId(null);

      if (!event.over) {
        return;
      }

      const activeId = String(event.active.id);
      const overId = String(event.over.id);

      if (activeId === overId) {
        return;
      }

      const moveResult = moveTaskAcrossStatusLanes({
        groups: groupedTaskIds,
        activeId,
        overId,
      });
      if (!moveResult) {
        return;
      }

      const reorderedScopedIds = flattenStatusLaneTaskIds(moveResult.nextGroups);
      const currentGlobalIds = allTasks.map((task) => task.id);
      const fullOrderedIds = reconcileScopedReorder(
        currentGlobalIds,
        topLevelStatusScopedIds,
        reorderedScopedIds,
      );

      const orderChanged = fullOrderedIds.some(
        (id, index) => id !== currentGlobalIds[index],
      );

      if (orderChanged) {
        void reorderTasks(fullOrderedIds);
      }

      if (moveResult.didChangeLane) {
        if (moveResult.targetLane === 'done') {
          void completeTask(activeId);
        } else {
          void updateTask({ id: activeId, status: moveResult.targetLane });
        }
      }
    },
    [
      allTasks,
      completeTask,
      groupedTaskIds,
      reorderTasks,
      topLevelStatusScopedIds,
      updateTask,
    ],
  );

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

        {!isLoading ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <div className="space-y-2">
              {GROUP_CONFIG.map((group) => {
                const tasks = groupedTasks[group.key];
                const isCollapsed = collapsedGroups[group.key];
                const isBacklog = group.key === 'active';

                return (
                  <StatusGroupSection
                    key={group.key}
                    group={group}
                    tasks={tasks}
                    isCollapsed={isCollapsed}
                    allTasks={allTasks}
                    activeDragId={activeDragId}
                    addTaskConfig={
                      isBacklog
                        ? { defaultStatus: 'active', showMetadata: true, placeholder: 'Add task...' }
                        : undefined
                    }
                    triggerAdd={
                      isBacklog && activeView === 'tasks' ? newTaskTrigger : undefined
                    }
                    onToggle={() => {
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.key]: !current[group.key],
                      }));
                    }}
                  />
                );
              })}
            </div>

            <DragOverlay dropAnimation={SHARED_DROP_ANIMATION}>
              {activeDragTask ? (
                <div className="min-h-9 bg-background/90 px-2 py-1 text-[12px] text-foreground/90">
                  {activeDragTask.title}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : null}
      </div>
    </div>
  );
};
