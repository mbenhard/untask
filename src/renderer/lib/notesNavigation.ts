import { useAppStore } from '../stores/appStore';
import { useNotesStore } from '../stores/notesStore';

export type NotesNavigationIntent =
  | { type: 'default' }
  | { type: 'create' }
  | { type: 'open'; noteId: string };

const DEFAULT_NOTES_INTENT: NotesNavigationIntent = { type: 'default' };
let explicitIntentInFlight = 0;

export const isExplicitNotesNavigationInFlight = (): boolean =>
  explicitIntentInFlight > 0;

const runExplicitNotesIntent = async (
  action: () => Promise<void>,
): Promise<void> => {
  explicitIntentInFlight += 1;
  try {
    await action();
  } finally {
    explicitIntentInFlight = Math.max(0, explicitIntentInFlight - 1);
  }
};

/**
 * Shared notes navigation entrypoint to avoid drift across tabs/shortcuts/menu/search.
 */
export const navigateToNotes = async (
  intent: NotesNavigationIntent = DEFAULT_NOTES_INTENT,
): Promise<void> => {
  const appStore = useAppStore.getState();
  if (appStore.activeView !== 'notes') {
    appStore.setView('notes');
  }

  const notesStore = useNotesStore.getState();
  if (intent.type === 'create') {
    await runExplicitNotesIntent(() => notesStore.createNote());
    return;
  }

  if (intent.type === 'open') {
    await runExplicitNotesIntent(() => notesStore.openNote(intent.noteId));
    return;
  }

  await notesStore.enterNotesView();
};
