import { useEffect, type RefObject } from 'react';

import type { QuickAddPayload } from '../../types/ipc';

type UseQuickAddListenerOptions = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onPrefill: (text: string) => void;
};

export function useQuickAddListener({
  inputRef,
  onPrefill,
}: UseQuickAddListenerOptions): void {
  useEffect(() => {
    const unsubscribe = window.untask?.app.onQuickAddPayload(
      (payload: QuickAddPayload) => {
        onPrefill(payload.text);

        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [inputRef, onPrefill]);
}
