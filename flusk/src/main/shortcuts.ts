import { type BrowserWindow, globalShortcut } from 'electron';

import { getSetting } from './services/settingsService';
import { toggleWindow, showQuickAdd } from './window/summonController';

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'shortcut.toggleWindow': 'CommandOrControl+Shift+Space',
  'shortcut.quickAdd': 'CommandOrControl+Shift+A',
};

function resolveAccelerator(settingKey: string): string {
  const stored = getSetting(settingKey);
  return stored && stored.trim().length > 0
    ? stored.trim()
    : DEFAULT_SHORTCUTS[settingKey] ?? '';
}

function registerShortcut(
  accelerator: string,
  callback: () => void,
  label: string,
): boolean {
  if (!accelerator) {
    return false;
  }

  globalShortcut.unregister(accelerator);

  const registered = globalShortcut.register(accelerator, callback);

  if (!registered) {
    // eslint-disable-next-line no-console
    console.warn(
      `[shortcuts] failed to register ${label} (${accelerator}) — may conflict with another app`,
    );
  }

  return registered;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const registerGlobalShortcuts = (_mainWindow: BrowserWindow): void => {
  const toggleAccelerator = resolveAccelerator('shortcut.toggleWindow');
  const quickAddAccelerator = resolveAccelerator('shortcut.quickAdd');

  registerShortcut(toggleAccelerator, toggleWindow, 'toggle-window');
  registerShortcut(quickAddAccelerator, showQuickAdd, 'quick-add');
};

export const unregisterGlobalShortcuts = (): void => {
  globalShortcut.unregisterAll();
};
