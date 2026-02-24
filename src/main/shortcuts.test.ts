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
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock('./services/settingsService', () => ({
  getSetting: vi.fn(() => null),
}));

vi.mock('./window/summonController', () => ({
  toggleWindow: vi.fn(),
  showQuickAdd: vi.fn(),
  hideWindow: vi.fn(),
  summonWindow: vi.fn(),
}));

import { globalShortcut, Menu } from 'electron';
import { getSetting } from './services/settingsService';
import { registerGlobalShortcuts, reRegisterShortcuts, unregisterGlobalShortcuts, DEFAULT_SHORTCUTS } from './shortcuts';

const mockRegister = vi.mocked(globalShortcut.register);
const mockUnregister = vi.mocked(globalShortcut.unregister);
const mockUnregisterAll = vi.mocked(globalShortcut.unregisterAll);
const mockGetSetting = vi.mocked(getSetting);
const mockBuildFromTemplate = vi.mocked(Menu.buildFromTemplate);

describe('shortcuts', () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockRegister.mockReturnValue(true);
    mockUnregister.mockReset();
    mockUnregisterAll.mockReset();
    mockGetSetting.mockReset();
    mockGetSetting.mockReturnValue(null);
    mockBuildFromTemplate.mockReset();
    mockBuildFromTemplate.mockReturnValue({} as Electron.Menu);
  });

  it('registers both shortcuts using default accelerators when no settings exist', () => {
    registerGlobalShortcuts({} as BrowserWindow);

    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[0]?.[0]).toBe('CommandOrControl+Shift+Space');
    expect(mockRegister.mock.calls[1]?.[0]).toBe('CommandOrControl+Shift+A');
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
    expect(DEFAULT_SHORTCUTS['shortcut.quickAdd']).toBe('CommandOrControl+Shift+A');
  });

  it('builds application menu with all expected top-level entries', () => {
    registerGlobalShortcuts({} as BrowserWindow);

    expect(mockBuildFromTemplate).toHaveBeenCalledTimes(1);
    const template = mockBuildFromTemplate.mock.calls[0]?.[0] as Electron.MenuItemConstructorOptions[];
    const labels = template.map((item) => item.label);
    expect(labels).toEqual(['Untask', 'File', 'Edit', 'Window', 'Help']);
  });

  it('reRegisterShortcuts unregisters all then re-registers from settings', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'shortcut.toggleWindow') return 'CommandOrControl+Alt+W';
      return null;
    });

    reRegisterShortcuts();

    expect(mockUnregisterAll).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[0]?.[0]).toBe('CommandOrControl+Alt+W');
    expect(mockRegister.mock.calls[1]?.[0]).toBe('CommandOrControl+Shift+A');
  });
});
