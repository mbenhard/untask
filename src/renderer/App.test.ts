// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoot } from './App';

describe('AppRoot bootstrap loading', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.removeItem('untask-bootstrap-done');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    delete (window as unknown as { untask?: unknown }).untask;
    vi.restoreAllMocks();
  });

  it('renders bootstrap skeleton while bootstrap status is loading', () => {
    const untaskMock = {
      settings: {
        getAiEnabled: vi.fn().mockResolvedValue({ enabled: true }),
        getBootstrapCompleted: vi.fn().mockImplementation(
          () =>
            new Promise<{ completed: boolean }>(() => {
              // Keep pending so bootstrap status stays "loading" in this test.
            }),
        ),
      },
    };

    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(createElement(AppRoot));
    });

    expect(container.querySelector('[data-testid="app-bootstrap-skeleton"]')).not.toBeNull();
  });
});
