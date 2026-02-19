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
  const aiEnabled = useAppStore((state) => state.aiEnabled);
  const openQuickAdd = useAppStore((state) => state.openQuickAdd);

  useEffect(() => {
    const unsubscribe = window.untask?.app.onQuickAddPayload(
      (payload: QuickAddPayload) => {
        if (aiEnabled) {
          openChatOverlay();
          onPrefill(payload.text);
        } else {
          openQuickAdd(payload.text);
        }

        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [inputRef, onPrefill, openChatOverlay, openQuickAdd, aiEnabled]);
}
