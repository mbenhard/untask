import { type BrowserWindow, globalShortcut } from 'electron';

import { toggleWindow, showQuickAdd } from './window/summonController';

const TOGGLE_WINDOW_SHORTCUT = 'CommandOrControl+Shift+Space';
const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+A';

function registerShortcut(
  accelerator: string,
  callback: () => void,
  label: string,
): void {
  globalShortcut.unregister(accelerator);

  const registered = globalShortcut.register(accelerator, callback);

  if (!registered) {
    // eslint-disable-next-line no-console
    console.warn(
      `[shortcuts] failed to register ${label} (${accelerator}) — may conflict with another app`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const registerGlobalShortcuts = (_mainWindow: BrowserWindow): void => {
  registerShortcut(TOGGLE_WINDOW_SHORTCUT, toggleWindow, 'toggle-window');
  registerShortcut(QUICK_ADD_SHORTCUT, showQuickAdd, 'quick-add');
};

export const unregisterGlobalShortcuts = (): void => {
  globalShortcut.unregisterAll();
};
