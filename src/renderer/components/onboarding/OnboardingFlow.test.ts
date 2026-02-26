// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  motion: {
    div: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
      createElement('div', props, children),
  },
  useReducedMotion: () => true,
}));

import { ThemeProvider } from '../providers/ThemeProvider';
import { OnboardingFlow } from './OnboardingFlow';

type UntaskMock = {
  settings: {
    setUserName: ReturnType<typeof vi.fn>;
    setAiEnabled: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    setIdentity: ReturnType<typeof vi.fn>;
    markBootstrapCompleted: ReturnType<typeof vi.fn>;
  };
  notifications: {
    fireTest: ReturnType<typeof vi.fn>;
  };
  reminders: {
    requestAccess: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
  };
  apiKeys: {
    set: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
  };
  chat: {
    setSelectedModel: ReturnType<typeof vi.fn>;
  };
  app: {
    getDockMode: ReturnType<typeof vi.fn>;
    getLaunchAtLogin: ReturnType<typeof vi.fn>;
    setDockMode: ReturnType<typeof vi.fn>;
    setLaunchAtLogin: ReturnType<typeof vi.fn>;
  };
  shell: {
    openExternal: ReturnType<typeof vi.fn>;
  };
};

const createUntaskMock = (): UntaskMock => ({
  settings: {
    setUserName: vi.fn().mockResolvedValue(undefined),
    setAiEnabled: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    setIdentity: vi.fn().mockResolvedValue(undefined),
    markBootstrapCompleted: vi.fn().mockResolvedValue(undefined),
  },
  notifications: {
    fireTest: vi.fn().mockResolvedValue({ status: 'granted' as const }),
  },
  reminders: {
    requestAccess: vi.fn().mockResolvedValue({ granted: true }),
    toggle: vi.fn().mockResolvedValue(undefined),
  },
  apiKeys: {
    set: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn().mockResolvedValue({ valid: true }),
  },
  chat: {
    setSelectedModel: vi.fn().mockResolvedValue(undefined),
  },
  app: {
    getDockMode: vi.fn().mockResolvedValue({ mode: 'normal' as const }),
    getLaunchAtLogin: vi.fn().mockResolvedValue({ enabled: false, applied: true }),
    setDockMode: vi.fn().mockResolvedValue({ mode: 'normal' as const }),
    setLaunchAtLogin: vi.fn().mockResolvedValue({ enabled: false, applied: true }),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
});

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('OnboardingFlow', () => {
  let container: HTMLDivElement;
  let root: Root;
  let untaskMock: UntaskMock;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    untaskMock = createUntaskMock();
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    delete (window as unknown as { untask?: unknown }).untask;
    vi.restoreAllMocks();
  });

  const renderFlow = (onComplete?: () => void) => {
    const complete = onComplete ?? vi.fn();
    flushSync(() => {
      root.render(
        createElement(
          ThemeProvider,
          null,
          createElement(OnboardingFlow, { onComplete: complete }),
        ),
      );
    });

    return complete;
  };

  const clickButton = async (label: string) => {
    const button = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.replace(/\s+/g, ' ').trim().includes(label),
    );
    const available = Array.from(container.querySelectorAll('button'))
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .join(' | ');
    expect(button, `available buttons: ${available}`).toBeTruthy();
    flushSync(() => {
      button?.click();
    });
    await tick();
  };

  const pressKey = async (key: string) => {
    flushSync(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
    await tick();
  };

  const headerLabel = () => container.querySelector('header p')?.textContent ?? '';

  it('routes AI-enabled flow through provider with dynamic numbering', async () => {
    renderFlow();

    await clickButton('Get Started');
    await clickButton('Continue');

    expect(headerLabel()).toContain('03 — NOTIFICATIONS');

    await clickButton('Continue');

    expect(headerLabel()).toContain('04 — PROVIDER');
    expect(container.textContent).toContain('04 / 07');
  });

  it('skips provider/identity and keeps contiguous numbering when AI is disabled', async () => {
    renderFlow();

    await clickButton('Get Started');
    await clickButton('Skip');
    await clickButton('Continue');

    await clickButton('Continue');

    expect(headerLabel()).toContain('04 — SHORTCUTS');
    expect(container.textContent).toContain('04 / 05');
  });

  it('supports enter and escape keyboard navigation deterministically', async () => {
    renderFlow();

    await pressKey('Enter');
    expect(headerLabel()).toContain('02 — BASICS');

    await pressKey('Escape');
    expect(headerLabel()).toContain('01 — WELCOME');
  });

  it('marks bootstrap complete and calls onComplete at preferences finish', async () => {
    const onComplete = vi.fn();
    renderFlow(onComplete);

    await clickButton('Get Started');
    await clickButton('Skip');
    await clickButton('Continue');

    await clickButton('Continue');

    expect(headerLabel()).toContain('04 — SHORTCUTS');

    await clickButton('Continue');

    expect(headerLabel()).toContain('05 — PREFERENCES');

    await clickButton('Continue');

    expect(untaskMock.settings.markBootstrapCompleted).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
