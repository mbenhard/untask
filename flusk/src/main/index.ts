import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { registerIpcHandlers } from './ipc';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { setupTray } from './tray';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 680,
    height: 720,
    minWidth: 480,
    minHeight: 520,
    maxWidth: 900,
    maxHeight: 900,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return window;
};

const bootstrap = (): void => {
  registerIpcHandlers();

  mainWindow = createMainWindow();
  setupTray(mainWindow);
  registerGlobalShortcuts(mainWindow);
};

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  unregisterGlobalShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
