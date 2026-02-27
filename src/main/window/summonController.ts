import type { BrowserWindow } from 'electron';

import { getSetting, setSetting } from '../services/settingsService';
import { triggerRemindersPull } from '../services/remindersSync';
import { showQuickAdd as showQuickAddWindow } from './quickAddWindow';

import {
  parseBoundsJson,
  resolveTargetBounds,
  rectangleToBounds,
} from './bounds';
import {
  DOCK_MODE_KEY,
  sanitizeDockMode,
} from './dockMode';

const BOUNDS_KEY = 'window.bounds';
const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = 720;
const BOUNDS_SAVE_DELAY_MS = 500;
const BLUR_SUPPRESSION_MS = 150;
const PULL_ON_FOCUS_MIN_INTERVAL_MS = 30_000; // Don't pull more than once every 30s on focus

let win: BrowserWindow | null = null;
let blurSuppressedUntil = 0;
let boundsSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastPullOnFocusAt = 0;

function shouldQuickHide(): boolean {
  const dockMode = sanitizeDockMode(getSetting(DOCK_MODE_KEY));
  return dockMode === 'menu-bar-only';
}

export function restoreWindowBounds(window: BrowserWindow): void {
  const stored = parseBoundsJson(getSetting(BOUNDS_KEY));
  const bounds = resolveTargetBounds(stored, DEFAULT_WIDTH, DEFAULT_HEIGHT);
  window.setBounds(bounds);
}

export function initSummonController(mainWindow: BrowserWindow): void {
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  win = mainWindow;

  mainWindow.on('move', scheduleBoundsSave);
  mainWindow.on('resize', scheduleBoundsSave);

  mainWindow.on('blur', () => {
    if (Date.now() < blurSuppressedUntil) {
      return;
    }
    if (!shouldQuickHide()) {
      return;
    }
    if (mainWindow.isVisible() && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('focus', () => {
    const now = Date.now();
    if (now - lastPullOnFocusAt >= PULL_ON_FOCUS_MIN_INTERVAL_MS) {
      lastPullOnFocusAt = now;
      triggerRemindersPull();
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

  if (!win.isVisible()) {
    win.show();
  }

  win.focus();
}

export function showQuickAdd(): void {
  showQuickAddWindow();
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
