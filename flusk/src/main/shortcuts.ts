import { type BrowserWindow, globalShortcut, Menu } from 'electron';

import { getSetting } from './services/settingsService';
import { toggleWindow, showQuickAdd, hideWindow } from './window/summonController';

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'shortcut.toggleWindow': 'CommandOrControl+Shift+Space',
  'shortcut.quickAdd': 'CommandOrControl+Shift+Q',
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

function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Untask',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: hideWindow,
        },
        { role: 'minimize' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const registerGlobalShortcuts = (_mainWindow: BrowserWindow): void => {
  setupApplicationMenu();

  const toggleAccelerator = resolveAccelerator('shortcut.toggleWindow');
  const quickAddAccelerator = resolveAccelerator('shortcut.quickAdd');

  registerShortcut(toggleAccelerator, toggleWindow, 'toggle-window');
  registerShortcut(quickAddAccelerator, showQuickAdd, 'quick-add');
};

export const unregisterGlobalShortcuts = (): void => {
  globalShortcut.unregisterAll();
};
