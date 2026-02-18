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
import { isTerminalStatus } from '../../../types/models';
import { useShallow } from 'zustand/react/shallow';
import { useTaskListKeyboard } from '../../hooks/useTaskListKeyboard';
import { cn } from '../../lib/utils';
import { useTaskStore } from '../../stores/taskStore';
import {
  useTaskStatusConfigStore,
  selectEnabledNonTerminal,
  selectFirstEnabledNonTerminal,
} from '../../stores/taskStatusConfigStore';
import {
  getNextPriority,
  getNextStatusInCycle,
  getStatusAfterToggleComplete,
} from './taskInteraction';
import { reconcileScopedReorder } from './statusLaneDrag';
import { TaskBody } from './TaskBody';
import { TaskItem } from './TaskItem';

export interface TaskListProps {
  tasks: Task[];
  allTasks: Task[];
  emptyMessage: string;
  emptyAction?: string;
  ariaLabel: string;
  scopeId: string;
  indentPx?: number;
  dndMode?: 'local' | 'shared';
  sharedActiveDragId?: string | null;
}

export const TaskList = ({
  tasks,
  allTasks,
  emptyMessage,
  emptyAction,
  ariaLabel,
  scopeId,
  indentPx = 0,
  dndMode = 'local',
  sharedActiveDragId = null,
}: TaskListProps) => {
  const completeTask = useTaskStore((state) => state.completeTask);
  const reopenTask = useTaskStore((state) => state.reopenTask);
  const createTask = useTaskStore((state) => state.createTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const toggleToday = useTaskStore((state) => state.toggleToday);
  const reorderTasks = useTaskStore((state) => state.reorderTasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const selectTask = useTaskStore((state) => state.selectTask);
  const enabledNonTerminal = useTaskStatusConfigStore(useShallow(selectEnabledNonTerminal));
  const firstEnabledNonTerminal = useTaskStatusConfigStore(selectFirstEnabledNonTerminal);

  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isAnyBodyEditing, setIsAnyBodyEditing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<string | null>(null);
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const effectiveActiveDragId = dndMode === 'shared' ? sharedActiveDragId : activeDragId;
  const activeDragTask = useMemo(
    () => tasks.find((task) => task.id === effectiveActiveDragId) ?? null,
    [effectiveActiveDragId, tasks],
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

    if (selectedIndex >= 0) {
      // Direct task in this list — expand + focus it.
      selectTask(null);
      setFocusedIndex(selectedIndex);
      setExpandedTaskId(selectedTaskId);
      setIsAnyBodyEditing(false);

      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;
        const target = container.querySelector<HTMLElement>(
          `[data-task-id="${selectedTaskId}"]`,
        );
        if (!target) return;
        target.scrollIntoView({ block: 'nearest' });
        target.focus();
      });
      return;
    }

    // Not a direct task — check if it's a subtask whose parent is in this list.
    const subtask = allTasks.find((t) => t.id === selectedTaskId);
    if (!subtask?.parentId) return;

    const parentIndex = tasks.findIndex((t) => t.id === subtask.parentId);
    if (parentIndex < 0) return;

    // Expand parent so the nested TaskList renders and picks up selectedTaskId.
    setFocusedIndex(parentIndex);
    setExpandedTaskId(subtask.parentId);
    setIsAnyBodyEditing(false);
  }, [allTasks, selectTask, selectedTaskId, tasks]);

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
      const currentTask = tasks.find((candidate) => candidate.id === taskId);
      if (!currentTask) {
        return;
      }

      const nextStatus = getStatusAfterToggleComplete(
        currentTask.status,
        firstEnabledNonTerminal,
      );
      if (nextStatus === 'done') {
        void completeTask(taskId);
      } else if (isTerminalStatus(currentTask.status as never)) {
        void reopenTask(taskId);
      } else {
        void updateTask({ id: taskId, status: nextStatus });
      }

      if (expandedTaskId === taskId) {
        setExpandedTaskId(null);
      }
    },
    [completeTask, expandedTaskId, firstEnabledNonTerminal, reopenTask, tasks, updateTask],
  );

  const handleToggleToday = useCallback(
    (taskId: string): void => {
      void toggleToday(taskId);
    },
    [toggleToday],
  );

  const handleCyclePriority = useCallback(
    (taskId: string): void => {
      const currentTask = tasks.find((candidate) => candidate.id === taskId);
      if (!currentTask) {
        return;
      }

      const nextPriority = getNextPriority(currentTask.priority);

      void updateTask({ id: taskId, priority: nextPriority });
    },
    [tasks, updateTask],
  );

  const handleCycleStatus = useCallback(
    (taskId: string): void => {
      const currentTask = tasks.find((candidate) => candidate.id === taskId);
      if (!currentTask) {
        return;
      }

      const nextStatus = getNextStatusInCycle(
        currentTask.status,
        enabledNonTerminal,
      );

      void updateTask({ id: taskId, status: nextStatus });
    },
    [enabledNonTerminal, tasks, updateTask],
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
    onToggleComplete: handleComplete,
    onToggleToday: handleToggleToday,
    onCyclePriority: handleCyclePriority,
    onCycleStatus: handleCycleStatus,
    isAnyBodyEditing,
    isDragActive: effectiveActiveDragId !== null,
    containerRef,
    onStartTitleEdit: setEditingTitleTaskId,
    isEditingTitle: editingTitleTaskId !== null,
  });

  if (tasks.length === 0) {
    return (
      <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border/40 px-1 text-center">
        <div className="space-y-1">
          <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
          {emptyAction ? (
            <p className="text-[11px] text-muted-foreground">{emptyAction}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const listContent = (
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
          Press Space to complete or reopen. Press T to toggle today.
          Press P to cycle priority. Press S to cycle status.
          In Tasks view, drag tasks between status groups or drop onto tasks for exact placement.
          Press E to edit title.
        </p>
        {tasks.map((task, index) => {
          const isExpanded = expandedTaskId === task.id;
          const canOwnSubtasks = task.parentId === null;
          const subtasks = canOwnSubtasks
            ? allTasks.filter((candidate) => candidate.parentId === task.id)
            : [];

          return (
            <TaskItem
              key={task.id}
              task={task}
              isExpanded={isExpanded}
              isFocused={focusedIndex === index}
              isEditingTitle={editingTitleTaskId === task.id}
              hasChildren={subtasks.length > 0}
              childrenCount={subtasks.length}
              childrenDoneCount={subtasks.filter((s) => s.status === 'done').length}
              onStartTitleEdit={setEditingTitleTaskId}
              onEndTitleEdit={() => setEditingTitleTaskId(null)}
              onToggleExpand={handleToggleExpand}
              onComplete={handleComplete}
              onToggleToday={handleToggleToday}
              onFocus={() => setFocusedIndex(index)}
            >
              <TaskBody
                task={task}
                isExpanded={isExpanded}
                subtaskCount={subtasks.length}
                onRequestAddSubtask={
                  canOwnSubtasks
                    ? () => setAddingSubtaskForId(task.id)
                    : undefined
                }
                onBodyEditModeChange={setIsAnyBodyEditing}
              />

              {isExpanded &&
                canOwnSubtasks &&
                (subtasks.length > 0 || addingSubtaskForId === task.id) && (
                  <div className="px-3 pb-1">
                    {subtasks.length > 0 && (
                      <TaskList
                        tasks={subtasks}
                        allTasks={allTasks}
                        emptyMessage=""
                        ariaLabel={`Subtasks for ${task.title}`}
                        scopeId={`subtasks:${task.id}`}
                        indentPx={8}
                      />
                    )}
                    {addingSubtaskForId === task.id && (
                      <div className="flex min-h-8 items-center gap-2 pl-1.5">
                        <span className="inline-flex size-6 items-center justify-center">
                          <span className="inline-flex size-3.5 rounded-full border border-border" />
                        </span>
                        <input
                          autoFocus
                          type="text"
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                              e.preventDefault();
                              void createTask({
                                title: newSubtaskTitle.trim(),
                                parentId: task.id,
                                status: 'active',
                                priority: 'none',
                              });
                              setNewSubtaskTitle('');
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setAddingSubtaskForId(null);
                              setNewSubtaskTitle('');
                            }
                          }}
                          onBlur={() => {
                            setAddingSubtaskForId(null);
                            setNewSubtaskTitle('');
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="New subtask..."
                          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
                        />
                      </div>
                    )}
                  </div>
                )}
            </TaskItem>
          );
        })}
      </div>
    </SortableContext>
  );

  if (dndMode === 'shared') {
    return <div style={indentPx > 0 ? { paddingLeft: indentPx } : undefined}>{listContent}</div>;
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
        {listContent}

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
