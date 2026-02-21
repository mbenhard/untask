import { BrowserWindow, ipcMain, nativeTheme, screen, app } from 'electron';
import path from 'node:path';

import { IPC_CHANNELS, type QuickAddWindowPayload } from '../../types/ipc';
import { getSetting } from '../services/settingsService';
import { summonWindow, getMainWindow } from './summonController';

const WINDOW_WIDTH = 600;
const COLLAPSED_HEIGHT = 60;
const BLUR_SUPPRESSION_MS = 150;

let quickAddWin: BrowserWindow | null = null;
let blurSuppressedUntil = 0;
let activationSuppressedUntil = 0;
let mainWasVisibleBeforeQuickAdd = false;
let mainRecheckTimer: ReturnType<typeof setTimeout> | null = null;

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

  // Blur handler: dismiss on blur (Spotlight-style)
  quickAddWin.on('blur', () => {
    if (Date.now() < blurSuppressedUntil) return;
    hideQuickAdd();
  });

  // Register IPC handlers for quick-add-specific channels.
  // Blur the window instead of hiding directly — this makes the Escape
  // path identical to click-outside: the app loses focus first, then the
  // blur handler calls hideQuickAdd(). Without this, hiding a focused
  // window causes macOS to restore the hidden main window.
  ipcMain.on(IPC_CHANNELS.QUICK_ADD_HIDE, () => {
    // Suppress activation BEFORE blurring so macOS can't activate the main
    // window in the gap between blur() and the blur event firing hideQuickAdd().
    activationSuppressedUntil = Date.now() + 500;
    if (quickAddWin && !quickAddWin.isDestroyed() && quickAddWin.isFocused()) {
      quickAddWin.blur();
    } else {
      hideQuickAdd();
    }
  });

  ipcMain.on(IPC_CHANNELS.QUICK_ADD_RESIZE, (_event, height: number) => {
    if (quickAddWin && !quickAddWin.isDestroyed()) {
      const bounds = quickAddWin.getBounds();
      quickAddWin.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: WINDOW_WIDTH,
        height: Math.round(height),
      });
    }
  });

  ipcMain.on(IPC_CHANNELS.QUICK_ADD_NAVIGATE_TASK, (_event, taskId: string) => {
    summonWindow();
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send(IPC_CHANNELS.TASK_NAVIGATE, { taskId });
    }
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

  // Suppress app activation handler so the main window doesn't also appear.
  // On macOS, showing any BrowserWindow fires `did-become-active` on the app.
  activationSuppressedUntil = Date.now() + 500;

  suppressBlur();
  positionOnActiveDisplay();

  // Reset height to collapsed
  quickAddWin.setSize(WINDOW_WIDTH, COLLAPSED_HEIGHT);

  // Build and send payload (clipboard auto-paste disabled)
  const theme = resolveTheme();
  const payload: QuickAddWindowPayload = {
    text: '',
    source: 'empty',
    theme,
  };

  // Record main window state so we can restore it on dismiss.
  // macOS may restore the main window when the app activates for the quick add.
  const main = getMainWindow();
  mainWasVisibleBeforeQuickAdd = !!(main && !main.isDestroyed() && main.isVisible());

  // Send payload before showing so the renderer can apply the theme
  // before the first visible frame, preventing a light-mode flash.
  quickAddWin.webContents.send(IPC_CHANNELS.QUICK_ADD_PAYLOAD, payload);
  quickAddWin.show();
  quickAddWin.focus();

  // If macOS restored the main window during app activation, re-hide it.
  if (!mainWasVisibleBeforeQuickAdd && main && !main.isDestroyed() && main.isVisible()) {
    main.hide();
  }

  // Async re-check: macOS may restore the main window after the synchronous
  // check above due to delayed app activation. Re-hide if it reappears.
  if (!mainWasVisibleBeforeQuickAdd) {
    if (mainRecheckTimer) clearTimeout(mainRecheckTimer);
    mainRecheckTimer = setTimeout(() => {
      mainRecheckTimer = null;
      const m = getMainWindow();
      if (m && !m.isDestroyed() && m.isVisible()) {
        m.hide();
      }
    }, 150);
  }
}

export function hideQuickAdd(): void {
  if (!quickAddWin || quickAddWin.isDestroyed()) return;
  activationSuppressedUntil = Date.now() + 500;

  // Clear the async re-check timer if still pending (from 3c).
  if (mainRecheckTimer) {
    clearTimeout(mainRecheckTimer);
    mainRecheckTimer = null;
  }

  quickAddWin.hide();

  // Deactivate the app so macOS returns focus to the previous app.
  if (process.platform === 'darwin' && !mainWasVisibleBeforeQuickAdd) {
    app.hide();

    // macOS may have activated the main window between hide() and app.hide().
    // Re-hide if it appeared unexpectedly.
    const main = getMainWindow();
    if (main && !main.isDestroyed() && main.isVisible()) {
      main.hide();
    }
  }
}

export function isActivationSuppressed(): boolean {
  return Date.now() < activationSuppressedUntil;
}

export function getQuickAddWindow(): BrowserWindow | null {
  return quickAddWin;
}
