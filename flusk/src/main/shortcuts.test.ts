import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock('./services/settingsService', () => ({
  getSetting: vi.fn(() => null),
}));

import { globalShortcut } from 'electron';
import { getSetting } from './services/settingsService';
import { registerGlobalShortcuts, unregisterGlobalShortcuts, DEFAULT_SHORTCUTS } from './shortcuts';

const mockRegister = vi.mocked(globalShortcut.register);
const mockUnregister = vi.mocked(globalShortcut.unregister);
const mockUnregisterAll = vi.mocked(globalShortcut.unregisterAll);
const mockGetSetting = vi.mocked(getSetting);

describe('shortcuts', () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockRegister.mockReturnValue(true);
    mockUnregister.mockReset();
    mockUnregisterAll.mockReset();
    mockGetSetting.mockReset();
    mockGetSetting.mockReturnValue(null);
  });

  it('registers both shortcuts using default accelerators when no settings exist', () => {
    registerGlobalShortcuts({} as BrowserWindow);

    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[0]?.[0]).toBe('CommandOrControl+Shift+Space');
    expect(mockRegister.mock.calls[1]?.[0]).toBe('CommandOrControl+Shift+Q');
  });

  it('uses settings-backed accelerators when stored', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'shortcut.toggleWindow') return 'CommandOrControl+Shift+T';
      if (key === 'shortcut.quickAdd') return 'CommandOrControl+Shift+Q';
      return null;
    });

    registerGlobalShortcuts({} as BrowserWindow);

    expect(mockRegister.mock.calls[0]?.[0]).toBe('CommandOrControl+Shift+T');
    expect(mockRegister.mock.calls[1]?.[0]).toBe('CommandOrControl+Shift+Q');
  });

  it('logs warning when registration fails', () => {
    mockRegister.mockReturnValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registerGlobalShortcuts({} as BrowserWindow);

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('unregisters all shortcuts on teardown', () => {
    unregisterGlobalShortcuts();
    expect(mockUnregisterAll).toHaveBeenCalledTimes(1);
  });

  it('exports default shortcuts map', () => {
    expect(DEFAULT_SHORTCUTS['shortcut.toggleWindow']).toBe('CommandOrControl+Shift+Space');
    expect(DEFAULT_SHORTCUTS['shortcut.quickAdd']).toBe('CommandOrControl+Shift+Q');
  });
});
