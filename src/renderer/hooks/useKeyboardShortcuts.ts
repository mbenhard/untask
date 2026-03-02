import { useEffect, useRef, type RefObject } from 'react';

import { getUntask } from '../lib/untask';
import { navigateToNotes } from '../lib/notesNavigation';
import { selectAiEnabled, useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useNotesStore } from '../stores/notesStore';
import { useSearchStore } from '../stores/searchStore';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/toastStore';

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
  const aiEnabled = useAppStore(selectAiEnabled);

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
        if (!aiEnabled) {
          return;
        }
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
        void navigateToNotes({ type: 'create' });
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (activeViewRef.current === 'notes') {
          void navigateToNotes({ type: 'create' });
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
          void navigateToNotes({ type: 'default' });
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
        if (!aiEnabled) {
          return;
        }
        event.preventDefault();
        void notesState.processWithAI();
        return;
      }

      if (
        notesActive
        && (event.metaKey || event.ctrlKey)
        && event.key === 'Backspace'
      ) {
        event.preventDefault();
        if (notesState.activeNoteId) {
          void notesState.archiveNote(notesState.activeNoteId);
          return;
        }

        const selectedId = notesState.selectedListNoteId;
        if (!selectedId) {
          return;
        }

        const isActive = notesState.activeNotes.some((note) => note.id === selectedId);
        if (isActive) {
          void notesState.archiveNote(selectedId);
        }
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
        // Check toast undo first — it has priority over native text input undo.
        // This ensures cmd+Z works after deleting a note even when the editor (contentEditable) is focused.
        const toastStore = useToastStore.getState();
        if (toastStore.toast && toastStore.toast.onUndo && !toastStore.isUndoing) {
          event.preventDefault();
          toastStore.markUndoing();
          void toastStore.toast.onUndo();
          return;
        }

        if (isTextInputElement(document.activeElement)) {
          return;
        }

        event.preventDefault();

        if (chatOverlayState === 'open') {
          void undoAction();
          return;
        }

        if (notesActive) {
          // Notes use local undo callbacks through toast actions only.
          return;
        }

        void (async () => {
          await getUntask().tasks.undoLastUserAction();
          await useTaskStore.getState().refreshTasks();
          useToastStore.getState().showToast('Undone');
        })();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
        if (isTextInputElement(document.activeElement)) {
          return;
        }

        event.preventDefault();

        if (chatOverlayState === 'open') {
          return;
        }

        if (notesActive) {
          return;
        }

        void (async () => {
          await getUntask().tasks.redoLastUserAction();
          await useTaskStore.getState().refreshTasks();
          useToastStore.getState().showToast('Redone');
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

        if (chatOverlayState === 'open' && inputValueRef.current.length > 0) {
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
          requestAnimationFrame(() => {
            const target = document.querySelector<HTMLElement>('[data-primary-focusable]');
            target?.focus();
          });
          return;
        }
      }

    };

    // Capture phase ensures editor-level handlers cannot swallow app shortcuts.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    aiEnabled,
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
