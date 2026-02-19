// @vitest-environment jsdom
import { createElement, type HTMLAttributes, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypographyProvider } from '../providers/TypographyProvider';
import {
  UI_FONT_MONO_SETTING_KEY,
  UI_FONT_SANS_SETTING_KEY,
} from '../../lib/typography';
import { SettingsView } from './SettingsView';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  motion: {
    div: (props: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) =>
      createElement('div', props, props.children),
  },
  useReducedMotion: () => true,
}));

const waitFor = async (predicate: () => boolean, timeoutMs = 1500): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error('Timed out waiting for condition.');
};

type MockUntask = {
  settings: {
    get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;
    set: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<{ key: string; value: string }>>>;
    getMemoryState: ReturnType<typeof vi.fn<() => Promise<{ soul: string; profile: string; patterns: string }>>>;
  };
  app: {
    getLaunchAtLogin: ReturnType<typeof vi.fn<() => Promise<{ enabled: boolean; applied: boolean }>>>;
    getWindowDismissMode: ReturnType<typeof vi.fn<() => Promise<{ mode: 'persistent' | 'quick-hide' }>>>;
    getVersion: ReturnType<typeof vi.fn<() => Promise<string>>>;
  };
};

const buildUntaskMock = (): MockUntask => {
  const settingsStore = new Map<string, string>([
    [UI_FONT_SANS_SETTING_KEY, 'geist'],
    [UI_FONT_MONO_SETTING_KEY, 'geist-mono'],
  ]);

  return {
    settings: {
      get: vi.fn<(key: string) => Promise<string | null>>().mockImplementation(
        async (key) => settingsStore.get(key) ?? null,
      ),
      set: vi
        .fn<(key: string, value: string) => Promise<{ key: string; value: string }>>()
        .mockImplementation(async (key, value) => {
          settingsStore.set(key, value);
          return { key, value };
        }),
      getMemoryState: vi.fn<() => Promise<{ soul: string; profile: string; patterns: string }>>().mockResolvedValue({
        soul: '',
        profile: '',
        patterns: '',
      }),
    },
    app: {
      getLaunchAtLogin: vi
        .fn<() => Promise<{ enabled: boolean; applied: boolean }>>()
        .mockResolvedValue({ enabled: false, applied: true }),
      getWindowDismissMode: vi
        .fn<() => Promise<{ mode: 'persistent' | 'quick-hide' }>>()
        .mockResolvedValue({ mode: 'persistent' }),
      getVersion: vi
        .fn<() => Promise<string>>()
        .mockResolvedValue('0.1.8'),
    },
  };
};

describe('SettingsMemory typography controls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
    localStorage.clear();
    delete (window as Window & { untask?: unknown }).untask;
    vi.restoreAllMocks();
  });

  it('updates body and mono fonts from General settings controls', async () => {
    const untaskMock = buildUntaskMock();
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(SettingsView)),
      );
    });

    const bodySelect = await (async () => {
      await waitFor(() => Boolean(container.querySelector('select[aria-label="Body font"]')));
      return container.querySelector('select[aria-label="Body font"]') as HTMLSelectElement;
    })();

    const monoSelect = container.querySelector(
      'select[aria-label="Mono font"]',
    ) as HTMLSelectElement;

    flushSync(() => {
      bodySelect.value = 'inter';
      bodySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    flushSync(() => {
      monoSelect.value = 'ibm-plex-mono';
      monoSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitFor(() =>
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) => key === UI_FONT_SANS_SETTING_KEY && value === 'inter',
      ),
    );
    await waitFor(() =>
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) =>
          key === UI_FONT_MONO_SETTING_KEY && value === 'ibm-plex-mono',
      ),
    );

    expect(
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) => key === UI_FONT_SANS_SETTING_KEY && value === 'inter',
      ),
    ).toBe(true);
    expect(
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) =>
          key === UI_FONT_MONO_SETTING_KEY && value === 'ibm-plex-mono',
      ),
    ).toBe(true);
  });

  it('applies preset buttons and persists both font keys', async () => {
    const untaskMock = buildUntaskMock();
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(SettingsView)),
      );
    });

    await waitFor(() =>
      Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Classic',
      ),
    );
    const classicPresetButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Classic',
    );
    if (!classicPresetButton) {
      throw new Error('Classic preset button not found');
    }

    flushSync(() => {
      classicPresetButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() =>
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) => key === UI_FONT_SANS_SETTING_KEY && value === 'inter',
      ),
    );
    await waitFor(() =>
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) =>
          key === UI_FONT_MONO_SETTING_KEY && value === 'jetbrains-mono',
      ),
    );

    expect(
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) => key === UI_FONT_SANS_SETTING_KEY && value === 'inter',
      ),
    ).toBe(true);
    expect(
      untaskMock.settings.set.mock.calls.some(
        ([key, value]) =>
          key === UI_FONT_MONO_SETTING_KEY && value === 'jetbrains-mono',
      ),
    ).toBe(true);
  });
});
