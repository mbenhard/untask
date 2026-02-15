import { BrowserWindow, globalShortcut } from 'electron';

const TOGGLE_WINDOW_SHORTCUT = 'CommandOrControl+Shift+Space';

export const registerGlobalShortcuts = (mainWindow: BrowserWindow): void => {
  globalShortcut.unregister(TOGGLE_WINDOW_SHORTCUT);

  globalShortcut.register(TOGGLE_WINDOW_SHORTCUT, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      return;
    }

    mainWindow.show();
    mainWindow.focus();
  });
};

export const unregisterGlobalShortcuts = (): void => {
  globalShortcut.unregisterAll();
};
