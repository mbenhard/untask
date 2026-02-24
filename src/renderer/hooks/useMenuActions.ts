import { useEffect } from 'react';

import { useAppStore } from '../stores/appStore';
import { navigateToNotes } from '../lib/notesNavigation';

export function useMenuActions(): void {
  useEffect(() => {
    const unsubTask = window.untask?.app.onMenuNewTask(() => {
      useAppStore.getState().setView('today');
      useAppStore.getState().triggerNewTask();
    });

    const unsubNote = window.untask?.app.onMenuNewNote(() => {
      void navigateToNotes({ type: 'create' });
    });

    return () => {
      unsubTask?.();
      unsubNote?.();
    };
  }, []);
}
