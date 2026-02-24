// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlockNoteEditor } from '@blocknote/core';
import { LinkToolbarExtension, TableHandlesExtension } from '@blocknote/core/extensions';

import {
  executeEditorContextAction,
  resolveEditorContextTarget,
  shouldUseNativeContextMenu,
  type EditorContextMenuTarget,
} from './EditorContextMenu';

type EditorMock = {
  getBlock: ReturnType<typeof vi.fn>;
  prosemirrorState: { selection: { empty: boolean } };
  getSelectedText: ReturnType<typeof vi.fn>;
  getSelectedLinkUrl: ReturnType<typeof vi.fn>;
  getExtension: ReturnType<typeof vi.fn>;
  updateBlock: ReturnType<typeof vi.fn>;
  insertBlocks: ReturnType<typeof vi.fn>;
  removeBlocks: ReturnType<typeof vi.fn>;
  setSelection: ReturnType<typeof vi.fn>;
  moveBlocksUp: ReturnType<typeof vi.fn>;
  moveBlocksDown: ReturnType<typeof vi.fn>;
  toggleStyles: ReturnType<typeof vi.fn>;
  getActiveStyles: ReturnType<typeof vi.fn>;
  removeStyles: ReturnType<typeof vi.fn>;
  createLink: ReturnType<typeof vi.fn>;
};

type ExtensionMock = {
  link: {
    getLinkAtElement: ReturnType<typeof vi.fn>;
    deleteLink: ReturnType<typeof vi.fn>;
    editLink: ReturnType<typeof vi.fn>;
  };
  table: {
    store: {
      state: {
        block?: { id: string };
        rowIndex?: number;
        colIndex?: number;
      };
    };
    getCellSelection: ReturnType<typeof vi.fn>;
    addRowOrColumn: ReturnType<typeof vi.fn>;
    removeRowOrColumn: ReturnType<typeof vi.fn>;
  };
};

const createEditor = (): { editor: BlockNoteEditor; mock: EditorMock; extensions: ExtensionMock } => {
  const extensions: ExtensionMock = {
    link: {
      getLinkAtElement: vi.fn(() => undefined),
      deleteLink: vi.fn(),
      editLink: vi.fn(),
    },
    table: {
      store: { state: {} },
      getCellSelection: vi.fn(() => undefined),
      addRowOrColumn: vi.fn(),
      removeRowOrColumn: vi.fn(),
    },
  };

  const mock: EditorMock = {
    getBlock: vi.fn(() => undefined),
    prosemirrorState: { selection: { empty: true } },
    getSelectedText: vi.fn(() => ''),
    getSelectedLinkUrl: vi.fn(() => undefined),
    getExtension: vi.fn((extension) => {
      if (extension === LinkToolbarExtension) {
        return extensions.link;
      }
      if (extension === TableHandlesExtension) {
        return extensions.table;
      }
      return undefined;
    }),
    updateBlock: vi.fn(),
    insertBlocks: vi.fn(() => []),
    removeBlocks: vi.fn(() => []),
    setSelection: vi.fn(),
    moveBlocksUp: vi.fn(),
    moveBlocksDown: vi.fn(),
    toggleStyles: vi.fn(),
    getActiveStyles: vi.fn(() => ({ bold: true, italic: true })),
    removeStyles: vi.fn(),
    createLink: vi.fn(),
  };

  return {
    editor: mock as unknown as BlockNoteEditor,
    mock,
    extensions,
  };
};

