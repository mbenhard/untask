import { describe, expect, it } from 'vitest';

import {
  deriveAutoTitle,
  getContentPreview,
  getDisplayTitle,
  isDateBasedTitle,
} from './noteUtils';

describe('deriveAutoTitle', () => {
  it('returns empty string for empty content', () => {
    expect(deriveAutoTitle('')).toBe('');
    expect(deriveAutoTitle('   ')).toBe('');
  });

  it('extracts title from first text block in BlockNote JSON', () => {
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    ]);
    expect(deriveAutoTitle(content)).toBe('Hello world');
  });

  it('skips image and file blocks', () => {
    const content = JSON.stringify([
      { type: 'image', props: { url: 'img.png' } },
      { type: 'file', props: { url: 'doc.pdf' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'After media' }] },
    ]);
    expect(deriveAutoTitle(content)).toBe('After media');
  });

  it('truncates at 120 characters with ellipsis', () => {
    const longText = 'A'.repeat(150);
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: longText }] },
    ]);
    const result = deriveAutoTitle(content);
    expect(result).toHaveLength(121); // 120 chars + ellipsis
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('handles legacy markdown content', () => {
    expect(deriveAutoTitle('# My Heading\nSome body')).toBe('My Heading');
    expect(deriveAutoTitle('Plain text line\nSecond line')).toBe('Plain text line');
  });

  it('skips empty text blocks', () => {
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
    ]);
    expect(deriveAutoTitle(content)).toBe('Second');
  });
});

describe('getDisplayTitle', () => {
  it('returns stored title when present', () => {
    expect(getDisplayTitle('My title', 'some content')).toBe('My title');
  });

  it('derives title from content when title is empty', () => {
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Auto title' }] },
    ]);
    expect(getDisplayTitle('', content)).toBe('Auto title');
  });

  it('returns "Empty note" when both title and content are empty', () => {
    expect(getDisplayTitle('', '')).toBe('Empty note');
  });
});

describe('getContentPreview', () => {
  it('returns "Empty note" for empty content', () => {
    expect(getContentPreview('', '')).toBe('Empty note');
  });

  it('skips first text block when auto-title is active', () => {
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Title line' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Preview line' }] },
    ]);
    expect(getContentPreview('', content)).toBe('Preview line');
  });

  it('uses first block as preview when title is manual', () => {
    const content = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'First block' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second block' }] },
    ]);
    expect(getContentPreview('Manual Title', content)).toBe('First block');
  });

  it('returns [Image] for image-only notes with manual title', () => {
    const content = JSON.stringify([
      { type: 'image', props: { url: 'img.png' } },
    ]);
    expect(getContentPreview('My Photo', content)).toBe('[Image]');
  });

  it('returns [File] for file-only notes with manual title', () => {
    const content = JSON.stringify([
      { type: 'file', props: { url: 'doc.pdf' } },
    ]);
    expect(getContentPreview('My Doc', content)).toBe('[File]');
  });

  it('handles legacy markdown with auto-title', () => {
    expect(getContentPreview('', '# Title\nBody line')).toBe('Body line');
  });
});

describe('isDateBasedTitle', () => {
  it('matches auto-generated date titles', () => {
    expect(isDateBasedTitle('Feb 20, 18:49')).toBe(true);
    expect(isDateBasedTitle('Jan 1, 09:05')).toBe(true);
    expect(isDateBasedTitle('Dec 31, 23:59')).toBe(true);
  });

  it('does not match regular titles', () => {
    expect(isDateBasedTitle('My notes')).toBe(false);
    expect(isDateBasedTitle('February 20, 2025')).toBe(false);
    expect(isDateBasedTitle('')).toBe(false);
    expect(isDateBasedTitle('Feb 20, 18:49 extra')).toBe(false);
  });
});
