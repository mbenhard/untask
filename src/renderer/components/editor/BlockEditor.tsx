import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import {
  BlockNoteViewRaw as BlockNoteView,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
  FormattingToolbarController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import '@blocknote/react/style.css';

import { FileContextMenu } from './FileContextMenu';
import { UntaskFormattingToolbar } from './UntaskFormattingToolbar';
import { UntaskSlashMenu } from './UntaskSlashMenu';

import { useTheme } from '../providers/ThemeProvider';
import { resolveInitialEditorContent } from './editorUtils';

export type BlockEditorProps = {
  /** JSON blocks string or legacy markdown */
  content: string;
  onChange: (json: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Wrapper CSS class (e.g. 'untask-task-editor') */
  className?: string;
  editable?: boolean;
  /** Custom slash-menu items. If omitted, BlockNote defaults are used. */
  getSlashMenuItems?: (params: BlockEditorSlashMenuParams) => BlockEditorSlashMenuItem[];
  /** Ref to access the editor instance from parent components. */
  editorRef?: MutableRefObject<BlockNoteEditor | null>;
  /** Called after editor instance is created and exposed. */
  onEditorReady?: (editor: BlockNoteEditor) => void;
};

export type BlockEditorSlashMenuItem = DefaultReactSuggestionItem;

export type BlockEditorSlashMenuParams = {
  editor: BlockNoteEditor;
  defaultItems: BlockEditorSlashMenuItem[];
};

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB

export const BlockEditor = ({
  content,
  onChange,
  onFocus,
  onBlur,
  className,
  editable = true,
  getSlashMenuItems,
  editorRef,
  onEditorReady,
}: BlockEditorProps) => {
  const { resolvedTheme } = useTheme();
  const initialContentResolutionRef = useRef(resolveInitialEditorContent(content));
  const initialLegacyMarkdownRef = useRef(initialContentResolutionRef.current.legacyMarkdown);
  const editor = useCreateBlockNote({
    initialContent: initialContentResolutionRef.current.initialBlocks,
    uploadFile: async (file: File) => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new Error('File exceeds 50MB limit');
      }

      const arrayBuffer = await file.arrayBuffer();
      const url = await window.untask?.attachments.save({
        data: new Uint8Array(arrayBuffer),
        filename: file.name,
      });
      return url ?? '';
    },
  });

  // Expose editor instance to parent via ref
  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
    onEditorReady?.(editor);
    return () => {
      if (editorRef) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef, onEditorReady]);

  const isHydratingRef = useRef(false);
  const hasConvertedLegacyRef = useRef(false);

  // Convert legacy markdown content on mount.
  useEffect(() => {
    if (hasConvertedLegacyRef.current) {
      return;
    }

    hasConvertedLegacyRef.current = true;

    const legacyMarkdown = initialLegacyMarkdownRef.current;
    if (!legacyMarkdown) {
      return;
    }

    // Legacy markdown — convert to blocks then persist as JSON.
    isHydratingRef.current = true;
    const blocks = editor.tryParseMarkdownToBlocks(legacyMarkdown);
    editor.replaceBlocks(editor.document, blocks);
    queueMicrotask(() => {
      isHydratingRef.current = false;
    });
    onChange(JSON.stringify(editor.document));
  }, [editor, onChange]);

  const handleChange = useCallback(() => {
    if (isHydratingRef.current) {
      return;
    }

    const json = JSON.stringify(editor.document);
    onChange(json);
  }, [editor, onChange]);

  const handleSurfaceMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // Let ProseMirror handle clicks on actual block content (text, images, files, etc.)
      if (target.closest('.bn-block-content')) {
        return;
      }

      event.preventDefault();
      editor.focus();
      const lastBlock = editor.document[editor.document.length - 1];
      if (lastBlock) {
        editor.setTextCursorPosition(lastBlock, 'end');
      }
    },
    [editor],
  );

  // Open file attachments with system default app on click
  const handleFileClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const fileRow = target.closest('.bn-file-name-with-icon');
      if (!fileRow) return;

      const blockEl = target.closest('[data-id]');
      if (!blockEl) return;

      const blockId = blockEl.getAttribute('data-id');
      if (!blockId) return;

      const block = editor.getBlock(blockId);
      const url = (block?.props as Record<string, unknown>)?.url;
      if (typeof url !== 'string' || !url.startsWith('untask-file://')) return;

      event.preventDefault();
      event.stopPropagation();
      const id = url.slice('untask-file://'.length);
      window.untask?.attachments.open({ id });
    },
    [editor],
  );

  // Right-click context menu for file attachment blocks
  const [fileMenu, setFileMenu] = useState<{
    x: number;
    y: number;
    blockId: string;
    attachmentId: string;
  } | null>(null);

  const handleFileContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const fileArea =
        target.closest('.bn-file-name-with-icon') ??
        target.closest('.bn-file-block-content-wrapper');
      if (!fileArea) return;

      const blockEl = target.closest('[data-id]');
      if (!blockEl) return;

      const blockId = blockEl.getAttribute('data-id');
      if (!blockId) return;

      const block = editor.getBlock(blockId);
      const url = (block?.props as Record<string, unknown>)?.url;
      if (typeof url !== 'string' || !url.startsWith('untask-file://')) return;

      event.preventDefault();
      event.stopPropagation();
      const id = url.slice('untask-file://'.length);
      setFileMenu({ x: event.clientX, y: event.clientY, blockId, attachmentId: id });
    },
    [editor],
  );

  const customSlashMenuItems = useMemo(() => {
    if (!getSlashMenuItems) {
      return null;
    }

    const defaultItems = getDefaultReactSlashMenuItems(editor);
    return getSlashMenuItems({ editor, defaultItems });
  }, [editor, getSlashMenuItems]);

  const getCustomSlashMenuItems = useCallback(async (query: string) => {
    if (!customSlashMenuItems) {
      return [];
    }

    return filterSuggestionItems(customSlashMenuItems, query);
  }, [customSlashMenuItems]);

  return (
    <div
      className={className}
      onMouseDown={handleSurfaceMouseDown}
      onClick={handleFileClick}
      onContextMenu={handleFileContextMenu}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        onChange={handleChange}
        editable={editable}
        linkToolbar={false}
        slashMenu={false}
        sideMenu={false}
        filePanel={false}
        tableHandles={false}
        emojiPicker={false}
        comments={false}
        formattingToolbar={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={UntaskSlashMenu}
          getItems={customSlashMenuItems ? getCustomSlashMenuItems : undefined}
        />
        <FormattingToolbarController
          formattingToolbar={UntaskFormattingToolbar}
        />
      </BlockNoteView>

      {fileMenu && (
        <FileContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          onOpen={() => {
            window.untask?.attachments.open({ id: fileMenu.attachmentId });
            setFileMenu(null);
          }}
          onReveal={() => {
            window.untask?.attachments.reveal({ id: fileMenu.attachmentId });
            setFileMenu(null);
          }}
          onDelete={() => {
            editor.removeBlocks([fileMenu.blockId]);
            setFileMenu(null);
          }}
          onClose={() => setFileMenu(null)}
        />
      )}
    </div>
  );
};
