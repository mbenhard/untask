import { BrowserWindow, ipcMain, nativeTheme, screen, app } from 'electron';
import path from 'node:path';

import { IPC_CHANNELS, type QuickAddWindowPayload } from '../../types/ipc';
import { getSetting } from '../services/settingsService';
import { summonWindow, getMainWindow } from './summonController';

const WINDOW_WIDTH = 600;
const COLLAPSED_HEIGHT = 60;
const BLUR_SUPPRESSION_MS = 150;
const ACTIVATION_SUPPRESSION_MS = 1500;
const MAIN_REHIDE_DELAY_MS = 300;

let quickAddWin: BrowserWindow | null = null;
let blurSuppressedUntil = 0;
let activationSuppressedUntil = 0;
let mainWasVisibleBeforeQuickAdd = false;
let mainRehideTimer: ReturnType<typeof setTimeout> | null = null;

function clearMainRehideTimer(): void {
  if (!mainRehideTimer) return;
  clearTimeout(mainRehideTimer);
  mainRehideTimer = null;
}

function hideMainIfVisible(): void {
  const main = getMainWindow();
  if (main && !main.isDestroyed() && main.isVisible()) {
    main.hide();
  }
}

function maybePreventMainResurfaceAfterDismiss(): void {
  if (process.platform !== 'darwin' || mainWasVisibleBeforeQuickAdd) {
    return;
  }

  app.hide();
  hideMainIfVisible();
  mainRehideTimer = setTimeout(() => {
    mainRehideTimer = null;
    hideMainIfVisible();
  }, MAIN_REHIDE_DELAY_MS);
}

function resolveTheme(): 'dark' | 'light' {
  // Theme is stored in localStorage as 'untask-theme' in the renderer,
  // but we can't access it from the main process. Check DB settings first,
  // then fall back to system preference.
  const stored = getSetting('theme');
  if (stored === 'light') return 'light';
  if (stored === 'dark') return 'dark';

  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

export function createQuickAddWindow(): void {
  if (quickAddWin && !quickAddWin.isDestroyed()) return;

  quickAddWin = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: COLLAPSED_HEIGHT,
    type: 'panel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-quickadd.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  quickAddWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Load the quick add renderer
  if (QUICK_ADD_VITE_DEV_SERVER_URL) {
    // Dev server serves all HTML files from root; request the quick-add entry
    void quickAddWin.loadURL(`${QUICK_ADD_VITE_DEV_SERVER_URL}/quick-add.html`);
  } else {
    void quickAddWin.loadFile(
      path.join(__dirname, `../renderer/${QUICK_ADD_VITE_NAME}/quick-add.html`),
    );
  }

  // Blur handler: dismiss on blur (Spotlight-style).
  // With type: 'panel', blur fires naturally when the user clicks outside
  // without macOS trying to activate the main window.
  quickAddWin.on('blur', () => {
    if (Date.now() < blurSuppressedUntil) return;
    hideQuickAdd();
  });

  // Escape key (from renderer) — hide directly.
  // With type: 'panel', no blur() hack is needed because the panel
  // never activated the app in the first place.
  const onHide = () => {
    hideQuickAdd();
  };

  const onResize = (_event: Electron.IpcMainEvent, height: number) => {
    if (quickAddWin && !quickAddWin.isDestroyed()) {
      const bounds = quickAddWin.getBounds();
      quickAddWin.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: WINDOW_WIDTH,
        height: Math.round(height),
      });
    }
  };

  const onNavigateTask = (_event: Electron.IpcMainEvent, taskId: string) => {
    summonWindow();
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send(IPC_CHANNELS.TASK_NAVIGATE, { taskId });
    }
  };

  ipcMain.on(IPC_CHANNELS.QUICK_ADD_HIDE, onHide);
  ipcMain.on(IPC_CHANNELS.QUICK_ADD_RESIZE, onResize);
  ipcMain.on(IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK, onNavigateTask);

  quickAddWin.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.QUICK_ADD_HIDE, onHide);
    ipcMain.removeListener(IPC_CHANNELS.QUICK_ADD_RESIZE, onResize);
    ipcMain.removeListener(IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK, onNavigateTask);
    clearMainRehideTimer();
    mainWasVisibleBeforeQuickAdd = false;
    quickAddWin = null;
  });
}

function suppressBlur(): void {
  blurSuppressedUntil = Date.now() + BLUR_SUPPRESSION_MS;
}

function positionOnActiveDisplay(): void {
  if (!quickAddWin || quickAddWin.isDestroyed()) return;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;

  quickAddWin.setPosition(
    Math.round(x + (width - WINDOW_WIDTH) / 2),
    Math.round(y + height * 0.2),
  );
}

export function showQuickAdd(): void {
  if (!quickAddWin || quickAddWin.isDestroyed()) return;

  // Toggle behavior: if already visible, hide it
  if (quickAddWin.isVisible()) {
    hideQuickAdd();
    return;
  }

  // Safety net: suppress app activation handler in case macOS fires it.
  activationSuppressedUntil = Date.now() + ACTIVATION_SUPPRESSION_MS;
  clearMainRehideTimer();

  suppressBlur();
  positionOnActiveDisplay();

  // Reset height to collapsed
  quickAddWin.setSize(WINDOW_WIDTH, COLLAPSED_HEIGHT);

  const theme = resolveTheme();
  const payload: QuickAddWindowPayload = {
    text: '',
    source: 'empty',
    theme,
  };

  // Keep track of prior visibility so dismissal can avoid resurrecting
  // a previously hidden main window.
  const main = getMainWindow();
  mainWasVisibleBeforeQuickAdd = !!(main && !main.isDestroyed() && main.isVisible());

  // Send payload before showing so the renderer can apply the theme
  // before the first visible frame, preventing a light-mode flash.
  quickAddWin.webContents.send(IPC_CHANNELS.QUICK_ADD_PAYLOAD, payload);

  // showInactive() + focus() is the recommended pattern for panel windows:
  // shows the window and accepts keyboard input without activating the app.
  quickAddWin.showInactive();
  quickAddWin.focus();
}

export function hideQuickAdd(): void {
  if (!quickAddWin || quickAddWin.isDestroyed()) return;

  // Safety net: suppress app activation handler.
  activationSuppressedUntil = Date.now() + ACTIVATION_SUPPRESSION_MS;
  clearMainRehideTimer();

  // Suppress blur to prevent re-entry from the blur event
  // that fires when the focused window is hidden.
  suppressBlur();

  quickAddWin.hide();
  maybePreventMainResurfaceAfterDismiss();
}

export function isActivationSuppressed(): boolean {
  return Date.now() < activationSuppressedUntil;
}

export function getQuickAddWindow(): BrowserWindow | null {
  return quickAddWin;
}
