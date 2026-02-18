import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WINDOW_DISMISS_MODE,
  sanitizeWindowDismissMode,
  windowDismissModeSchema,
} from './dismissMode';

describe('dismissMode', () => {
  it('accepts valid dismiss modes', () => {
    expect(sanitizeWindowDismissMode('persistent')).toBe('persistent');
    expect(sanitizeWindowDismissMode('quick-hide')).toBe('quick-hide');
  });

  it('falls back to persistent for missing or invalid values', () => {
    expect(sanitizeWindowDismissMode(null)).toBe(DEFAULT_WINDOW_DISMISS_MODE);
    expect(sanitizeWindowDismissMode('')).toBe(DEFAULT_WINDOW_DISMISS_MODE);
    expect(sanitizeWindowDismissMode('popup')).toBe(DEFAULT_WINDOW_DISMISS_MODE);
  });

  it('schema rejects invalid setter payloads', () => {
    expect(windowDismissModeSchema.safeParse('quick-hide').success).toBe(true);
    expect(windowDismissModeSchema.safeParse('invalid-mode').success).toBe(false);
    expect(windowDismissModeSchema.safeParse({ mode: 'persistent' }).success).toBe(
      false,
    );
  });
});
