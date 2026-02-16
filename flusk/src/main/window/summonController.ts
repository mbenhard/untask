import type { BrowserWindow } from 'electron';

import { readClipboardForQuickAdd } from '../clipboard';
import { getSetting, setSetting } from '../services/settingsService';
import { IPC_CHANNELS } from '../../types/ipc';

import {
  parseBoundsJson,
  resolveTargetBounds,
  rectangleToBounds,
} from './bounds';
import {
  WINDOW_DISMISS_MODE_KEY,
  type WindowDismissMode,
  sanitizeWindowDismissMode,
} from './dismissMode';

const BOUNDS_KEY = 'window.bounds';
const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = 720;
const BOUNDS_SAVE_DELAY_MS = 500;
const BLUR_SUPPRESSION_MS = 150;

let win: BrowserWindow | null = null;
let hasEverSummoned = false;
let blurSuppressedUntil = 0;
let boundsSaveTimer: ReturnType<typeof setTimeout> | null = null;
let windowDismissMode: WindowDismissMode = sanitizeWindowDismissMode(null);

export function initSummonController(mainWindow: BrowserWindow): void {
  win = mainWindow;
  hasEverSummoned = false;
  windowDismissMode = getWindowDismissMode();

  mainWindow.on('move', scheduleBoundsSave);
  mainWindow.on('resize', scheduleBoundsSave);

  mainWindow.on('blur', () => {
    if (Date.now() < blurSuppressedUntil) {
      return;
    }
    if (getWindowDismissMode() !== 'quick-hide') {
      return;
    }
    if (mainWindow.isVisible() && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });
}

export function toggleWindow(): void {
  if (!win || win.isDestroyed()) return;

  if (win.isVisible()) {
    hideWindow();
  } else {
    summonWindow();
  }
}

export function summonWindow(): void {
  if (!win || win.isDestroyed()) return;

  suppressBlur();

  if (!hasEverSummoned) {
    const stored = parseBoundsJson(getSetting(BOUNDS_KEY));
    const bounds = resolveTargetBounds(stored, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    win.setBounds(bounds);
    hasEverSummoned = true;
  }

  if (!win.isVisible()) {
    win.show();
  }

  win.focus();
}

export function showQuickAdd(): void {
  if (!win || win.isDestroyed()) return;

  const payload = readClipboardForQuickAdd();
  summonWindow();
  win.webContents.send(IPC_CHANNELS.APP_QUICK_ADD_PAYLOAD, payload);
}

export function hideWindow(): void {
  if (!win || win.isDestroyed()) return;
  win.hide();
}

export function requestHideFromRenderer(): void {
  hideWindow();
}

export function onEscapeLayerExit(): void {
  hideWindow();
}

export function getMainWindow(): BrowserWindow | null {
  return win;
}

export function getWindowDismissMode(): WindowDismissMode {
  windowDismissMode = sanitizeWindowDismissMode(
    getSetting(WINDOW_DISMISS_MODE_KEY),
  );
  return windowDismissMode;
}

export function setWindowDismissMode(mode: WindowDismissMode): WindowDismissMode {
  windowDismissMode = mode;
  setSetting(WINDOW_DISMISS_MODE_KEY, mode);
  return windowDismissMode;
}

function suppressBlur(): void {
  blurSuppressedUntil = Date.now() + BLUR_SUPPRESSION_MS;
}

function scheduleBoundsSave(): void {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(saveBounds, BOUNDS_SAVE_DELAY_MS);
}

function saveBounds(): void {
  if (!win || win.isDestroyed()) return;
  const bounds = rectangleToBounds(win.getBounds());
  setSetting(BOUNDS_KEY, JSON.stringify(bounds));
}
