import { useEffect } from 'react';

import {
  selectActiveNoteId,
  useNotesStore,
} from '../../stores/notesStore';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';

export const NotesView = () => {
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const enterNotesView = useNotesStore((s) => s.enterNotesView);

  useEffect(() => {
    void enterNotesView();
  }, [enterNotesView]);

  if (activeNoteId) {
    return <NoteEditor />;
  }

  return <NotesList />;
};
