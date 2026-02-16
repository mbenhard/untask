import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import {
  compileIdentityContext,
  loadIdentityContracts,
} from './assistant/contextCompiler';
import { checkAndGenerateWeeklyDigest } from './ai/weeklyDigest';
import { initDatabase, closeDatabase } from './db';
import { runMigrations } from './db/migrate';
import { registerIpcHandlers } from './ipc';
import {
  startDailyBackupScheduler,
  stopDailyBackupScheduler,
} from './services/backupService';
import { initSearchFts } from './services/searchService';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { getSetting } from './services/settingsService';
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
  initSearchFts();
  registerIpcHandlers();

  mainWindow = createMainWindow();
  initSummonController(mainWindow);
  setupTray();
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
      soul: '',
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

const runWeeklyDigestStartupCheck = (): void => {
  setTimeout(() => {
    try {
      const result = checkAndGenerateWeeklyDigest();
      if (result.status === 'generated') {
        // eslint-disable-next-line no-console
        console.info('[weekly-digest] generated startup digest entry');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[weekly-digest] startup check failed', error);
    }
  }, 0);
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

app.whenReady().then(() => {
  void emitIdentityContextDebugSnapshot();
  bootstrap();
  applyLaunchAtLogin();
  startDailyBackupScheduler();
  runWeeklyDigestStartupCheck();

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
