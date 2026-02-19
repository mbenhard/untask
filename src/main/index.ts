import { app, BrowserWindow, nativeImage, shell } from 'electron';
import { registerAttachmentScheme, registerAttachmentProtocol } from './protocol';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { buildSystemPrompt } from './ai/systemPrompt';
import { startProactiveTurn } from './ai/chat';

import { fireAiReminder } from './assistant/proactiveLoop';
import { initReminderScheduler, stopReminderScheduler } from './services/reminderScheduler';
import { initRemindersSync, stopRemindersSync } from './services/remindersSync';
import { initDatabase, closeDatabase } from './db';
import { runMigrations } from './db/migrate';
import { registerIpcHandlers } from './ipc';
import { IPC_CHANNELS } from '../types/ipc';
import {
  startDailyBackupScheduler,
  stopDailyBackupScheduler,
} from './services/backupService';
import { initChatSearchFts, initNotesSearchFts, initSearchFts } from './services/searchService';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { getSetting, isAiEnabled } from './services/settingsService';
import { SETTING_KEY_APP_LAUNCH_AT_LOGIN } from './defaultSettings';
import { migrateApiKeysToSafeStorage } from './services/keyStorage';
import {
  startUpdateChecker,
  stopUpdateChecker,
  setUpdateChannel,
  checkForUpdates,
} from './services/updateChecker';
import { ensureDefaultTaskStatusConfig, clearStaleTodayFlags } from './services/taskService';
import { migrateLegacyMemoryLayers, migrateIdentityV2 } from './ai/memory';
import { setupTray, destroyTray } from './tray';
import { applyDockMode } from './window/dockMode';
import {
  initSummonController,
  summonWindow,
  hideWindow,
  restoreWindowBounds,
} from './window/summonController';

if (started) {
  app.quit();
}

let isQuitting = false;
app.on('before-quit', () => {
  isQuitting = true;
});

// ─── Single-instance lock ─────────────────────────────────
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

// Must run before app.whenReady() — declares untask-file as a privileged scheme.
registerAttachmentScheme();

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
    minWidth: 580,
    minHeight: 520,
    maxWidth: 800,
    maxHeight: 800,
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
      devTools: !app.isPackaged,
    },
  });

  restoreWindowBounds(window);

  // Open all external links in the default system browser
  // instead of spawning new Electron windows.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent the main window from navigating away to external URLs.
  window.webContents.on('will-navigate', (event, url) => {
    const appOrigins = [
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
      'file://',
    ].filter(Boolean);
    if (!appOrigins.some((origin) => url.startsWith(origin!))) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideWindow();
    }
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
  registerAttachmentProtocol();
  initDatabase();
  runMigrations();
  ensureDefaultTaskStatusConfig();
  clearStaleTodayFlags();
  migrateLegacyMemoryLayers();
  migrateIdentityV2();
  // Migrate any plaintext API keys to encrypted safeStorage.
  // Must run after the DB is initialised and before IPC handlers start.
  migrateApiKeysToSafeStorage();
  initSearchFts();
  initChatSearchFts();
  initNotesSearchFts();
  registerIpcHandlers();

  mainWindow = createMainWindow();
  initSummonController(mainWindow);
  setupTray();
  applyDockMode();
  registerGlobalShortcuts(mainWindow);
};

const emitIdentityContextDebugSnapshot = (): void => {
  if (process.env.UNTASK_DEBUG_IDENTITY_CONTEXT !== '1') {
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
    const stored = getSetting(SETTING_KEY_APP_LAUNCH_AT_LOGIN);
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

  app.setName('Untask');

  // Set About panel so "About Untask" shows correct name/version
  const iconPng = [process.cwd(), app.getAppPath()]
    .map((base) => path.join(base, 'assets/icons/icon.png'))
    .find((p) => existsSync(p));

  app.setAboutPanelOptions({
    applicationName: 'Untask',
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
  setUpdateChannel(IPC_CHANNELS.APP_UPDATE_AVAILABLE);
  startUpdateChecker();
  summonWindow();


  // Initialize reminder scheduler — always runs for native notifications.
  // Wire AI callback only when AI is enabled.
  initReminderScheduler(
    isAiEnabled()
      ? {
        fireAiReminder: (taskContext) =>
          fireAiReminder(taskContext, {
            startProactiveTurn: (input) =>
              startProactiveTurn({
                triggerMessage: input.triggerMessage,
                triggerType: input.triggerType,
                emit: input.emit,
              }),
          }),
      }
      : {},
  );

  // Initialize Reminders sync (if enabled in settings)
  void initRemindersSync();

  const handleAppActivation = (): void => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      initSummonController(mainWindow);
      summonWindow();
    } else {
      summonWindow();
    }
    // Check for updates on activation (throttled to 15m)
    void checkForUpdates(false);
  };

  app.on('activate', handleAppActivation);
  if (process.platform === 'darwin') {
    app.on('did-become-active', handleAppActivation);
  }
});

app.on('will-quit', () => {
  stopRemindersSync();
  stopReminderScheduler();
  stopDailyBackupScheduler();
  stopUpdateChecker();
  unregisterGlobalShortcuts();
  destroyTray();
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
