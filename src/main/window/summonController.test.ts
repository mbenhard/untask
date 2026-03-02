import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/settingsService', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock('../clipboard', () => ({
  readClipboardForQuickAdd: vi.fn(() => ({ text: '', source: 'empty' })),
}));

vi.mock('./bounds', () => ({
  parseBoundsJson: vi.fn(() => null),
  resolveTargetBounds: vi.fn(() => ({
    x: 100,
    y: 100,
    width: 680,
    height: 720,
  })),
  rectangleToBounds: vi.fn((rect: { x: number; y: number; width: number; height: number }) => rect),
}));

import { getSetting, setSetting } from '../services/settingsService';
import {
  initSummonController,
  onEscapeLayerExit,
  requestHideFromRenderer,
  summonWindow,
  beginDockModeTransition,
  endDockModeTransition,
} from './summonController';

type ListenerMap = {
  move?: () => void;
  resize?: () => void;
  blur?: () => void;
};

type MockWindow = {
  on: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  webContents: {
    send: ReturnType<typeof vi.fn>;
  };
};

const mockGetSetting = vi.mocked(getSetting);
const mockSetSetting = vi.mocked(setSetting);

function createMockWindow(): { window: MockWindow; listeners: ListenerMap } {
  const listeners: ListenerMap = {};

  const window: MockWindow = {
    on: vi.fn((event: keyof ListenerMap, listener: () => void) => {
      listeners[event] = listener;
    }),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    setBounds: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 680, height: 720 })),
    webContents: {
      send: vi.fn(),
    },
  };

  return { window, listeners };
}

describe('summonController dismiss mode behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T12:00:00.000Z'));
    mockGetSetting.mockReset();
    mockSetSetting.mockReset();
    // Default: normal dock mode → persistent (keep open)
    mockGetSetting.mockImplementation((_key: string) => null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps window visible on blur in normal dock mode', () => {
    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    listeners.blur?.();

    expect(window.hide).not.toHaveBeenCalled();
  });

  it('keeps window visible on blur in dock-only mode', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.dockMode') {
        return 'dock-only';
      }
      return null;
    });

    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    listeners.blur?.();

    expect(window.hide).not.toHaveBeenCalled();
  });

  it('hides window on blur in menu-bar-only mode', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.dockMode') {
        return 'menu-bar-only';
      }
      return null;
    });

    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    listeners.blur?.();

    expect(window.hide).toHaveBeenCalledTimes(1);
  });

  it('suppresses immediate blur hide right after summon in menu-bar-only mode', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.dockMode') {
        return 'menu-bar-only';
      }
      if (key === 'window.bounds') {
        return null;
      }
      return null;
    });

    const { window, listeners } = createMockWindow();
    window.isVisible.mockReturnValue(false);
    initSummonController(window as never);

    summonWindow();
    listeners.blur?.();

    expect(window.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    window.isVisible.mockReturnValue(true);
    listeners.blur?.();

    expect(window.hide).toHaveBeenCalledTimes(1);
  });

  it('explicit hide paths still hide in normal dock mode', () => {
    const { window } = createMockWindow();
    initSummonController(window as never);

    requestHideFromRenderer();
    onEscapeLayerExit();

    expect(window.hide).toHaveBeenCalledTimes(2);
  });
});

describe('dock mode transition blur suppression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T12:00:00.000Z'));
    mockGetSetting.mockReset();
    mockSetSetting.mockReset();
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.dockMode') return 'menu-bar-only';
      return null;
    });
    // Ensure no stale transition state from prior tests
    endDockModeTransition();
  });

  afterEach(() => {
    endDockModeTransition();
    vi.useRealTimers();
  });

  it('suppresses blur during dock mode transition', () => {
    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    beginDockModeTransition();
    listeners.blur?.();

    expect(window.hide).not.toHaveBeenCalled();
  });

  it('allows blur after endDockModeTransition', () => {
    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    // Advance past any stale blur suppression from prior tests
    vi.advanceTimersByTime(200);

    beginDockModeTransition();
    endDockModeTransition();
    listeners.blur?.();

    expect(window.hide).toHaveBeenCalledTimes(1);
  });

  it('safety timeout clears transition flag after 1s', () => {
    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    beginDockModeTransition();

    // Still suppressed before timeout
    listeners.blur?.();
    expect(window.hide).not.toHaveBeenCalled();

    // Advance past the 1s safety timeout
    vi.advanceTimersByTime(1000);

    listeners.blur?.();
    expect(window.hide).toHaveBeenCalledTimes(1);
  });
});
