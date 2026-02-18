import type { SearchResultItem } from '../../../types/ipc';
import type { AppView } from '../../stores/appStore';

export const resolveSearchResultView = (result: SearchResultItem): AppView => {
  if (result.status === 'inbox') {
    return 'inbox';
  }

  if (result.today) {
    return 'today';
  }

  return 'tasks';
};
