import { useEffect } from 'react';

import {
  selectActiveNoteId,
  useNotesStore,
} from '../../stores/notesStore';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';

export const NotesView = () => {
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const loadList = useNotesStore((s) => s.loadList);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  if (activeNoteId) {
    return <NoteEditor />;
  }

  return <NotesList />;
};
