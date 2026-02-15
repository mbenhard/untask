import type { BrowserWindow } from 'electron';

let trackedWindow: BrowserWindow | null = null;

export const setupTray = (mainWindow: BrowserWindow): void => {
  // The real tray module lands in a later task. Keep a window reference so
  // keyboard shortcuts and follow-up tray work can share the same state.
  trackedWindow = mainWindow;
};

export const getTrackedWindow = (): BrowserWindow | null => trackedWindow;