describe('resolveEditorContextTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves file target before all others', () => {
    const { editor, mock } = createEditor();
    mock.getBlock.mockReturnValue({
      id: 'block-1',
      type: 'file',
      props: { url: 'untask-file://attachment-1' },
      content: {},
      children: [],
    });

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-id', 'block-1');
    const file = document.createElement('div');
    file.className = 'bn-file-name-with-icon';
    wrapper.appendChild(file);

    const result = resolveEditorContextTarget(editor, file, 'notes_contextual');
    expect(result).toEqual({
      kind: 'file',
      blockId: 'block-1',
      attachmentId: 'attachment-1',
    });
  });

  it('resolves link target before text selection', () => {
    const { editor, mock, extensions } = createEditor();
    mock.prosemirrorState.selection.empty = false;
    mock.getSelectedText.mockReturnValue('selected text');
    extensions.link.getLinkAtElement.mockReturnValue({
      range: { from: 5, to: 8 },
      text: 'Example',
    });

    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    anchor.textContent = 'Example';
    const inline = document.createElement('span');
    inline.className = 'bn-inline-content';
    inline.appendChild(anchor);

    const result = resolveEditorContextTarget(editor, anchor, 'notes_contextual');
    expect(result).toEqual({
      kind: 'link',
      href: 'https://example.com',
      text: 'Example',
      rangeFrom: 5,
    });
  });

  it('resolves text selection target', () => {
    const { editor, mock } = createEditor();
    mock.prosemirrorState.selection.empty = false;
    mock.getSelectedText.mockReturnValue('Hello');
    mock.getSelectedLinkUrl.mockReturnValue('https://example.com');

    const element = document.createElement('div');
    const result = resolveEditorContextTarget(editor, element, 'notes_contextual');
    expect(result).toEqual({
      kind: 'text_selection',
      selectedText: 'Hello',
      selectedLinkUrl: 'https://example.com',
    });
  });

  it('resolves block target when no richer target exists', () => {
    const { editor, mock } = createEditor();
    mock.getBlock.mockReturnValue({
      id: 'block-2',
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
    });

    const block = document.createElement('div');
    block.setAttribute('data-id', 'block-2');
    const result = resolveEditorContextTarget(editor, block, 'notes_contextual');
    expect(result).toEqual({
      kind: 'block',
      blockId: 'block-2',
      blockType: 'paragraph',
    });
  });

  it('resolves table handle target fallback', () => {
    const { editor, extensions } = createEditor();
    extensions.table.store.state.block = { id: 'table-1' };
    extensions.table.store.state.rowIndex = 2;
    extensions.table.store.state.colIndex = 1;

    const handle = document.createElement('div');
    handle.className = 'bn-table-handle';

    const result = resolveEditorContextTarget(editor, handle, 'notes_contextual');
    expect(result).toEqual({
      kind: 'table',
      blockId: 'table-1',
      rowIndex: 2,
      colIndex: 1,
    });
  });

  it('returns only file target in off mode', () => {
    const { editor, mock } = createEditor();
    mock.getBlock.mockReturnValue({
      id: 'block-file',
      type: 'file',
      props: { url: 'untask-file://attachment-x' },
      content: {},
      children: [],
    });
    const fileWrapper = document.createElement('div');
    fileWrapper.setAttribute('data-id', 'block-file');
    const file = document.createElement('div');
    file.className = 'bn-file-name-with-icon';
    fileWrapper.appendChild(file);

    expect(resolveEditorContextTarget(editor, file, 'off')).toEqual({
      kind: 'file',
      blockId: 'block-file',
      attachmentId: 'attachment-x',
    });

    mock.getBlock.mockReturnValue({
      id: 'block-3',
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
    });
    const block = document.createElement('div');
    block.setAttribute('data-id', 'block-3');

    expect(resolveEditorContextTarget(editor, block, 'off')).toBeNull();
  });
});

describe('shouldUseNativeContextMenu', () => {
  it('uses native menu when the fallback modifier is pressed', () => {
    expect(shouldUseNativeContextMenu('shift', { shiftKey: true })).toBe(true);
  });

  it('uses custom menu when fallback modifier is not pressed', () => {
    expect(shouldUseNativeContextMenu('shift', { shiftKey: false })).toBe(false);
  });
});

