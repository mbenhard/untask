import { describe, expect, it } from 'vitest';

import { APP_VIEW_ORDER, useAppStore } from './appStore';

describe('appStore navigation', () => {
  it('uses Today | Tasks | Inbox as primary task navigation order', () => {
    expect(APP_VIEW_ORDER.slice(0, 3)).toEqual(['today', 'tasks', 'inbox']);
  });

  it('routes to tasks view without forcing the chat overlay to peek', () => {
    useAppStore.setState({
      activeView: 'today',
      manualNavigationVersion: 0,
      chatOverlayState: 'open',
      newTaskTrigger: 0,
    });

    useAppStore.getState().setView('tasks');
    const state = useAppStore.getState();

    expect(state.activeView).toBe('tasks');
    expect(state.manualNavigationVersion).toBe(1);
    expect(state.chatOverlayState).toBe('open');
  });

  it('setViewFromAssistant changes view without counting manual navigation', () => {
    useAppStore.setState({
      activeView: 'today',
      manualNavigationVersion: 3,
      chatOverlayState: 'open',
      newTaskTrigger: 0,
    });

    useAppStore.getState().setViewFromAssistant('inbox');
    const state = useAppStore.getState();

    expect(state.activeView).toBe('inbox');
    expect(state.manualNavigationVersion).toBe(3);
  });

  it('toggleChatOverlay toggles between peek and open', () => {
    useAppStore.setState({
      chatOverlayState: 'peek',
    });

    useAppStore.getState().toggleChatOverlay();
    expect(useAppStore.getState().chatOverlayState).toBe('open');

    useAppStore.getState().toggleChatOverlay();
    expect(useAppStore.getState().chatOverlayState).toBe('peek');
  });

  it('closeChatOverlayLayer steps open -> peek and stays at peek', () => {
    useAppStore.setState({
      chatOverlayState: 'open',
    });

    useAppStore.getState().closeChatOverlayLayer();
    expect(useAppStore.getState().chatOverlayState).toBe('peek');

    useAppStore.getState().closeChatOverlayLayer();
    expect(useAppStore.getState().chatOverlayState).toBe('peek');
  });
});
