import { describe, expect, it } from 'vitest';

import { APP_VIEW_ORDER, useAppStore } from './appStore';

describe('appStore navigation', () => {
  it('uses Today | Tasks | Inbox as primary task navigation order', () => {
    expect(APP_VIEW_ORDER.slice(0, 3)).toEqual(['today', 'tasks', 'inbox']);
  });

  it('routes to tasks view and exits chat mode', () => {
    useAppStore.setState({
      activeView: 'today',
      isChatMode: true,
      isMemorySettingsOpen: false,
      newTaskTrigger: 0,
    });

    useAppStore.getState().setView('tasks');
    const state = useAppStore.getState();

    expect(state.activeView).toBe('tasks');
    expect(state.isChatMode).toBe(false);
  });
});
