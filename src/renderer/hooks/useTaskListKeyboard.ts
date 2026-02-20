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
  onDelete: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isAnyBodyEditing: boolean;
  isEditingTitle: boolean;
  isDragActive: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onNavigateNextGroup?: () => void;
  onNavigatePrevGroup?: () => void;
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
  onDelete,
  onMoveUp,
  onMoveDown,
  isAnyBodyEditing,
  isEditingTitle,
  isDragActive,
  containerRef,
  onNavigateNextGroup,
  onNavigatePrevGroup,
}: UseTaskListKeyboardOptions) =>
  useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (tasks.length === 0) {
        return;
      }

      if (isDragActive || isAnyBodyEditing || isEditingTitle) {
        return;
      }

      // Cmd+Backspace → delete focused task
      if (event.key === 'Backspace' && event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const focusedTask = tasks[focusedIndex];
        if (focusedTask) {
          onDelete(focusedTask.id);
        }
        return;
      }

      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        event.stopPropagation();
        const focusedTask = tasks[focusedIndex];
        if (!focusedTask) return;
        if (event.key === 'ArrowUp') {
          onMoveUp?.(focusedTask.id);
        } else {
          onMoveDown?.(focusedTask.id);
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTextInputElement(document.activeElement)) {
        return;
      }

      // Prevent Tab from cycling through internal task row elements
      if (event.key === 'Tab') {
        event.preventDefault();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();

        if (event.key === 'ArrowDown') {
          const isAtLastItem = tasks.length === 0 || focusedIndex >= tasks.length - 1;
          if (isAtLastItem && onNavigateNextGroup) {
            onNavigateNextGroup();
          } else {
            onFocusedIndexChange(Math.min(focusedIndex + 1, tasks.length - 1));
          }
        } else {
          const isAtFirstItem = focusedIndex <= 0;
          if (isAtFirstItem && onNavigatePrevGroup) {
            onNavigatePrevGroup();
          } else {
            onFocusedIndexChange(Math.max(focusedIndex - 1, 0));
          }
        }
        return;
      }

      const isTaskKey = [
        'enter',
        't',
        ' ',
        'p',
        's',
        'e',
        'escape'
      ].includes(event.key.toLowerCase());

      if (isTaskKey) {
        event.preventDefault();
        event.stopPropagation();
      }

      const focusedTask = tasks[focusedIndex];
      if (!focusedTask) {
        if (event.key === 'Escape') {
          containerRef.current?.blur();
        }
        return;
      }

      if (event.key === 'Enter') {
        onToggleExpand(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 't') {
        onToggleToday(focusedTask.id);
        return;
      }

      if (event.key === ' ') {
        onToggleComplete(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 'p') {
        onCyclePriority(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 's') {
        onCycleStatus(focusedTask.id);
        return;
      }

      if (event.key.toLowerCase() === 'e') {
        onStartTitleEdit(focusedTask.id);
        return;
      }

      if (event.key === 'Escape') {
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
      onDelete,
      onMoveUp,
      onMoveDown,
      expandedTaskId,
      containerRef,
      onNavigateNextGroup,
      onNavigatePrevGroup,
    ],
  );
