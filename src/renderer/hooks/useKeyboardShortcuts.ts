import { useEffect, useRef, type RefObject } from 'react';

import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useNotesStore } from '../stores/notesStore';
import { useSearchStore } from '../stores/searchStore';

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

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setView('notes');
        return;
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
        if (chatOverlayState === 'open' && !isTextInputElement(document.activeElement)) {
          event.preventDefault();
          void undoAction();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        onToggleTheme?.();
        return;
      }

      if (event.key === 'Escape') {
        // Layer 0: close search overlay (highest z-index).
        if (isSearchOpenRef.current) {
          event.preventDefault();
          closeSearch();
          return;
        }

        // Notes editor shortcut: escape returns to list when chat overlay is not open.
        if (notesActive && notesState.subView === 'editor' && chatOverlayState === 'peek') {
          event.preventDefault();
          void notesState.backToList();
          return;
        }

        // Layer 1: clear input text.
        if (inputValueRef.current.length > 0) {
          event.preventDefault();
          clearInput();
          return;
        }

        // Layer 2: navigate away from settings view.
        if (activeViewRef.current === 'settings') {
          event.preventDefault();
          setView('today');
          return;
        }

        // Layer 3: collapse chat overlay (open -> peek).
        if (chatOverlayState === 'open') {
          event.preventDefault();
          closeChatOverlayLayer();
          clearPendingNoteContext();
          inputRef.current?.blur();
          return;
        }
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTextInputElement(document.activeElement)) {
        return;
      }

      if (
        notesActive
        && chatOverlayState === 'peek'
        && notesState.layoutMode !== 'focus'
        && !isSearchOpenRef.current
      ) {
        if (event.key.toLowerCase() === 'j') {
          event.preventDefault();
          notesState.selectRelativeActive(1);
          return;
        }

        if (event.key.toLowerCase() === 'k') {
          event.preventDefault();
          notesState.selectRelativeActive(-1);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          void notesState.openSelectedNote();
          return;
        }
      }

      if (event.key === '1') {
        event.preventDefault();
        setView('today');
        return;
      }

      if (event.key === '2') {
        event.preventDefault();
        setView('tasks');
        return;
      }

      if (event.key === '3') {
        event.preventDefault();
        setView('inbox');
        return;
      }

      if (event.key === '4') {
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

      // Comma opens settings.
      if (event.key === ',') {
        event.preventDefault();
        setView('settings');
        return;
      }

      if (
        event.key.toLowerCase() === 'n'
        && (
          activeViewRef.current === 'today'
          || activeViewRef.current === 'tasks'
          || activeViewRef.current === 'inbox'
        )
        && chatOverlayState === 'peek'
        && !isSearchOpenRef.current
      ) {
        event.preventDefault();
        triggerNewTask();
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
