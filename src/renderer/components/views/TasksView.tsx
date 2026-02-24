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
import type { Task, PredefinedStatusId, TaskStatus } from '../../../types/models';
import { isTerminalStatus, getStatusLabel } from '../../../types/models';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { TaskViewSkeleton } from '../ui/loadingShells';
import {
  useTaskStatusConfigStore,
  selectLaneOrder,
} from '../../stores/taskStatusConfigStore';
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
  laneKey: StatusLaneKey;
  label: string;
  tasks: Task[];
  isCollapsed: boolean;
  onToggle: () => void;
  allTasks: Task[];
  activeDragId: string | null;
  addTaskConfig?: AddTaskConfig;
  triggerAdd?: number;
  isPrimaryList?: boolean;
  focusedIndex?: number;
  onFocusedIndexChange?: (index: number) => void;
  onNavigateNextGroup?: () => void;
  onNavigatePrevGroup?: () => void;
  onRequestFocus?: () => void;
};

const StatusGroupSection = ({
  laneKey,
  label,
  tasks,
  isCollapsed,
  onToggle,
  allTasks,
  activeDragId,
  addTaskConfig,
  triggerAdd,
  isPrimaryList,
  focusedIndex,
  onFocusedIndexChange,
  onNavigateNextGroup,
  onNavigatePrevGroup,
  onRequestFocus,
}: StatusGroupSectionProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: getStatusLaneId(laneKey),
  });

  return (
    <SectionGroup
      sectionId={`tasks-${laneKey}`}
      label={label}
      count={tasks.length}
      isCollapsed={isCollapsed}
      onToggle={onToggle}
      isDropTarget={isOver && activeDragId !== null}
      dropRef={setNodeRef}
      addTaskConfig={addTaskConfig}
      triggerAdd={triggerAdd}
      onRequestFocus={onRequestFocus}
    >
      <TaskList
        tasks={tasks}
        allTasks={allTasks}
        emptyMessage={`No ${label.toLowerCase()} tasks.`}
        ariaLabel={`${label} tasks`}
        scopeId={`tasks-${laneKey}`}
        dndMode="shared"
        sharedActiveDragId={activeDragId}
        isPrimaryList={isPrimaryList}
        focusedIndex={focusedIndex}
        onFocusedIndexChange={onFocusedIndexChange}
        onNavigateNextGroup={onNavigateNextGroup}
        onNavigatePrevGroup={onNavigatePrevGroup}
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
  const cancelTask = useTaskStore((state) => state.cancelTask);
  const reopenTask = useTaskStore((state) => state.reopenTask);
  const laneOrder = useTaskStatusConfigStore(useShallow(selectLaneOrder));

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [focusedLane, setFocusedLane] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Initialize collapsed state for new lanes (terminal = collapsed, non-terminal = open)
  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of laneOrder) {
        if (next[key] === undefined) {
          next[key] = isTerminalStatus(key);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [laneOrder]);

  const firstNonTerminalLane = useMemo(
    () => laneOrder.find((key) => !isTerminalStatus(key)) ?? null,
    [laneOrder],
  );

  const newTaskTargetLane = useMemo(() => {
    if (focusedLane && !isTerminalStatus(focusedLane as PredefinedStatusId)) {
      return focusedLane;
    }
    return firstNonTerminalLane;
  }, [focusedLane, firstNonTerminalLane]);

  const firstNonCollapsedLane = useMemo(() => {
    for (const key of laneOrder) {
      const isCollapsed = collapsedGroups[key] ?? false;
      if (!isCollapsed) {
        return key;
      }
    }
    return null;
  }, [collapsedGroups, laneOrder]);

  // Initialize focused lane on first render
  useEffect(() => {
    if (firstNonCollapsedLane && focusedLane === null) {
      setFocusedLane(firstNonCollapsedLane);
      setFocusedIndex(0);
    }
  }, [firstNonCollapsedLane, focusedLane]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const key of laneOrder) {
      groups[key] = [];
    }

    const laneSet = new Set<string>(laneOrder);

    for (const task of allTasks) {
      if (task.parentId !== null || task.status === 'inbox') continue;
      const status = task.status ?? 'active';
      if (laneSet.has(status)) {
        groups[status].push(task);
      } else {
        // Orphaned task with disabled status — put in first non-terminal lane
        const fallback = laneOrder.find((k) => !isTerminalStatus(k));
        if (fallback && groups[fallback]) {
          groups[fallback].push(task);
        }
      }
    }

    return groups;
  }, [allTasks, laneOrder]);

  const groupedTaskIds = useMemo((): StatusLaneTaskIds => {
    const ids: StatusLaneTaskIds = {};
    for (const key of laneOrder) {
      ids[key] = (groupedTasks[key] ?? []).map((t) => t.id);
    }
    return ids;
  }, [groupedTasks, laneOrder]);

  const topLevelStatusScopedIds = useMemo(
    () => getTopLevelStatusScopedIds(allTasks),
    [allTasks],
  );
  const activeDragTask = useMemo(
    () => allTasks.find((task) => task.id === activeDragId) ?? null,
    [activeDragId, allTasks],
  );

  const handleNavigateNextGroup = useCallback((currentLane: StatusLaneKey) => {
    const currentIndex = laneOrder.indexOf(currentLane);
    if (currentIndex === -1 || currentIndex >= laneOrder.length - 1) return;

    for (let i = currentIndex + 1; i < laneOrder.length; i++) {
      const nextLane = laneOrder[i];
      const isCollapsed = collapsedGroups[nextLane] ?? false;
      if (!isCollapsed && groupedTasks[nextLane]?.length > 0) {
        setFocusedLane(nextLane);
        setFocusedIndex(0);
        return;
      }
    }
  }, [laneOrder, collapsedGroups, groupedTasks]);

  const handleNavigatePrevGroup = useCallback((currentLane: StatusLaneKey) => {
    const currentIndex = laneOrder.indexOf(currentLane);
    if (currentIndex <= 0) return;

    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevLane = laneOrder[i];
      const isCollapsed = collapsedGroups[prevLane] ?? false;
      if (!isCollapsed && groupedTasks[prevLane]?.length > 0) {
        setFocusedLane(prevLane);
        const prevLaneTasks = groupedTasks[prevLane];
        setFocusedIndex(prevLaneTasks ? prevLaneTasks.length - 1 : 0);
        return;
      }
    }
  }, [laneOrder, collapsedGroups, groupedTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!selectedTaskId) return;

    const selectedTask = allTasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask || selectedTask.parentId !== null || selectedTask.status === 'inbox') return;

    const groupKey = selectedTask.status as string;
    setCollapsedGroups((current) =>
      current[groupKey]
        ? { ...current, [groupKey]: false }
        : current,
    );
  }, [allTasks, selectedTaskId]);

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      setActiveDragId(null);

      if (!event.over) return;

      const activeId = String(event.active.id);
      const overId = String(event.over.id);

      if (activeId === overId) return;

      const moveResult = moveTaskAcrossStatusLanes({
        groups: groupedTaskIds,
        activeId,
        overId,
        laneKeys: laneOrder,
      });
      if (!moveResult) return;

      const reorderedScopedIds = flattenStatusLaneTaskIds(
        moveResult.nextGroups,
        laneOrder,
      );
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
        const targetLane = moveResult.targetLane as PredefinedStatusId;
        const sourceLane = moveResult.sourceLane as PredefinedStatusId;

        if (targetLane === 'done') {
          void completeTask(activeId);
        } else if (targetLane === 'cancelled') {
          void cancelTask(activeId);
        } else if (isTerminalStatus(sourceLane)) {
          // Dragging out of a terminal lane → reopen
          void reopenTask(activeId);
          // Then move to the target status if different from default reopen target
          // (reopenTask sets to first enabled non-terminal; updateTask corrects if needed)
          void updateTask({ id: activeId, status: targetLane });
        } else {
          void updateTask({ id: activeId, status: targetLane });
        }
      }
    },
    [
      allTasks,
      cancelTask,
      completeTask,
      groupedTaskIds,
      laneOrder,
      reopenTask,
      reorderTasks,
      topLevelStatusScopedIds,
      updateTask,
    ],
  );

  if (isLoading) {
    return <TaskViewSkeleton />;
  }

  return (
    <div className="h-full overflow-y-auto p-3 pb-14" aria-busy={false}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {error ? (
          <p className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <div className="space-y-2">
            {laneOrder.map((key) => {
              const tasks = groupedTasks[key] ?? [];
              const isCollapsed = collapsedGroups[key] ?? false;
              const isTerminal = isTerminalStatus(key);
              const label = getStatusLabel(key);
              const isPrimary = firstNonCollapsedLane === key;
              const effectiveFocusedLane = focusedLane ?? firstNonCollapsedLane;
              const isFocusedLane = effectiveFocusedLane === key;
              const effectiveFocusedIndex = isFocusedLane
                ? Math.min(Math.max(focusedIndex, 0), tasks.length - 1)
                : undefined;

              const handleFocusedIndexChange = (newIndex: number) => {
                setFocusedLane(key);
                setFocusedIndex(newIndex);
              };

              return (
                <StatusGroupSection
                  key={key}
                  laneKey={key}
                  label={label}
                  tasks={tasks}
                  isCollapsed={isCollapsed}
                  allTasks={allTasks}
                  activeDragId={activeDragId}
                  addTaskConfig={
                    !isTerminal
                      ? { defaultStatus: key as Exclude<TaskStatus, 'done'>, showMetadata: true, placeholder: 'Add task...' }
                      : undefined
                  }
                  triggerAdd={
                    key === newTaskTargetLane && activeView === 'tasks' ? newTaskTrigger : undefined
                  }
                  isPrimaryList={isPrimary}
                  focusedIndex={effectiveFocusedIndex}
                  onFocusedIndexChange={handleFocusedIndexChange}
                  onNavigateNextGroup={() => handleNavigateNextGroup(key)}
                  onNavigatePrevGroup={() => handleNavigatePrevGroup(key)}
                  onRequestFocus={() => {
                    setFocusedLane(key);
                    setFocusedIndex(0);
                  }}
                  onToggle={() => {
                    setCollapsedGroups((current) => ({
                      ...current,
                      [key]: !current[key],
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
      </div>
    </div>
  );
};
