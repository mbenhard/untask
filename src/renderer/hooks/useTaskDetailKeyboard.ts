import { useCallback, type KeyboardEvent } from 'react';

import type { Task } from '../../types/models';

type UseTaskDetailKeyboardOptions = {
  task: Task | null;
  isEditingTitle: boolean;
  onToggleToday: () => void;
  onCyclePriority: () => void;
  onCycleStatus: () => void;
  onToggleComplete: () => void;
  onStartTitleEdit: () => void;
  onDelete: () => void;
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

export const useTaskDetailKeyboard = ({
  task,
  isEditingTitle,
  onToggleToday,
  onCyclePriority,
  onCycleStatus,
  onToggleComplete,
  onStartTitleEdit,
  onDelete,
}: UseTaskDetailKeyboardOptions) =>
  useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (!task || isEditingTitle) {
        return;
      }

      if (isTextInputElement(document.activeElement)) {
        return;
      }

      // Cmd+Backspace → delete
      if (event.key === 'Backspace' && event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (['t', 'p', 's', ' ', 'e'].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (key === 't') {
        onToggleToday();
        return;
      }

      if (key === 'p') {
        onCyclePriority();
        return;
      }

      if (key === 's') {
        onCycleStatus();
        return;
      }

      if (event.key === ' ') {
        onToggleComplete();
        return;
      }

      if (key === 'e') {
        onStartTitleEdit();
        return;
      }
    },
    [
      task,
      isEditingTitle,
      onToggleToday,
      onCyclePriority,
      onCycleStatus,
      onToggleComplete,
      onStartTitleEdit,
      onDelete,
    ],
  );
