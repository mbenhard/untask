import { type BrowserWindow, globalShortcut, Menu, shell } from 'electron';

import { IPC_CHANNELS } from '../types/ipc';
import { getSetting } from './services/settingsService';
import { toggleWindow, showQuickAdd, hideWindow, summonWindow } from './window/summonController';

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'shortcut.toggleWindow': 'CommandOrControl+Shift+Space',
  'shortcut.quickAdd': 'CommandOrControl+Shift+A',
};

const registrationStatus: Map<string, boolean> = new Map();

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
  settingKey: string,
): boolean {
  if (!accelerator) {
    registrationStatus.set(settingKey, false);
    return false;
  }

  globalShortcut.unregister(accelerator);

  const registered = globalShortcut.register(accelerator, callback);
  registrationStatus.set(settingKey, registered);

  if (!registered) {
    // eslint-disable-next-line no-console
    console.warn(
      `[shortcuts] failed to register ${label} (${accelerator}) — may conflict with another app`,
    );
  }

  return registered;
}

function getMainWindow(): BrowserWindow | undefined {
  const { BrowserWindow: BW } = require('electron') as typeof import('electron');
  return BW.getAllWindows()[0];
}

function sendMenuAction(channel: string): void {
  summonWindow();
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel);
  }
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
      label: 'File',
      submenu: [
        {
          label: 'New Task',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction(IPC_CHANNELS.APP_MENU_NEW_TASK),
        },
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction(IPC_CHANNELS.APP_MENU_NEW_NOTE),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
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
    {
      label: 'Help',
      submenu: [
        {
          label: 'Report an Issue',
          click: () => {
            void shell.openExternal('https://github.com/mbenhard/untask/issues');
          },
        },
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

  registerShortcut(toggleAccelerator, toggleWindow, 'toggle-window', 'shortcut.toggleWindow');
  registerShortcut(quickAddAccelerator, showQuickAdd, 'quick-add', 'shortcut.quickAdd');
};

export const reRegisterShortcuts = (): void => {
  globalShortcut.unregisterAll();

  const toggleAccelerator = resolveAccelerator('shortcut.toggleWindow');
  const quickAddAccelerator = resolveAccelerator('shortcut.quickAdd');

  registerShortcut(toggleAccelerator, toggleWindow, 'toggle-window', 'shortcut.toggleWindow');
  registerShortcut(quickAddAccelerator, showQuickAdd, 'quick-add', 'shortcut.quickAdd');
};

export const unregisterGlobalShortcuts = (): void => {
  globalShortcut.unregisterAll();
};

export const getShortcutRegistrationStatus = (settingKey: string): boolean => {
  return registrationStatus.get(settingKey) ?? true;
};
