// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./components/layout/AppShell', () => ({
  AppShell: () => createElement('div', { 'data-testid': 'mock-app-shell' }, 'App Shell'),
}));

vi.mock('./components/onboarding/OnboardingFlow', () => ({
  OnboardingFlow: ({ onComplete }: { onComplete: () => void }) =>
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'mock-onboarding-complete',
        onClick: onComplete,
      },
      'Complete onboarding',
    ),
}));

import { AppRoot } from './App';

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('AppRoot onboarding bootstrap flow', () => {
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

  const mount = () => {
    flushSync(() => {
      root.render(createElement(AppRoot));
    });
  };

  it('shows onboarding when bootstrap is incomplete', async () => {
    const untaskMock = {
      settings: {
        getAiEnabled: vi.fn().mockResolvedValue({ enabled: true }),
        getBootstrapCompleted: vi.fn().mockResolvedValue({ completed: false }),
      },
    };

    (window as unknown as { untask?: unknown }).untask = untaskMock;

    mount();
    await tick();

    expect(container.querySelector('[data-testid="mock-onboarding-complete"]')).not.toBeNull();
  });

  it('completes onboarding and reaches ready state with fallback timer', async () => {
    const untaskMock = {
      settings: {
        getAiEnabled: vi.fn().mockResolvedValue({ enabled: false }),
        getBootstrapCompleted: vi.fn().mockResolvedValue({ completed: false }),
      },
    };

    (window as unknown as { untask?: unknown }).untask = untaskMock;

    mount();
    await tick();

    const completeButton = container.querySelector(
      '[data-testid="mock-onboarding-complete"]',
    ) as HTMLButtonElement | null;
    expect(completeButton).not.toBeNull();

    flushSync(() => {
      completeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await tick();

    expect(localStorage.getItem('untask-bootstrap-done')).toBe('1');

    await new Promise((resolve) => setTimeout(resolve, 500));
    await tick();

    expect(container.querySelector('[data-testid="mock-app-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mock-onboarding-complete"]')).toBeNull();
  });
});
