import { useEffect } from 'react';

import {
  selectActiveNoteId,
  useNotesStore,
} from '../../stores/notesStore';
import { isExplicitNotesNavigationInFlight } from '../../lib/notesNavigation';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';

export const NotesView = () => {
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const enterNotesView = useNotesStore((s) => s.enterNotesView);

  useEffect(() => {
    if (isExplicitNotesNavigationInFlight()) {
      return;
    }

    // Keep notes entry deterministic even when a caller only switched views.
    void enterNotesView();
  }, [enterNotesView]);

  if (activeNoteId) {
    return <NoteEditor />;
  }

  return <NotesList />;
};
