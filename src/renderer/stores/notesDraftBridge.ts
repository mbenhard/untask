/**
 * Shared bridge for reading the currently active note draft without creating
 * direct store-to-store import coupling.
 */
type ActiveNoteDraft = {
  noteId: string;
  content: string;
};

let activeNoteDraft: ActiveNoteDraft | null = null;

export const setActiveNoteDraft = (
  noteId: string | null,
  content: string,
): void => {
  if (!noteId) {
    activeNoteDraft = null;
    return;
  }

  activeNoteDraft = { noteId, content };
};

export const getActiveNoteDraftContent = (noteId: string): string | null => {
  if (!activeNoteDraft || activeNoteDraft.noteId !== noteId) {
    return null;
  }

  return activeNoteDraft.content;
};
