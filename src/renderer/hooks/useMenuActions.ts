import { useEffect } from 'react';

import { useAppStore } from '../stores/appStore';
import { useNotesStore } from '../stores/notesStore';

export function useMenuActions(): void {
  useEffect(() => {
    const unsubTask = window.untask?.app.onMenuNewTask(() => {
      useAppStore.getState().setView('today');
      useAppStore.getState().triggerNewTask();
    });

    const unsubNote = window.untask?.app.onMenuNewNote(() => {
      useAppStore.getState().setView('notes');
      void useNotesStore.getState().enterNotesView();
    });

    return () => {
      unsubTask?.();
      unsubNote?.();
    };
  }, []);
}
