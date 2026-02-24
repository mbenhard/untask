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

import { isTerminalStatus, PREDEFINED_STATUSES, type PredefinedStatusId, type Task } from '../../../types/models';
import { useShallow } from 'zustand/react/shallow';
import { useTaskListKeyboard } from '../../hooks/useTaskListKeyboard';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { useAppStore } from '../../stores/appStore';
import { useTaskStore, getStableKey } from '../../stores/taskStore';
import { useToastStore } from '../../stores/toastStore';
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

const statusLabelMap = new Map(PREDEFINED_STATUSES.map((s) => [s.id, s.label]));

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
  autoFocus?: boolean;
  isPrimaryList?: boolean;
  focusedIndex?: number;
  onFocusedIndexChange?: (index: number) => void;
  onNavigateNextGroup?: () => void;
  onNavigatePrevGroup?: () => void;
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
  isPrimaryList = false,
  focusedIndex: controlledFocusedIndex,
  onFocusedIndexChange: controlledOnFocusedIndexChange,
  onNavigateNextGroup,
  onNavigatePrevGroup,
}: TaskListProps) => {
  const completeTask = useTaskStore((state) => state.completeTask);
  const reopenTask = useTaskStore((state) => state.reopenTask);
  const createTask = useTaskStore((state) => state.createTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const toggleToday = useTaskStore((state) => state.toggleToday);
  const reorderTasks = useTaskStore((state) => state.reorderTasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const selectTask = useTaskStore((state) => state.selectTask);
  const enabledNonTerminal = useTaskStatusConfigStore(useShallow(selectEnabledNonTerminal));
  const firstEnabledNonTerminal = useTaskStatusConfigStore(selectFirstEnabledNonTerminal);

  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [internalFocusedIndex, setInternalFocusedIndex] = useState(() => 
    isPrimaryList ? 0 : -1
  );
  const [isAnyBodyEditing, setIsAnyBodyEditing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingTitleTaskId, setEditingTitleTaskId] = useState<string | null>(null);
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [navigatedTaskId, setNavigatedTaskId] = useState<string | null>(null);
  const [completeConfirmTrigger, setCompleteConfirmTrigger] = useState<{ taskId: string; ts: number } | null>(null);
  const [deleteConfirmTrigger, setDeleteConfirmTrigger] = useState<{ taskId: string; ts: number } | null>(null);

  const focusedIndex = controlledFocusedIndex ?? internalFocusedIndex;
  const setFocusedIndex = controlledOnFocusedIndexChange ?? setInternalFocusedIndex;

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const effectiveActiveDragId = dndMode === 'shared' ? sharedActiveDragId : activeDragId;
  const activeDragTask = useMemo(
    () => tasks.find((task) => task.id === effectiveActiveDragId) ?? null,
    [effectiveActiveDragId, tasks],
  );

  const prevTasksLengthRef = useRef(tasks.length);

  useEffect(() => {
    const prevLength = prevTasksLengthRef.current;
    const currentLength = tasks.length;

    // Only adjust focusedIndex when tasks are removed, not when added
    // This prevents focusing the newly added task
    if (currentLength < prevLength && controlledFocusedIndex === undefined) {
      const newIndex = Math.min(internalFocusedIndex, currentLength > 0 ? currentLength - 1 : 0);
      if (newIndex !== internalFocusedIndex) {
        setInternalFocusedIndex(newIndex);
      }
    }

    prevTasksLengthRef.current = currentLength;
  }, [tasks.length, controlledFocusedIndex, internalFocusedIndex]);

  useEffect(() => {
    if (expandedTaskId && !taskIds.includes(expandedTaskId)) {
      setExpandedTaskId(null);
      setIsAnyBodyEditing(false);
    }
  }, [expandedTaskId, taskIds]);

  // Focus task when focusedIndex changes (user navigation)
  useEffect(() => {
    const focusedTaskId = tasks[focusedIndex]?.id;
    if (!focusedTaskId) {
      return;
    }

    // Use rAF to let the DOM settle after view transitions before checking focus ownership.
    const rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const nextFocused = container.querySelector<HTMLElement>(
        `[data-task-id="${focusedTaskId}"]`,
      );
      if (!nextFocused) return;

      // If focus is already on the target, do nothing
      if (nextFocused === document.activeElement) return;

      const activeEl = document.activeElement;

      // Don't steal focus from a nested TaskList (subtask list).
      // Check if the focused element belongs to a deeper [role="listbox"]
      // container — if so, this parent should not interfere.
      if (
        activeEl instanceof HTMLElement &&
        container.contains(activeEl) &&
        activeEl.closest('[role="listbox"]') !== container
      ) {
        return;
      }

      // Primary lists can claim focus when nothing meaningful owns it
      // (e.g. after view switch or inline input dismiss).
      const focusIsUnowned = isPrimaryList && (!activeEl || activeEl === document.body);
      if (!focusIsUnowned && !container.contains(activeEl)) return;

      nextFocused.focus();
    });

    return () => cancelAnimationFrame(rafId);
  }, [focusedIndex, isPrimaryList, tasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }
    let pulseFrameId: number | null = null;
    let focusFrameId: number | null = null;

    const selectedIndex = tasks.findIndex((task) => task.id === selectedTaskId);

    if (selectedIndex >= 0) {
      // Direct task in this list — expand + focus it.
      selectTask(null);
      setFocusedIndex(selectedIndex);
      setExpandedTaskId(selectedTaskId);
      setIsAnyBodyEditing(false);

      // Trigger navigation pulse. Clear first to restart animation if same task.
      setNavigatedTaskId(null);
      pulseFrameId = requestAnimationFrame(() => setNavigatedTaskId(selectedTaskId));

      focusFrameId = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;
        const target = container.querySelector<HTMLElement>(
          `[data-task-id="${selectedTaskId}"]`,
        );
        if (!target) return;
        target.scrollIntoView({ block: 'nearest' });
        target.focus();
      });
      return () => {
        if (pulseFrameId !== null) {
          cancelAnimationFrame(pulseFrameId);
        }
        if (focusFrameId !== null) {
          cancelAnimationFrame(focusFrameId);
        }
      };
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
    return () => {
      if (pulseFrameId !== null) {
        cancelAnimationFrame(pulseFrameId);
      }
      if (focusFrameId !== null) {
        cancelAnimationFrame(focusFrameId);
      }
    };
  }, [allTasks, selectTask, selectedTaskId, tasks, setFocusedIndex]);

  // Clear navigated highlight after animation completes
  useEffect(() => {
    if (!navigatedTaskId) return;
    const timer = setTimeout(() => setNavigatedTaskId(null), 1200);
    return () => clearTimeout(timer);
  }, [navigatedTaskId]);

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

  const handleRequestCompleteConfirm = useCallback(
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
        const subtasks = allTasks.filter((t) => t.parentId === taskId);
        const activeChildren = subtasks.filter(
          (t) => !isTerminalStatus(t.status as never),
        ).length;
        if (activeChildren > 0) {
          setCompleteConfirmTrigger({ taskId, ts: Date.now() });
          return;
        }
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
    [allTasks, completeTask, expandedTaskId, firstEnabledNonTerminal, reopenTask, tasks, updateTask],
  );

  const handleCompleteWithChildren = useCallback(
    (taskId: string): void => {
      void completeTask(taskId, { completeChildren: true });
      if (expandedTaskId === taskId) {
        setExpandedTaskId(null);
      }
    },
    [completeTask, expandedTaskId],
  );

  const handleCompleteConfirmTriggerHandled = useCallback((taskId: string): void => {
    setCompleteConfirmTrigger((current) => (
      current?.taskId === taskId ? null : current
    ));
  }, []);

  const handleDeleteConfirmTriggerHandled = useCallback((taskId: string): void => {
    setDeleteConfirmTrigger((current) => (
      current?.taskId === taskId ? null : current
    ));
  }, []);

  const handleDelete = useCallback(
    (taskId: string): void => {
      const currentTask = tasks.find((candidate) => candidate.id === taskId);
      if (!currentTask) return;
      const subtasks = allTasks.filter((t) => t.parentId === taskId);
      const activeChildren = subtasks.filter(
        (t) => !isTerminalStatus(t.status as never),
      ).length;
      if (activeChildren > 0) {
        setDeleteConfirmTrigger({ taskId, ts: Date.now() });
        return;
      }
      void deleteTask(taskId, false);
    },
    [allTasks, deleteTask, tasks],
  );

  const handleToggleToday = useCallback(
    (taskId: string): void => {
      const currentTask = tasks.find((t) => t.id === taskId);
      const wasToday = currentTask?.today;
      void toggleToday(taskId);
      // Only show toast when removing from Today while viewing Today (task leaves view)
      if (wasToday && useAppStore.getState().activeView === 'today') {
        useToastStore.getState().showToast('Removed from Today', async () => {
          await getUntask().tasks.undoLastUserAction();
          await useTaskStore.getState().refreshTasks();
        });
      }
    },
    [tasks, toggleToday],
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
      if (!currentTask || currentTask.parentId !== null) {
        return;
      }

      const nextStatus = getNextStatusInCycle(
        currentTask.status,
        enabledNonTerminal,
      );

      void updateTask({ id: taskId, status: nextStatus });
      const label = statusLabelMap.get(nextStatus as PredefinedStatusId) ?? nextStatus;
      useToastStore.getState().showToast(`Moved to ${label}`, async () => {
        await getUntask().tasks.undoLastUserAction();
        await useTaskStore.getState().refreshTasks();
      });
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

  const handleMoveUp = useCallback(
    (taskId: string): void => {
      const currentIndex = taskIds.indexOf(taskId);
      if (currentIndex <= 0) return;

      const reorderedScopedIds = arrayMove(taskIds, currentIndex, currentIndex - 1);
      const fullOrderedIds = reconcileScopedReorder(
        allTasks.map((task) => task.id),
        taskIds,
        reorderedScopedIds,
      );

      setFocusedIndex(currentIndex - 1);
      void reorderTasks(fullOrderedIds);
    },
    [allTasks, reorderTasks, taskIds, setFocusedIndex],
  );

  const handleMoveDown = useCallback(
    (taskId: string): void => {
      const currentIndex = taskIds.indexOf(taskId);
      if (currentIndex < 0 || currentIndex >= taskIds.length - 1) return;

      const reorderedScopedIds = arrayMove(taskIds, currentIndex, currentIndex + 1);
      const fullOrderedIds = reconcileScopedReorder(
        allTasks.map((task) => task.id),
        taskIds,
        reorderedScopedIds,
      );

      setFocusedIndex(currentIndex + 1);
      void reorderTasks(fullOrderedIds);
    },
    [allTasks, reorderTasks, taskIds, setFocusedIndex],
  );

  const onKeyDown = useTaskListKeyboard({
    tasks,
    focusedIndex,
    onFocusedIndexChange: setFocusedIndex,
    expandedTaskId,
    onToggleExpand: handleToggleExpand,
    onToggleComplete: handleRequestCompleteConfirm,
    onToggleToday: handleToggleToday,
    onCyclePriority: handleCyclePriority,
    onCycleStatus: handleCycleStatus,
    isAnyBodyEditing,
    isDragActive: effectiveActiveDragId !== null,
    containerRef,
    onStartTitleEdit: setEditingTitleTaskId,
    onDelete: handleDelete,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown,
    isEditingTitle: editingTitleTaskId !== null,
    onNavigateNextGroup,
    onNavigatePrevGroup,
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
        className="outline-none"
        {...(isPrimaryList ? { 'data-primary-focusable': '' } : undefined)}
      >
        <p id={`${scopeId}-hint`} className="sr-only">
          Use Arrow Up and Arrow Down to move focus. Press Option+Arrow Up or Option+Arrow Down to reorder.
          Press Enter to expand. Press Space to complete or reopen. Press T to toggle today.
          Press P to cycle priority. Press S to cycle status.
          In Tasks view, drag tasks between status groups or drop onto tasks for exact placement.
          Press E to edit title. Press Command+Backspace to delete.
        </p>
        {tasks.map((task, index) => {
          const isExpanded = expandedTaskId === task.id;
          const canOwnSubtasks = task.parentId === null;
          const subtasks = canOwnSubtasks
            ? allTasks.filter((candidate) => candidate.parentId === task.id)
            : [];

          return (
            <TaskItem
              key={getStableKey(task.id)}
              task={task}
              isExpanded={isExpanded}
              isFocused={focusedIndex === index}
              isEditingTitle={editingTitleTaskId === task.id}
              isNavigatedTo={task.id === navigatedTaskId}
              hasChildren={subtasks.length > 0}
              childrenCount={subtasks.length}
              childrenDoneCount={subtasks.filter((s) => s.status === 'done').length}
              onStartTitleEdit={setEditingTitleTaskId}
              onEndTitleEdit={() => setEditingTitleTaskId(null)}
              onToggleExpand={handleToggleExpand}
              onComplete={handleComplete}
              onCompleteWithChildren={handleCompleteWithChildren}
              onToggleToday={handleToggleToday}
              onFocus={() => setFocusedIndex(index)}
              completeConfirmTrigger={completeConfirmTrigger}
              deleteConfirmTrigger={deleteConfirmTrigger}
              onCompleteConfirmTriggerHandled={handleCompleteConfirmTriggerHandled}
              onDeleteConfirmTriggerHandled={handleDeleteConfirmTriggerHandled}
            >
              <TaskBody
                task={task}
                isExpanded={isExpanded}
                subtaskCount={subtasks.length}
                indentPx={indentPx}
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
                        onNavigatePrevGroup={() => {
                          setFocusedIndex(index);
                          requestAnimationFrame(() => {
                            containerRef.current
                              ?.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`)
                              ?.focus();
                          });
                        }}
                        onNavigateNextGroup={() => {
                          if (index < tasks.length - 1) {
                            setFocusedIndex(index + 1);
                          } else {
                            onNavigateNextGroup?.();
                          }
                        }}
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
                            if (newSubtaskTitle.trim()) {
                              void createTask({
                                title: newSubtaskTitle.trim(),
                                parentId: task.id,
                                status: 'active',
                                priority: 'none',
                              });
                            }
                            setAddingSubtaskForId(null);
                            setNewSubtaskTitle('');
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="New subtask..."
                          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
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