describe('executeEditorContextAction', () => {
  const blockTarget: EditorContextMenuTarget = {
    kind: 'block',
    blockId: 'block-1',
    blockType: 'paragraph',
  };

  it('executes block actions', async () => {
    const { editor, mock } = createEditor();
    mock.getBlock.mockReturnValue({
      id: 'block-1',
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
    });

    await executeEditorContextAction(editor, blockTarget, { id: 'turn_into', value: 'heading_1' });
    await executeEditorContextAction(editor, blockTarget, { id: 'duplicate_block' });
    await executeEditorContextAction(editor, blockTarget, { id: 'move_block_up' });
    await executeEditorContextAction(editor, blockTarget, { id: 'delete_block' });

    expect(mock.updateBlock).toHaveBeenCalled();
    expect(mock.insertBlocks).toHaveBeenCalled();
    expect(mock.setSelection).toHaveBeenCalledWith('block-1', 'block-1');
    expect(mock.moveBlocksUp).toHaveBeenCalled();
    expect(mock.removeBlocks).toHaveBeenCalledWith(['block-1']);
  });

  it('executes text actions', async () => {
    const { editor, mock } = createEditor();
    const target: EditorContextMenuTarget = {
      kind: 'text_selection',
      selectedText: 'hello',
      selectedLinkUrl: null,
    };

    await executeEditorContextAction(editor, target, { id: 'text_bold' });
    await executeEditorContextAction(editor, target, { id: 'text_clear' });
    await executeEditorContextAction(editor, target, { id: 'text_add_link', url: 'https://example.com' });

    expect(mock.toggleStyles).toHaveBeenCalledWith({ bold: true });
    expect(mock.removeStyles).toHaveBeenCalled();
    expect(mock.createLink).toHaveBeenCalledWith('https://example.com');
  });

  it('executes link actions', async () => {
    const { editor, extensions } = createEditor();
    const target: EditorContextMenuTarget = {
      kind: 'link',
      href: 'https://example.com',
      text: 'Example',
      rangeFrom: 8,
    };

    const openExternal = vi.fn();
    const copyText = vi.fn();

    await executeEditorContextAction(
      editor,
      target,
      { id: 'link_open' },
      { openExternal, copyText },
    );
    await executeEditorContextAction(
      editor,
      target,
      { id: 'link_copy' },
      { openExternal, copyText },
    );
    await executeEditorContextAction(
      editor,
      target,
      { id: 'link_remove' },
      { openExternal, copyText },
    );
    await executeEditorContextAction(
      editor,
      target,
      { id: 'link_edit', url: 'https://edited.com', text: 'Edited' },
      { openExternal, copyText },
    );

    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(copyText).toHaveBeenCalledWith('https://example.com');
    expect(extensions.link.deleteLink).toHaveBeenCalledWith(8);
    expect(extensions.link.editLink).toHaveBeenCalledWith('https://edited.com', 'Edited', 8);
  });

  it('executes file actions', async () => {
    const { editor, mock } = createEditor();
    const target: EditorContextMenuTarget = {
      kind: 'file',
      blockId: 'block-file',
      attachmentId: 'attachment-id',
    };

    const openAttachment = vi.fn();
    const revealAttachment = vi.fn();

    await executeEditorContextAction(
      editor,
      target,
      { id: 'file_open' },
      { openAttachment, revealAttachment },
    );
    await executeEditorContextAction(
      editor,
      target,
      { id: 'file_reveal' },
      { openAttachment, revealAttachment },
    );
    await executeEditorContextAction(
      editor,
      target,
      { id: 'file_delete' },
      { openAttachment, revealAttachment },
    );

    expect(openAttachment).toHaveBeenCalledWith('attachment-id');
    expect(revealAttachment).toHaveBeenCalledWith('attachment-id');
    expect(mock.removeBlocks).toHaveBeenCalledWith(['block-file']);
  });

  it('executes table actions', async () => {
    const { editor, mock, extensions } = createEditor();
    mock.getBlock.mockReturnValue({
      id: 'table-1',
      type: 'table',
      props: {},
      content: {
        rows: [],
        headerRows: 1,
      },
      children: [],
    });

    const target: EditorContextMenuTarget = {
      kind: 'table',
      blockId: 'table-1',
      rowIndex: 1,
      colIndex: 2,
    };

    await executeEditorContextAction(editor, target, { id: 'table_add_row' });
    await executeEditorContextAction(editor, target, { id: 'table_remove_row' });
    await executeEditorContextAction(editor, target, { id: 'table_add_col' });
    await executeEditorContextAction(editor, target, { id: 'table_remove_col' });
    await executeEditorContextAction(editor, target, { id: 'table_toggle_header_row' });
    await executeEditorContextAction(editor, target, { id: 'table_toggle_header_col' });

    expect(extensions.table.addRowOrColumn).toHaveBeenCalledWith(1, { orientation: 'row', side: 'below' });
    expect(extensions.table.removeRowOrColumn).toHaveBeenCalledWith(1, 'row');
    expect(extensions.table.addRowOrColumn).toHaveBeenCalledWith(2, { orientation: 'column', side: 'right' });
    expect(extensions.table.removeRowOrColumn).toHaveBeenCalledWith(2, 'column');
    expect(mock.updateBlock).toHaveBeenCalled();
  });
});
