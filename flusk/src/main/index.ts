import { app, BrowserWindow, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { buildSystemPrompt } from './ai/systemPrompt';
import { startProactiveTurn } from './ai/chat';
import { checkAndGenerateWeeklyDigest } from './ai/weeklyDigest';
import { initProactiveLoop, stopProactiveLoop, getProactiveLoop } from './assistant/proactiveLoop';
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
import { migrateLegacyMemoryLayers } from './ai/memory';
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
  migrateLegacyMemoryLayers();
  initSearchFts();
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

const applyDevDockIcon = (): void => {
  if (process.platform !== 'darwin' || app.isPackaged) {
    return;
  }

  const iconCandidates = [
    path.join(app.getAppPath(), 'assets/icons/icon.icns'),
    path.join(process.cwd(), 'assets/icons/icon.icns'),
    path.resolve(__dirname, '../../assets/icons/icon.icns'),
  ];

  for (const iconPath of iconCandidates) {
    if (!existsSync(iconPath)) {
      continue;
    }

    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        continue;
      }
      app.dock?.setIcon(icon);
      return;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[app] failed to set dev dock icon', iconPath, error);
    }
  }
};

app.whenReady().then(() => {
  applyDevDockIcon();
  void emitIdentityContextDebugSnapshot();
  bootstrap();
  applyLaunchAtLogin();
  startDailyBackupScheduler();
  runWeeklyDigestStartupCheck();

  // Initialize the proactive loop with chat pipeline dependency
  const proactiveLoop = initProactiveLoop({
    startProactiveTurn: async (input) => {
      await startProactiveTurn({
        triggerMessage: input.triggerMessage,
        triggerType: input.triggerType,
        emit: input.emit,
      });
    },
  });

  // Fire morning briefing check on first ready
  void proactiveLoop.onAppOpen();

  const handleAppActivation = (): void => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      initSummonController(mainWindow);
      summonWindow();
    } else {
      summonWindow();
    }

    // Check for morning briefing on each activation
    const loop = getProactiveLoop();
    if (loop) {
      void loop.onAppOpen();
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
