import type {
  AssistantLiveContext,
  NoteMetadata,
  Task,
} from '../../types/assistant';
import { listTasks } from '../services/taskService';
import { listNotes, getDisplayTitle } from '../services/notesService';

export type CanonicalRuntimeContext = {
  liveContext: AssistantLiveContext;
};

const buildLiveContextSnapshot = (): AssistantLiveContext => {
  // listTasks() returns hydrated tasks (tags: string[]) but Drizzle's
  // inferred type still shows tags as string | null. Cast is safe here.
  const tasks = listTasks() as unknown as Task[];

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
