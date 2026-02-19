import { useEffect, useRef, type RefObject } from 'react';

import { getUntask } from '../lib/untask';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useNotesStore } from '../stores/notesStore';
import { useSearchStore } from '../stores/searchStore';
import { useTaskStore } from '../stores/taskStore';

type UseKeyboardShortcutsOptions = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  clearInput: () => void;
  onToggleTheme?: () => void;
};

const isTextInputElement = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.isContentEditable
  );
};

export const useKeyboardShortcuts = ({
  inputRef,
  inputValue,
  clearInput,
  onToggleTheme,
}: UseKeyboardShortcutsOptions): void => {
  const setView = useAppStore((state) => state.setView);
  const activeView = useAppStore((state) => state.activeView);
  const triggerNewTask = useAppStore((state) => state.triggerNewTask);
  const toggleChatOverlay = useAppStore((state) => state.toggleChatOverlay);
  const closeChatOverlayLayer = useAppStore((state) => state.closeChatOverlayLayer);

  const undoAction = useChatStore((state) => state.undoAction);
  const clearPendingNoteContext = useChatStore((state) => state.clearPendingNoteContext);

  const isSearchOpen = useSearchStore((state) => state.isOpen);
  const openSearch = useSearchStore((state) => state.open);
  const closeSearch = useSearchStore((state) => state.close);

  const inputValueRef = useRef(inputValue);
  const activeViewRef = useRef(activeView);
  const isSearchOpenRef = useRef(isSearchOpen);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const chatOverlayState = useAppStore.getState().chatOverlayState;
      const notesState = useNotesStore.getState();
      const notesActive = activeViewRef.current === 'notes';

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const isOpen = chatOverlayState === 'open';
        toggleChatOverlay();
        if (isOpen) {
          clearPendingNoteContext();
          inputRef.current?.blur();
        } else {
          inputRef.current?.focus();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (isSearchOpenRef.current) {
          closeSearch();
        } else {
          openSearch();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setView('notes');
        void useNotesStore.getState().createNote();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (activeViewRef.current === 'notes') {
          setView('notes');
          void useNotesStore.getState().createNote();
        } else {
          triggerNewTask();
        }
        return;
      }

      // View navigation: Cmd+1–4, Cmd+, (use event.code for international keyboard support)
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
        if (event.code === 'Digit1') {
          event.preventDefault();
          setView('today');
          return;
        }
        if (event.code === 'Digit2') {
          event.preventDefault();
          setView('tasks');
          return;
        }
        if (event.code === 'Digit3') {
          event.preventDefault();
          setView('inbox');
          return;
        }
        if (event.code === 'Digit4') {
          event.preventDefault();
          setView('notes');
          return;
        }
        if (event.code === 'Comma') {
          event.preventDefault();
          setView('settings');
          return;
        }
      }

      if (
        notesActive
        && notesState.activeNoteId
        && (event.metaKey || event.ctrlKey)
        && !event.shiftKey
        && event.key === 'Enter'
      ) {
        event.preventDefault();
        void notesState.processWithAI();
        return;
      }

      if (
        notesActive
        && notesState.activeNoteId
        && (event.metaKey || event.ctrlKey)
        && event.shiftKey
        && event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        void notesState.archiveNote(notesState.activeNoteId);
        return;
      }

      if (notesActive && notesState.activeNoteId && event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        void notesState.openAdjacentNote(-1);
        return;
      }

      if (notesActive && notesState.activeNoteId && event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        void notesState.openAdjacentNote(1);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (isTextInputElement(document.activeElement)) {
          return;
        }

        event.preventDefault();

        if (chatOverlayState === 'open') {
          void undoAction();
          return;
        }

        void (async () => {
          await getUntask().tasks.undoLastUserAction();
          await useTaskStore.getState().fetchTasks();
        })();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        onToggleTheme?.();
        return;
      }

      // Escape layers: search → notes editor back-to-list → clear chat input → leave settings → close chat overlay
      if (event.key === 'Escape') {
        if (isSearchOpenRef.current) {
          event.preventDefault();
          closeSearch();
          return;
        }

        if (notesActive && notesState.subView === 'editor' && chatOverlayState === 'peek') {
          event.preventDefault();
          void notesState.backToList();
          return;
        }

        if (inputValueRef.current.length > 0) {
          event.preventDefault();
          clearInput();
          return;
        }

        if (activeViewRef.current === 'settings') {
          event.preventDefault();
          setView('today');
          return;
        }

        if (chatOverlayState === 'open') {
          event.preventDefault();
          closeChatOverlayLayer();
          clearPendingNoteContext();
          inputRef.current?.blur();
          return;
        }
      }

    };

    // Capture phase ensures editor-level handlers cannot swallow app shortcuts.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    clearInput,
    closeSearch,
    closeChatOverlayLayer,
    clearPendingNoteContext,
    inputRef,
    onToggleTheme,
    openSearch,
    setView,
    toggleChatOverlay,
    triggerNewTask,
    undoAction,
  ]);
};
