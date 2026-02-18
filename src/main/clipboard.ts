import { clipboard } from 'electron';

import type { QuickAddPayload } from '../types/ipc';

const URL_PATTERN = /^https?:\/\//i;

export function readClipboardForQuickAdd(): QuickAddPayload {
  try {
    const text = clipboard.readText().trim();

    if (!text) {
      return { text: '', source: 'empty' };
    }

    if (URL_PATTERN.test(text)) {
      return { text, source: 'clipboard-url' };
    }

    return { text, source: 'clipboard-text' };
  } catch {
    return { text: '', source: 'empty' };
  }
}
