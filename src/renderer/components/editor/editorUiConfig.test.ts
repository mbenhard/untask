import { describe, expect, it } from 'vitest';

import { resolveEditorUiConfig } from './editorUiConfig';

describe('resolveEditorUiConfig', () => {
  it('enables core notion-like controls for notes preset', () => {
    expect(resolveEditorUiConfig('notes', 'notion_like')).toEqual({
      linkToolbar: true,
      slashMenu: false,
      sideMenu: true,
      filePanel: true,
      tableHandles: true,
      emojiPicker: false,
      comments: false,
      formattingToolbar: false,
    });
  });

  it('keeps compact controls for task preset', () => {
    expect(resolveEditorUiConfig('task', 'notion_like')).toEqual({
      linkToolbar: false,
      slashMenu: false,
      sideMenu: false,
      filePanel: false,
      tableHandles: false,
      emojiPicker: false,
      comments: false,
      formattingToolbar: false,
    });
  });
});
