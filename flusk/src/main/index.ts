import { app, BrowserWindow, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { buildSystemPrompt } from './ai/systemPrompt';
import { startProactiveTurn } from './ai/chat';

import { initProactiveLoop, stopProactiveLoop } from './assistant/proactiveLoop';
import { initDatabase, closeDatabase } from './db';
import { runMigrations } from './db/migrate';
import { registerIpcHandlers } from './ipc';
import {
  startDailyBackupScheduler,
  stopDailyBackupScheduler,
} from './services/backupService';
import { initChatSearchFts, initSearchFts } from './services/searchService';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { getSetting } from './services/settingsService';
import { ensureDefaultTaskStatusConfig } from './services/taskService';
import { migrateLegacyMemoryLayers, migrateIdentityV2 } from './ai/memory';
import { setupTray, destroyTray } from './tray';
import { initSummonController, summonWindow } from './window/summonController';

if (started) {
  app.quit();
}

// ─── Single-instance lock ─────────────────────────────────
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const canApplyLaunchAtLogin = (): boolean => {
  if (process.platform === 'darwin') {
    // Development Electron binaries on macOS commonly fail login item writes
    // with "Operation not permitted".
    return app.isPackaged;
  }

  return process.platform === 'win32';
};

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 680,
    height: 720,
    minWidth: 680,
    minHeight: 720,
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
  ensureDefaultTaskStatusConfig();
  migrateLegacyMemoryLayers();
  migrateIdentityV2();
  initSearchFts();
  initChatSearchFts();
  registerIpcHandlers();

  mainWindow = createMainWindow();
  initSummonController(mainWindow);
  setupTray();
  registerGlobalShortcuts(mainWindow);
};

const emitIdentityContextDebugSnapshot = (): void => {
  if (process.env.FLUSK_DEBUG_IDENTITY_CONTEXT !== '1') {
    return;
  }

  const result = buildSystemPrompt({
    userMessage: 'debug identity context snapshot',
    liveContext: { tasks: [], inboxCount: 0 },
  });

  // eslint-disable-next-line no-console
  console.info(
    `[identity-context] section order: ${result.contextSnapshot.sectionOrder.join(' -> ')}`,
  );
};



app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    summonWindow();
  }
});

const applyLaunchAtLogin = (): void => {
  try {
    const stored = getSetting('app.launchAtLogin');
    const enabled = stored === 'true';
    if (!canApplyLaunchAtLogin()) {
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch {
    // Login item apply can fail in some environments; keep preference persisted
  }
};

const applyDevBranding = (): void => {
  if (process.platform !== 'darwin' || app.isPackaged) {
    return;
  }

  app.setName('Flusk');

  // Set About panel so "About Flusk" shows correct name/version
  const iconPng = [process.cwd(), app.getAppPath()]
    .map((base) => path.join(base, 'assets/icons/icon.png'))
    .find((p) => existsSync(p));

  app.setAboutPanelOptions({
    applicationName: 'Flusk',
    applicationVersion: app.getVersion(),
  });

  // Override dock icon (the padded PNG has proper macOS margins built in)
  if (iconPng) {
    try {
      const icon = nativeImage.createFromPath(iconPng);
      if (!icon.isEmpty()) {
        app.dock?.setIcon(icon);
      }
    } catch {
      // Patch script handles the bundle icon as fallback
    }
  }
};

app.whenReady().then(() => {
  applyDevBranding();
  void emitIdentityContextDebugSnapshot();
  bootstrap();
  applyLaunchAtLogin();
  startDailyBackupScheduler();


  // Initialize the proactive loop with chat pipeline dependency
  initProactiveLoop({
    startProactiveTurn: async (input) => {
      await startProactiveTurn({
        triggerMessage: input.triggerMessage,
        triggerType: input.triggerType,
        emit: input.emit,
      });
    },
  });

  const handleAppActivation = (): void => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      initSummonController(mainWindow);
      summonWindow();
    } else {
      summonWindow();
    }
  };

  app.on('activate', handleAppActivation);
  if (process.platform === 'darwin') {
    app.on('did-become-active', handleAppActivation);
  }
});

app.on('will-quit', () => {
  stopProactiveLoop();
  stopDailyBackupScheduler();
  unregisterGlobalShortcuts();
  destroyTray();
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
