import { describe, expect, it } from 'vitest';

import { resolveInitialEditorContent } from './editorUtils';

describe('resolveInitialEditorContent', () => {
  it('returns empty initialization for blank content', () => {
    expect(resolveInitialEditorContent('   ')).toEqual({
      initialBlocks: undefined,
      legacyMarkdown: null,
    });
  });

  it('parses blocknote json into initial blocks', () => {
    const json = JSON.stringify([{ type: 'paragraph', content: [] }]);

    expect(resolveInitialEditorContent(json)).toEqual({
      initialBlocks: [{ type: 'paragraph', content: [] }],
      legacyMarkdown: null,
    });
  });

  it('treats non-json content as legacy markdown', () => {
    const markdown = '# Heading';

    expect(resolveInitialEditorContent(markdown)).toEqual({
      initialBlocks: undefined,
      legacyMarkdown: markdown,
    });
  });

  it('falls back to legacy markdown for non-blocknote json arrays', () => {
    const notBlockNoteJson = JSON.stringify([{ foo: 'bar' }]);

    expect(resolveInitialEditorContent(notBlockNoteJson)).toEqual({
      initialBlocks: undefined,
      legacyMarkdown: notBlockNoteJson,
    });
  });
});
