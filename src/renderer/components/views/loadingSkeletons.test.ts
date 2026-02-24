// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InboxView } from './InboxView';
import { TasksView } from './TasksView';
import { TodayView } from './TodayView';

describe('task views loading skeletons', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  it('shows skeleton for TodayView while loading and hides it when ready', () => {
    flushSync(() => {
      root.render(createElement(TodayView, { allTasks: [], isLoading: true, error: null }));
    });
    expect(container.querySelector('[data-testid="task-view-skeleton"]')).not.toBeNull();

    flushSync(() => {
      root.render(createElement(TodayView, { allTasks: [], isLoading: false, error: null }));
    });
    expect(container.querySelector('[data-testid="task-view-skeleton"]')).toBeNull();
  });

  it('shows skeleton for TasksView while loading and hides it when ready', () => {
    flushSync(() => {
      root.render(createElement(TasksView, { allTasks: [], isLoading: true, error: null }));
    });
    expect(container.querySelector('[data-testid="task-view-skeleton"]')).not.toBeNull();

    flushSync(() => {
      root.render(createElement(TasksView, { allTasks: [], isLoading: false, error: null }));
    });
    expect(container.querySelector('[data-testid="task-view-skeleton"]')).toBeNull();
  });

  it('shows skeleton for InboxView while loading and hides it when ready', () => {
    flushSync(() => {
      root.render(createElement(InboxView, { allTasks: [], isLoading: true, error: null }));
    });
    expect(container.querySelector('[data-testid="task-view-skeleton"]')).not.toBeNull();

    flushSync(() => {
      root.render(createElement(InboxView, { allTasks: [], isLoading: false, error: null }));
    });
    expect(container.querySelector('[data-testid="task-view-skeleton"]')).toBeNull();
  });
});
