import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import {
  type DefaultReactSuggestionItem,
  FormattingToolbarController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';

import { FluskFormattingToolbar } from './FluskFormattingToolbar';
import { FluskSlashMenu } from './FluskSlashMenu';

import { useTheme } from '../providers/ThemeProvider';
import { isBlockNoteJson, parseStoredBlocks } from './editorUtils';

export type BlockEditorProps = {
  /** JSON blocks string or legacy markdown */
  content: string;
  onChange: (json: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Wrapper CSS class (e.g. 'flusk-task-editor') */
  className?: string;
  editable?: boolean;
  /** Custom slash-menu items. If omitted, BlockNote defaults are used. */
  getSlashMenuItems?: (editor: BlockNoteEditor) => DefaultReactSuggestionItem[];
  /** Ref to access the editor instance from parent components. */
  editorRef?: MutableRefObject<BlockNoteEditor | null>;
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
}: BlockEditorProps) => {
  const { resolvedTheme } = useTheme();
  const editor = useCreateBlockNote({
    uploadFile: async (file: File) => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new Error('File exceeds 50MB limit');
      }

      const arrayBuffer = await file.arrayBuffer();
      const url = await window.flusk?.attachments.save({
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
    return () => {
      if (editorRef) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  const hasHydratedRef = useRef(false);
  const isHydratingRef = useRef(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Hydrate editor on mount (once)
  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }

    hasHydratedRef.current = true;

    const raw = contentRef.current;
    if (!raw.trim()) {
      return;
    }

    const applyBlocks = (blocks: PartialBlock[]): void => {
      isHydratingRef.current = true;
      editor.replaceBlocks(editor.document, blocks);
      queueMicrotask(() => {
        isHydratingRef.current = false;
      });
    };

    if (isBlockNoteJson(raw)) {
      const blocks = parseStoredBlocks(raw);
      if (blocks) {
        applyBlocks(blocks);
      }
    } else {
      // Legacy markdown — convert to blocks then persist as JSON
      const blocks = editor.tryParseMarkdownToBlocks(raw);
      applyBlocks(blocks);
      const convertedJson = JSON.stringify(editor.document);
      onChange(convertedJson);
    }
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
      const shouldFocus =
        target === event.currentTarget ||
        target.classList.contains('bn-container') ||
        target.classList.contains('bn-editor');

      if (!shouldFocus) {
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

  const hasCustomSlashMenu = getSlashMenuItems !== undefined;

  return (
    <div
      className={className}
      onMouseDown={handleSurfaceMouseDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        onChange={handleChange}
        editable={editable}
        slashMenu={false}
        formattingToolbar={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={FluskSlashMenu}
          getItems={
            hasCustomSlashMenu
              ? async (query) =>
                  filterSuggestionItems(getSlashMenuItems(editor), query)
              : undefined
          }
        />
        <FormattingToolbarController
          formattingToolbar={FluskFormattingToolbar}
        />
      </BlockNoteView>
    </div>
  );
};
