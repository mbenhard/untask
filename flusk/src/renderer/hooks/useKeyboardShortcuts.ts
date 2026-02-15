import { useEffect, useRef, type RefObject } from 'react';

import { useAppStore } from '../stores/appStore';

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
  const isChatMode = useAppStore((state) => state.isChatMode);
  const exitChatMode = useAppStore((state) => state.exitChatMode);

  const inputValueRef = useRef(inputValue);
  const isChatModeRef = useRef(isChatMode);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    isChatModeRef.current = isChatMode;
  }, [isChatMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape') {
        if (inputValueRef.current.length > 0) {
          event.preventDefault();
          clearInput();
          return;
        }

        if (isChatModeRef.current) {
          event.preventDefault();
          exitChatMode();
          inputRef.current?.blur();
        }

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
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearInput, exitChatMode, inputRef, setView]);
};
