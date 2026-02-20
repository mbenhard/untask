// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TypographyContextValue } from './TypographyProvider';
import { TypographyProvider, useTypography } from './TypographyProvider';
import {
  UI_FONT_MONO_SETTING_KEY,
  UI_FONT_MONO_STORAGE_KEY,
  UI_FONT_SANS_SETTING_KEY,
  UI_FONT_SANS_STORAGE_KEY,
} from '../../lib/typography';

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
  };
};

let latestContext: TypographyContextValue | null = null;

const HookHarness = (): null => {
  latestContext = useTypography();
  return null;
};

describe('TypographyProvider', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestContext = null;
    localStorage.clear();
    document.documentElement.style.removeProperty('--ui-font-sans-stack');
    document.documentElement.style.removeProperty('--ui-font-mono-stack');

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

  it('hydrates from localStorage first and applies CSS vars before DB completes', () => {
    localStorage.setItem(UI_FONT_SANS_STORAGE_KEY, 'inter');
    localStorage.setItem(UI_FONT_MONO_STORAGE_KEY, 'jetbrains-mono');

    const untaskMock: MockUntask = {
      settings: {
        get: vi.fn<(key: string) => Promise<string | null>>().mockImplementation(
          () =>
            new Promise(() => {
              // keep unresolved to assert localStorage-first hydration path
            }),
        ),
        set: vi
          .fn<(key: string, value: string) => Promise<{ key: string; value: string }>>()
          .mockResolvedValue({ key: '', value: '' }),
      },
    };
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(HookHarness)),
      );
    });

    expect(latestContext?.sansId).toBe('inter');
    expect(latestContext?.monoId).toBe('jetbrains-mono');
    expect(document.documentElement.style.getPropertyValue('--ui-font-sans-stack')).toContain(
      'Inter',
    );
    expect(document.documentElement.style.getPropertyValue('--ui-font-mono-stack')).toContain(
      'JetBrains Mono',
    );
  });

  it('reconciles with DB settings when they are available', async () => {
    localStorage.setItem(UI_FONT_SANS_STORAGE_KEY, 'inter');
    localStorage.setItem(UI_FONT_MONO_STORAGE_KEY, 'jetbrains-mono');

    const untaskMock: MockUntask = {
      settings: {
        get: vi.fn<(key: string) => Promise<string | null>>().mockImplementation(async (key) => {
          if (key === UI_FONT_SANS_SETTING_KEY) {
            return 'ibm-plex-sans';
          }
          if (key === UI_FONT_MONO_SETTING_KEY) {
            return 'ibm-plex-mono';
          }
          return null;
        }),
        set: vi
          .fn<(key: string, value: string) => Promise<{ key: string; value: string }>>()
          .mockResolvedValue({ key: '', value: '' }),
      },
    };
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(HookHarness)),
      );
    });

    await waitFor(() => latestContext?.isReady === true);

    expect(latestContext?.sansId).toBe('ibm-plex-sans');
    expect(latestContext?.monoId).toBe('ibm-plex-mono');
    expect(document.documentElement.style.getPropertyValue('--ui-font-sans-stack')).toContain(
      'IBM Plex Sans',
    );
    expect(document.documentElement.style.getPropertyValue('--ui-font-mono-stack')).toContain(
      'IBM Plex Mono',
    );
  });

  it('persists setSans and setMono and mirrors values to localStorage', async () => {
    const untaskMock: MockUntask = {
      settings: {
        get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
        set: vi
          .fn<(key: string, value: string) => Promise<{ key: string; value: string }>>()
          .mockImplementation(async (key, value) => ({ key, value })),
      },
    };
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(HookHarness)),
      );
    });

    await waitFor(() => latestContext?.isReady === true);

    await latestContext?.setSans('inter');
    await waitFor(() => latestContext?.sansId === 'inter');
    expect(untaskMock.settings.set).toHaveBeenCalledWith(UI_FONT_SANS_SETTING_KEY, 'inter');
    expect(localStorage.getItem(UI_FONT_SANS_STORAGE_KEY)).toBe('inter');

    await latestContext?.setMono('ibm-plex-mono');
    await waitFor(() => latestContext?.monoId === 'ibm-plex-mono');
    expect(untaskMock.settings.set).toHaveBeenCalledWith(UI_FONT_MONO_SETTING_KEY, 'ibm-plex-mono');
    await waitFor(
      () => localStorage.getItem(UI_FONT_MONO_STORAGE_KEY) === 'ibm-plex-mono',
    );
    expect(localStorage.getItem(UI_FONT_MONO_STORAGE_KEY)).toBe('ibm-plex-mono');
  });

  it('rolls back single-font updates when saving fails', async () => {
    const untaskMock: MockUntask = {
      settings: {
        get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
        set: vi
          .fn<(key: string, value: string) => Promise<{ key: string; value: string }>>()
          .mockImplementation(async (key, value) => {
            if (key === UI_FONT_SANS_SETTING_KEY) {
              throw new Error('save failed');
            }
            return { key, value };
          }),
      },
    };
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(HookHarness)),
      );
    });

    await waitFor(() => latestContext?.isReady === true);
    await expect(latestContext?.setSans('inter')).rejects.toThrow('save failed');

    await waitFor(() => latestContext?.sansId === 'geist');
    expect(localStorage.getItem(UI_FONT_SANS_STORAGE_KEY)).toBe('geist');
  });

  it('re-syncs from DB after partial preset save failure', async () => {
    const db = new Map<string, string | null>([
      [UI_FONT_SANS_SETTING_KEY, 'geist'],
      [UI_FONT_MONO_SETTING_KEY, 'geist-mono'],
    ]);
    let shouldFailMono = true;

    const untaskMock: MockUntask = {
      settings: {
        get: vi.fn<(key: string) => Promise<string | null>>().mockImplementation(
          async (key) => db.get(key) ?? null,
        ),
        set: vi
          .fn<(key: string, value: string) => Promise<{ key: string; value: string }>>()
          .mockImplementation(async (key, value) => {
            if (key === UI_FONT_MONO_SETTING_KEY && shouldFailMono) {
              shouldFailMono = false;
              throw new Error('mono save failed');
            }
            db.set(key, value);
            return { key, value };
          }),
      },
    };
    (window as unknown as { untask?: unknown }).untask = untaskMock;

    flushSync(() => {
      root.render(
        createElement(TypographyProvider, null, createElement(HookHarness)),
      );
    });

    await waitFor(() => latestContext?.isReady === true);

    await expect(latestContext?.applyPreset('warm')).rejects.toThrow(
      'Failed to save one or more typography preset values.',
    );
    await waitFor(
      () => latestContext?.sansId === 'dm-sans' && latestContext?.monoId === 'geist-mono',
    );

    expect(localStorage.getItem(UI_FONT_SANS_STORAGE_KEY)).toBe('dm-sans');
    expect(localStorage.getItem(UI_FONT_MONO_STORAGE_KEY)).toBe('geist-mono');
    expect(document.documentElement.style.getPropertyValue('--ui-font-mono-stack')).toContain(
      'Geist Mono',
    );
  });
});
