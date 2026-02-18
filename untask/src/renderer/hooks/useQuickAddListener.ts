import { useEffect, type RefObject } from 'react';

import type { QuickAddPayload } from '../../types/ipc';
import { useAppStore } from '../stores/appStore';

type UseQuickAddListenerOptions = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onPrefill: (text: string) => void;
};

export function useQuickAddListener({
  inputRef,
  onPrefill,
}: UseQuickAddListenerOptions): void {
  const openChatOverlay = useAppStore((state) => state.openChatOverlay);

  useEffect(() => {
    const unsubscribe = window.untask?.app.onQuickAddPayload(
      (payload: QuickAddPayload) => {
        openChatOverlay();
        onPrefill(payload.text);

        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [inputRef, onPrefill, openChatOverlay]);
}
