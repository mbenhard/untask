import { useEffect, useRef, type RefObject } from 'react';

import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useScratchpadStore } from '../stores/scratchpadStore';
import { useSearchStore } from '../stores/searchStore';

type UseKeyboardShortcutsOptions = {
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  clearInput: () => void;
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

export const useKeyboardShortcuts = ({
  inputRef,
  inputValue,
  clearInput,
}: UseKeyboardShortcutsOptions): void => {
  const setView = useAppStore((state) => state.setView);
  const activeView = useAppStore((state) => state.activeView);
  const isChatMode = useAppStore((state) => state.isChatMode);
  const isMemorySettingsOpen = useAppStore((state) => state.isMemorySettingsOpen);
  const triggerNewTask = useAppStore((state) => state.triggerNewTask);
  const exitChatMode = useAppStore((state) => state.exitChatMode);
  const closeMemorySettings = useAppStore((state) => state.closeMemorySettings);
  const undoAction = useChatStore((state) => state.undoAction);
  const isScratchpadOpen = useScratchpadStore((state) => state.isOpen);
  const closeScratchpad = useScratchpadStore((state) => state.close);
  const toggleScratchpad = useScratchpadStore((state) => state.toggleOpen);
  const isSearchOpen = useSearchStore((state) => state.isOpen);
  const openSearch = useSearchStore((state) => state.open);
  const closeSearch = useSearchStore((state) => state.close);

  const inputValueRef = useRef(inputValue);
  const activeViewRef = useRef(activeView);
  const isChatModeRef = useRef(isChatMode);
  const isMemorySettingsOpenRef = useRef(isMemorySettingsOpen);
  const isScratchpadOpenRef = useRef(isScratchpadOpen);
  const isSearchOpenRef = useRef(isSearchOpen);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    isChatModeRef.current = isChatMode;
  }, [isChatMode]);

  useEffect(() => {
    isMemorySettingsOpenRef.current = isMemorySettingsOpen;
  }, [isMemorySettingsOpen]);

  useEffect(() => {
    isScratchpadOpenRef.current = isScratchpadOpen;
  }, [isScratchpadOpen]);

  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
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

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void toggleScratchpad();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (isChatModeRef.current && !isTextInputElement(document.activeElement)) {
          event.preventDefault();
          void undoAction();
          return;
        }
      }

      if (event.key === 'Escape') {
        // Layer 0: close search overlay (highest z-index)
        if (isSearchOpenRef.current) {
          event.preventDefault();
          closeSearch();
          return;
        }

        // Layer 1: close scratchpad overlay
        if (isScratchpadOpenRef.current) {
          event.preventDefault();
          void closeScratchpad();
          return;
        }

        // Layer 2: clear input text
        if (inputValueRef.current.length > 0) {
          event.preventDefault();
          clearInput();
          return;
        }

        // Layer 3: close memory settings overlay
        if (isMemorySettingsOpenRef.current) {
          event.preventDefault();
          closeMemorySettings();
          return;
        }

        // Layer 4: exit chat mode
        if (isChatModeRef.current) {
          event.preventDefault();
          exitChatMode();
          inputRef.current?.blur();
          return;
        }

        // Layer 5: request window hide from main process
        event.preventDefault();
        void window.flusk?.app.requestHide();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTextInputElement(document.activeElement)) {
        return;
      }

      if (event.key === '1') {
        event.preventDefault();
        setView('today');
        return;
      }

      if (event.key === '2') {
        event.preventDefault();
        setView('projects');
        return;
      }

      if (event.key === '3') {
        event.preventDefault();
        setView('inbox');
        return;
      }

      if (
        event.key.toLowerCase() === 'n' &&
        (activeViewRef.current === 'today' || activeViewRef.current === 'inbox') &&
        !isChatModeRef.current &&
        !isMemorySettingsOpenRef.current &&
        !isScratchpadOpenRef.current &&
        !isSearchOpenRef.current
      ) {
        event.preventDefault();
        triggerNewTask();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clearInput,
    closeMemorySettings,
    closeSearch,
    closeScratchpad,
    exitChatMode,
    inputRef,
    openSearch,
    setView,
    toggleScratchpad,
    triggerNewTask,
    undoAction,
  ]);
};
