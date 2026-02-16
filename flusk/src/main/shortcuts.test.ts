import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
}));

import { globalShortcut } from 'electron';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';

const mockRegister = vi.mocked(globalShortcut.register);
const mockUnregister = vi.mocked(globalShortcut.unregister);
const mockUnregisterAll = vi.mocked(globalShortcut.unregisterAll);

describe('shortcuts', () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockRegister.mockReturnValue(true);
    mockUnregister.mockReset();
    mockUnregisterAll.mockReset();
  });

  it('registers both shortcuts and clears existing bindings first', () => {
    registerGlobalShortcuts({} as BrowserWindow);

    expect(mockUnregister).toHaveBeenNthCalledWith(
      1,
      'CommandOrControl+Shift+Space',
    );
    expect(mockUnregister).toHaveBeenNthCalledWith(2, 'CommandOrControl+Shift+A');
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[0]?.[0]).toBe('CommandOrControl+Shift+Space');
    expect(mockRegister.mock.calls[1]?.[0]).toBe('CommandOrControl+Shift+A');
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
});
