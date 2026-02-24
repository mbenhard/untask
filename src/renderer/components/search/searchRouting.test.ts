import { describe, expect, it } from 'vitest';

import type { TaskSearchResultItem } from '../../../types/ipc';
import { resolveSearchResultView } from './searchRouting';

const baseResult: TaskSearchResultItem = {
  type: 'task',
  id: 'task-1',
  parentId: null,
  title: 'Test',
  body: null,
  status: 'active',
  today: false,
  client: null,
  priority: 'none',
  dueDate: null,
  snippet: '',
};

describe('resolveSearchResultView', () => {
  it('routes inbox results to inbox', () => {
    expect(
      resolveSearchResultView({
        ...baseResult,
        status: 'inbox',
        today: false,
      }),
    ).toBe('inbox');
  });

  it('routes today results to today when not inbox', () => {
    expect(
      resolveSearchResultView({
        ...baseResult,
        status: 'active',
        today: true,
      }),
    ).toBe('today');
  });

  it('routes all other results to tasks', () => {
    expect(resolveSearchResultView(baseResult)).toBe('tasks');
  });
});
