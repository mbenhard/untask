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
  getWindowDismissMode,
  initSummonController,
  onEscapeLayerExit,
  requestHideFromRenderer,
  setWindowDismissMode,
  summonWindow,
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
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.windowDismissMode') {
        return null;
      }
      return null;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps window visible on blur in persistent mode', () => {
    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    listeners.blur?.();

    expect(window.hide).not.toHaveBeenCalled();
  });

  it('hides window on blur in quick-hide mode', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.windowDismissMode') {
        return 'quick-hide';
      }
      return null;
    });

    const { window, listeners } = createMockWindow();
    initSummonController(window as never);

    listeners.blur?.();

    expect(window.hide).toHaveBeenCalledTimes(1);
  });

  it('suppresses immediate blur hide right after summon in quick-hide mode', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.windowDismissMode') {
        return 'quick-hide';
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

  it('explicit hide paths still hide in persistent mode', () => {
    const { window } = createMockWindow();
    initSummonController(window as never);

    requestHideFromRenderer();
    onEscapeLayerExit();

    expect(window.hide).toHaveBeenCalledTimes(2);
  });

  it('round-trips dismiss mode through setting helpers', () => {
    let storedMode: string | null = null;

    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'app.windowDismissMode') {
        return storedMode;
      }
      return null;
    });
    mockSetSetting.mockImplementation((key: string, value: string) => {
      if (key === 'app.windowDismissMode') {
        storedMode = value;
      }
      return { key, value } as never;
    });

    expect(getWindowDismissMode()).toBe('persistent');
    expect(setWindowDismissMode('quick-hide')).toBe('quick-hide');
    expect(getWindowDismissMode()).toBe('quick-hide');
  });
});
