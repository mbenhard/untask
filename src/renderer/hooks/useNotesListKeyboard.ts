import { useCallback, type KeyboardEvent, type RefObject } from 'react';

type UseNotesListKeyboardOptions = {
  noteCount: number;
  onSelectRelative: (delta: -1 | 1) => void;
  onOpenSelected: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
};

export const useNotesListKeyboard = ({
  noteCount,
  onSelectRelative,
  onOpenSelected,
  containerRef,
}: UseNotesListKeyboardOptions) =>
  useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (noteCount === 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        onSelectRelative(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        onSelectRelative(-1);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        onOpenSelected();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        containerRef.current?.blur();
      }
    },
    [noteCount, onSelectRelative, onOpenSelected, containerRef],
  );
