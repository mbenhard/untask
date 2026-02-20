import { useEffect } from 'react';

import type { QuickAddPayload } from '../../types/ipc';
import { useAppStore } from '../stores/appStore';

export function useQuickAddListener(): void {
  const openQuickAdd = useAppStore((state) => state.openQuickAdd);

  useEffect(() => {
    const unsubscribe = window.untask?.app.onQuickAddPayload(
      (payload: QuickAddPayload) => {
        openQuickAdd(payload.text);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [openQuickAdd]);
}
