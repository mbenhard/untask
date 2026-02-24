import type { TaskSearchResultItem } from '../../../types/ipc';
import type { AppView } from '../../stores/appStore';

export const resolveSearchResultView = (result: TaskSearchResultItem): AppView => {
  if (result.status === 'inbox') {
    return 'inbox';
  }

  if (result.today) {
    return 'today';
  }

  return 'tasks';
};
