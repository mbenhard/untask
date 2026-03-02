import { BrowserWindow } from 'electron';
import { z } from 'zod';

import { getSetting } from '../services/settingsService';

export const UI_SCALE_KEY = 'ui.scale';
export const UI_SCALE_VALUES = ['compact', 'default', 'comfortable', 'large'] as const;
export type UiScale = (typeof UI_SCALE_VALUES)[number];

export const DEFAULT_UI_SCALE: UiScale = 'default';

export const uiScaleSchema = z.enum(UI_SCALE_VALUES);

const ZOOM_FACTORS: Record<UiScale, number> = {
  compact: 0.9,
  default: 1.0,
  comfortable: 1.1,
  large: 1.2,
};

export function sanitizeUiScale(value: string | null): UiScale {
  const parsed = uiScaleSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return DEFAULT_UI_SCALE;
}

export function readUiScale(): UiScale {
  return sanitizeUiScale(getSetting(UI_SCALE_KEY));
}

/** Apply the zoom factor to all open BrowserWindow instances. */
export function applyUiScale(scale?: UiScale): void {
  const resolved = scale ?? readUiScale();
  const factor = ZOOM_FACTORS[resolved];

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.setZoomFactor(factor);
    }
  }
}

/** Apply zoom factor to a single window (used at window creation time). */
export function applyUiScaleToWindow(win: BrowserWindow): void {
  const scale = readUiScale();
  const factor = ZOOM_FACTORS[scale];
  win.webContents.setZoomFactor(factor);
}
