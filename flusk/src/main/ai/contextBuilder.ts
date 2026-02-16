import type {
  AssistantLiveContext,
} from '../../types/assistant';
import { listTasks } from '../services/taskService';

export type CanonicalRuntimeContext = {
  liveContext: AssistantLiveContext;
};

const buildLiveContextSnapshot = (): AssistantLiveContext => {
  const tasks = listTasks();

  return {
    tasks,
    inboxCount: tasks.filter((task) => task.status === 'inbox').length,
    now: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

export const buildCanonicalRuntimeContext = (): CanonicalRuntimeContext => ({
  liveContext: buildLiveContextSnapshot(),
});
