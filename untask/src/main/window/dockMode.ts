import { app } from 'electron';
import { z } from 'zod';

import { getSetting } from '../services/settingsService';
import { setupTray, destroyTray, getTray } from '../tray';

export const DOCK_MODE_KEY = 'app.dockMode';
export const DOCK_MODE_VALUES = ['normal', 'dock-only', 'menu-bar-only'] as const;
export type DockMode = (typeof DOCK_MODE_VALUES)[number];

export const DEFAULT_DOCK_MODE: DockMode = 'normal';

export const dockModeSchema = z.enum(DOCK_MODE_VALUES);

export function sanitizeDockMode(value: string | null): DockMode {
  const parsed = dockModeSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return DEFAULT_DOCK_MODE;
}

export function readDockMode(): DockMode {
  return sanitizeDockMode(getSetting(DOCK_MODE_KEY));
}

export function applyDockMode(mode?: DockMode): void {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }

  const resolved = mode ?? readDockMode();

  switch (resolved) {
    case 'normal':
      void app.dock.show();
      if (!getTray()) {
        setupTray();
      }
      break;
    case 'dock-only':
      void app.dock.show();
      destroyTray();
      break;
    case 'menu-bar-only':
      app.dock.hide();
      if (!getTray()) {
        setupTray();
      }
      break;
  }
}
