import { describe, expect, it } from 'vitest';

import { hasNoteContent } from './noteContent';

describe('hasNoteContent', () => {
  it('returns false for null/empty documents', () => {
    expect(hasNoteContent(null)).toBe(false);
    expect(hasNoteContent('')).toBe(false);
    expect(hasNoteContent('[]')).toBe(false);
  });

  it('returns true for paragraph text', () => {
    const body = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    ]);
    expect(hasNoteContent(body)).toBe(true);
  });

  it('returns true for nested list/checklist text', () => {
    const body = JSON.stringify([
      {
        type: 'bulletListItem',
        children: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'nested item' }],
          },
        ],
      },
    ]);
    expect(hasNoteContent(body)).toBe(true);
  });
});
