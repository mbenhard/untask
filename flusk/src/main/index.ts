import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import {
  compileIdentityContext,
  loadIdentityContracts,
} from './assistant/contextCompiler';
import { initDatabase, closeDatabase } from './db';
import { runMigrations } from './db/migrate';
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
    trafficLightPosition: { x: 12, y: 12 },
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

  const revealWindow = (): void => {
    if (window.isDestroyed()) {
      return;
    }

    if (!window.isVisible()) {
      window.show();
    }
  };

  window.once('ready-to-show', revealWindow);
  window.webContents.once('did-finish-load', revealWindow);

  setTimeout(revealWindow, 1500);

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
  initDatabase();
  runMigrations();
  registerIpcHandlers();

  mainWindow = createMainWindow();
  setupTray(mainWindow);
  registerGlobalShortcuts(mainWindow);
};

const emitIdentityContextDebugSnapshot = async (): Promise<void> => {
  if (process.env.FLUSK_DEBUG_IDENTITY_CONTEXT !== '1') {
    return;
  }

  const contracts = await loadIdentityContracts(process.cwd());
  const snapshot = compileIdentityContext({
    contracts,
    memory: {
      profile: '',
      patterns: '',
      journalEntries: [],
    },
    liveContext: {
      tasks: [],
      inboxCount: 0,
    },
    request: 'debug identity context snapshot',
  });

  // eslint-disable-next-line no-console
  console.info(
    `[identity-context] section order: ${snapshot.sectionOrder.join(' -> ')}`,
  );
};

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  void emitIdentityContextDebugSnapshot();
  bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  unregisterGlobalShortcuts();
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
