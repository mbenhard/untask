import { useEffect } from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import {
  selectActiveNoteId,
  selectIsViewReady,
  useNotesStore,
} from '../../stores/notesStore';
import { isExplicitNotesNavigationInFlight } from '../../lib/notesNavigation';
import { fadeVariants } from '../../lib/animation';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';

export const NotesView = () => {
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const isViewReady = useNotesStore(selectIsViewReady);
  const enterNotesView = useNotesStore((s) => s.enterNotesView);

  useEffect(() => {
    if (isExplicitNotesNavigationInFlight()) {
      return;
    }

    // Keep notes entry deterministic even when a caller only switched views.
    void enterNotesView();
  }, [enterNotesView]);

  if (!isViewReady) {
    return null;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {activeNoteId ? (
        <motion.div
          key={activeNoteId}
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.08 }}
          className="h-full"
        >
          <NoteEditor />
        </motion.div>
      ) : (
        <motion.div
          key="notes-list"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.08 }}
          className="h-full"
        >
          <NotesList />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
