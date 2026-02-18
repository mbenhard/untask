import { z } from 'zod';

export const WINDOW_DISMISS_MODE_KEY = 'app.windowDismissMode';
export const WINDOW_DISMISS_MODE_VALUES = [
  'persistent',
  'quick-hide',
] as const;
export type WindowDismissMode = (typeof WINDOW_DISMISS_MODE_VALUES)[number];

export const DEFAULT_WINDOW_DISMISS_MODE: WindowDismissMode = 'persistent';

export const windowDismissModeSchema = z.enum(WINDOW_DISMISS_MODE_VALUES);

export function sanitizeWindowDismissMode(
  value: string | null,
): WindowDismissMode {
  const parsed = windowDismissModeSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return DEFAULT_WINDOW_DISMISS_MODE;
}
