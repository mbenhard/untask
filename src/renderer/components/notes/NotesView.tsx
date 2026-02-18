import { useEffect } from 'react';

import {
  selectActiveNoteId,
  selectNotesLayoutMode,
  useNotesStore,
} from '../../stores/notesStore';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';

export const NotesView = () => {
  const layoutMode = useNotesStore(selectNotesLayoutMode);
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const loadList = useNotesStore((s) => s.loadList);
  const setViewportWidth = useNotesStore((s) => s.setViewportWidth);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const syncViewport = () => {
      setViewportWidth(window.innerWidth);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
    };
  }, [setViewportWidth]);

  if (layoutMode === 'split' && activeNoteId) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[290px_1fr] overflow-hidden">
        <div className="min-h-0 border-r border-border/60">
          <NotesList compact />
        </div>
        <div className="min-h-0">
          <NoteEditor showBackButton={false} />
        </div>
      </div>
    );
  }

  if (layoutMode === 'focus' && activeNoteId) {
    return <NoteEditor />;
  }

  return <NotesList />;
};
