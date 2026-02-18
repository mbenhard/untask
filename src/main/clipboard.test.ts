import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  clipboard: {
    readText: vi.fn(),
  },
}));

import { clipboard } from 'electron';
import { readClipboardForQuickAdd } from './clipboard';

const mockReadText = vi.mocked(clipboard.readText);

describe('readClipboardForQuickAdd', () => {
  it('returns empty source when clipboard is empty', () => {
    mockReadText.mockReturnValue('');
    expect(readClipboardForQuickAdd()).toEqual({ text: '', source: 'empty' });
  });

  it('returns empty source when clipboard has only whitespace', () => {
    mockReadText.mockReturnValue('   ');
    expect(readClipboardForQuickAdd()).toEqual({ text: '', source: 'empty' });
  });

  it('classifies http URL', () => {
    mockReadText.mockReturnValue('http://example.com');
    expect(readClipboardForQuickAdd()).toEqual({
      text: 'http://example.com',
      source: 'clipboard-url',
    });
  });

  it('classifies https URL', () => {
    mockReadText.mockReturnValue('https://example.com/path?q=1');
    expect(readClipboardForQuickAdd()).toEqual({
      text: 'https://example.com/path?q=1',
      source: 'clipboard-url',
    });
  });

  it('classifies plain text', () => {
    mockReadText.mockReturnValue('Buy groceries');
    expect(readClipboardForQuickAdd()).toEqual({
      text: 'Buy groceries',
      source: 'clipboard-text',
    });
  });

  it('trims whitespace from text', () => {
    mockReadText.mockReturnValue('  some text  ');
    expect(readClipboardForQuickAdd()).toEqual({
      text: 'some text',
      source: 'clipboard-text',
    });
  });

  it('returns empty on clipboard read error', () => {
    mockReadText.mockImplementation(() => {
      throw new Error('clipboard unavailable');
    });
    expect(readClipboardForQuickAdd()).toEqual({ text: '', source: 'empty' });
  });
});
