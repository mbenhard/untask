import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import type { Task } from '../../types/models';

type UseTaskListKeyboardOptions = {
  tasks: Task[];
  focusedIndex: number;
  onFocusedIndexChange: (index: number) => void;
  expandedTaskId: string | null;
  onToggleExpand: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onCyclePriority: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onStartTitleEdit: (id: string) => void;
  isAnyBodyEditing: boolean;
  isEditingTitle: boolean;
  isDragActive: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
};

const isTextInputElement = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable
  );
};

export const useTaskListKeyboard = ({
  tasks,
  focusedIndex,
  onFocusedIndexChange,
  expandedTaskId,
  onToggleExpand,
  onToggleComplete,
  onToggleToday,
  onCyclePriority,
  onCycleStatus,
  onStartTitleEdit,
  isAnyBodyEditing,
  isEditingTitle,
  isDragActive,
  containerRef,
}: UseTaskListKeyboardOptions) =>
  useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (tasks.length === 0) {
        return;
      }

      if (isDragActive || isAnyBodyEditing || isEditingTitle) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTextInputElement(document.activeElement)) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        onFocusedIndexChange(Math.min(focusedIndex + 1, tasks.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        onFocusedIndexChange(Math.max(focusedIndex - 1, 0));
        return;
      }

      const focusedTask = tasks[focusedIndex];
      if (!focusedTask) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        onToggleExpand(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        onToggleToday(focusedTask.id);
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        onToggleComplete(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        onCyclePriority(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        onCycleStatus(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onStartTitleEdit(focusedTask.id);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (expandedTaskId) {
          onToggleExpand(expandedTaskId);
          return;
        }

        containerRef.current?.blur();
      }
    },
    [
      tasks,
      isDragActive,
      isAnyBodyEditing,
      isEditingTitle,
      onFocusedIndexChange,
      focusedIndex,
      onToggleExpand,
      onToggleComplete,
      onToggleToday,
      onCyclePriority,
      onCycleStatus,
      onStartTitleEdit,
      expandedTaskId,
      containerRef,
    ],
  );
