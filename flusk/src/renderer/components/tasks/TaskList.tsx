import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import type { Task } from '../../../types/models';
import { useTaskListKeyboard } from '../../hooks/useTaskListKeyboard';
import { cn } from '../../lib/utils';
import { useTaskStore } from '../../stores/taskStore';
import { TaskItem } from './TaskItem';

export interface TaskListProps {
  tasks: Task[];
  allTasks: Task[];
  emptyMessage: string;
  emptyAction?: string;
  ariaLabel: string;
  scopeId: string;
  indentPx?: number;
}

const reconcileScopedReorder = (
  globalIds: string[],
  scopedIds: string[],
  reorderedScopedIds: string[],
): string[] => {
  if (scopedIds.length === 0) {
    return globalIds;
  }

  const scopedSet = new Set(scopedIds);
  let reorderedIndex = 0;

  return globalIds.map((id) => {
    if (!scopedSet.has(id)) {
      return id;
    }

    const nextId = reorderedScopedIds[reorderedIndex];
    reorderedIndex += 1;
    return nextId ?? id;
  });
};

export const TaskList = ({
  tasks,
  allTasks,
  emptyMessage,
  emptyAction,
  ariaLabel,
  scopeId,
  indentPx = 0,
}: TaskListProps) => {
  const completeTask = useTaskStore((state) => state.completeTask);
  const toggleToday = useTaskStore((state) => state.toggleToday);
  const reorderTasks = useTaskStore((state) => state.reorderTasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const selectTask = useTaskStore((state) => state.selectTask);

  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isAnyBodyEditing, setIsAnyBodyEditing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<string | null>(null);

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const activeDragTask = useMemo(
    () => tasks.find((task) => task.id === activeDragId) ?? null,
    [activeDragId, tasks],
  );

  useEffect(() => {
    setFocusedIndex((previous) => {
      if (tasks.length === 0) {
        return 0;
      }
      return Math.min(previous, tasks.length - 1);
    });
  }, [tasks.length]);

  useEffect(() => {
    if (expandedTaskId && !taskIds.includes(expandedTaskId)) {
      setExpandedTaskId(null);
      setIsAnyBodyEditing(false);
    }
  }, [expandedTaskId, taskIds]);

  useEffect(() => {
    const focusedTaskId = tasks[focusedIndex]?.id;
    if (!focusedTaskId) {
      return;
    }

    const activeElement = document.activeElement;
    const container = containerRef.current;
    if (!container || !activeElement || !container.contains(activeElement)) {
      return;
    }

    const nextFocused = container.querySelector<HTMLElement>(
      `[data-task-id="${focusedTaskId}"]`,
    );
    if (!nextFocused || nextFocused === activeElement) {
      return;
    }

    // Don't steal focus from interactive elements inside the focused task
    // (e.g. metadata selects, inputs, date pickers in the expanded body).
    if (nextFocused.contains(activeElement)) {
      return;
    }

    nextFocused.focus();
  }, [focusedIndex, tasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const selectedIndex = tasks.findIndex((task) => task.id === selectedTaskId);
    if (selectedIndex < 0) {
      return;
    }

    // Consume the selection so this effect doesn't re-fire on every tasks change.
    selectTask(null);

    setFocusedIndex(selectedIndex);
    setExpandedTaskId(selectedTaskId);
    setIsAnyBodyEditing(false);

    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const target = container.querySelector<HTMLElement>(
        `[data-task-id="${selectedTaskId}"]`,
      );

      if (!target) {
        return;
      }

      target.scrollIntoView({ block: 'nearest' });
      target.focus();
    });
  }, [selectTask, selectedTaskId, tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleToggleExpand = useCallback((taskId: string): void => {
    setExpandedTaskId((current) => (current === taskId ? null : taskId));
    setIsAnyBodyEditing(false);
  }, []);

  const handleComplete = useCallback(
    (taskId: string): void => {
      void completeTask(taskId);
      if (expandedTaskId === taskId) {
        setExpandedTaskId(null);
      }
    },
    [completeTask, expandedTaskId],
  );

  const handleToggleToday = useCallback(
    (taskId: string): void => {
      void toggleToday(taskId);
    },
    [toggleToday],
  );

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      setActiveDragId(null);

      const { active, over } = event;
      if (!over) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) {
        return;
      }

      const oldIndex = taskIds.indexOf(activeId);
      const newIndex = taskIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) {
        // Cross-scope drag and unknown IDs are intentionally ignored.
        return;
      }

      const reorderedScopedIds = arrayMove(taskIds, oldIndex, newIndex);
      const fullOrderedIds = reconcileScopedReorder(
        allTasks.map((task) => task.id),
        taskIds,
        reorderedScopedIds,
      );

      setFocusedIndex(newIndex);
      void reorderTasks(fullOrderedIds);
    },
    [allTasks, reorderTasks, taskIds],
  );

  const onKeyDown = useTaskListKeyboard({
    tasks,
    focusedIndex,
    onFocusedIndexChange: setFocusedIndex,
    expandedTaskId,
    onToggleExpand: handleToggleExpand,
    onToggleToday: handleToggleToday,
    isAnyBodyEditing,
    isDragActive: activeDragId !== null,
    containerRef,
    onStartTitleEdit: setEditingTitleTaskId,
    isEditingTitle: editingTitleTaskId !== null,
  });

  if (tasks.length === 0) {
    return (
      <div className="grid min-h-28 place-items-center px-1 text-center">
        <div className="space-y-1">
          <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
          {emptyAction ? (
            <p className="text-[11px] text-muted-foreground">{emptyAction}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={indentPx > 0 ? { paddingLeft: indentPx } : undefined}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div
            ref={containerRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-describedby={`${scopeId}-hint`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="space-y-1 outline-none"
          >
            <p id={`${scopeId}-hint`} className="sr-only">
              Use Arrow Up and Arrow Down to move focus. Press Enter to expand.
              Press T to toggle today. Press E to edit title.
            </p>
            {tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                isExpanded={expandedTaskId === task.id}
                isFocused={focusedIndex === index}
                isEditingTitle={editingTitleTaskId === task.id}
                onStartTitleEdit={setEditingTitleTaskId}
                onEndTitleEdit={() => setEditingTitleTaskId(null)}
                onToggleExpand={handleToggleExpand}
                onComplete={handleComplete}
                onToggleToday={handleToggleToday}
                onBodyEditModeChange={setIsAnyBodyEditing}
                onFocus={() => setFocusedIndex(index)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeDragTask ? (
            <div
              className={cn(
                'min-h-9 bg-background/90 px-2 py-1 text-[12px] text-foreground/90',
              )}
            >
              {activeDragTask.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
