import type {
  AssistantLiveContext,
  NoteMetadata,
} from '../../types/assistant';
import { listTasks } from '../services/taskService';
import { listNotes, getDisplayTitle } from '../services/notesService';

export type CanonicalRuntimeContext = {
  liveContext: AssistantLiveContext;
};

const buildLiveContextSnapshot = (): AssistantLiveContext => {
  const tasks = listTasks();

  const { active } = listNotes();
  const notesMeta: NoteMetadata[] = active
    .filter((note) => getDisplayTitle(note) !== '')
    .map((note) => ({
      id: note.id,
      title: getDisplayTitle(note),
      isPinned: note.isPinned,
      updatedAt: note.updatedAt,
    }));

  return {
    tasks,
    inboxCount: tasks.filter((task) => task.status === 'inbox').length,
    notes: notesMeta,
    now: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

export const buildCanonicalRuntimeContext = (): CanonicalRuntimeContext => ({
  liveContext: buildLiveContextSnapshot(),
});
