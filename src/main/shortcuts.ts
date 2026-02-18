import { type BrowserWindow, globalShortcut } from 'electron';

import {
  DEFAULT_SETTINGS,
  SETTING_KEY_SHORTCUT_QUICK_ADD,
  SETTING_KEY_SHORTCUT_TOGGLE_WINDOW,
} from './defaultSettings';
import { getSetting } from './services/settingsService';
import { toggleWindow, showQuickAdd } from './window/summonController';

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  [SETTING_KEY_SHORTCUT_TOGGLE_WINDOW]: DEFAULT_SETTINGS[SETTING_KEY_SHORTCUT_TOGGLE_WINDOW],
  [SETTING_KEY_SHORTCUT_QUICK_ADD]: DEFAULT_SETTINGS[SETTING_KEY_SHORTCUT_QUICK_ADD],
};

function resolveAccelerator(settingKey: string): string {
  const stored = getSetting(settingKey);
  // null/undefined → not yet configured, fall back to default
  // empty string   → user explicitly disabled, skip registration
  if (stored === null || stored === undefined) {
    return DEFAULT_SHORTCUTS[settingKey] ?? '';
  }
  return stored.trim();
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
