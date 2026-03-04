import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';

import { useAutoSaveBody } from '../../hooks/useAutoSaveBody';
import {
  BlockEditor,
  type BlockEditorSlashMenuItem,
  type BlockEditorSlashMenuParams,
} from '../editor/BlockEditor';

// ─── Slash menu filter ───────────────────────────────────────

const EXCLUDED_ITEMS = new Set(['Image', 'Video', 'Audio', 'File']);

const getTextOnlySlashMenuItems = (
  { defaultItems }: BlockEditorSlashMenuParams,
): BlockEditorSlashMenuItem[] =>
  defaultItems.filter((item) => !EXCLUDED_ITEMS.has(item.title));

// ─── Main Component ──────────────────────────────────────────

export type NoteSectionProps = {
  taskId: string;
  body: string | null;
  /** When true, expand the editor and focus it (e.g. user clicked "+ note"). */
  forceOpen?: boolean;
  /** Called when body content changes (used for metadata indicator updates). */
  onBodyChange?: (hasContent: boolean) => void;
  /** Called when the note is explicitly added (first focus) or emptied (last blur). */
  onOpenStateChange?: (isOpen: boolean) => void;
  /** Called when editor focus state changes (for parent drag suppression etc). */
  onEditModeChange?: (editing: boolean) => void;
  /** Callback for pasted images: receives File objects to create as attachments. */
  onPasteImages?: (files: File[]) => void;
};

export const NoteSection = ({
  taskId,
  body,
  forceOpen = false,
  onBodyChange,
  onOpenStateChange,
  onEditModeChange,
  onPasteImages,
}: NoteSectionProps) => {
  const hasContent = body !== null && body.trim() !== '';
  const [isOpen, setIsOpen] = useState(hasContent);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isBlurCollapseRef = useRef(false);

  // Sync forceOpen from parent
  useEffect(() => {
    if (forceOpen && !isOpen) {
      setIsOpen(true);
      onOpenStateChange?.(true);
      // Focus editor after it mounts
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, [forceOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand when body gets content externally (e.g. from store refresh)
  useEffect(() => {
    if (hasContent && !isOpen) {
      setIsOpen(true);
      onOpenStateChange?.(true);
    }
  }, [hasContent]); // eslint-disable-line react-hooks/exhaustive-deps

  const { handleBodyChange, flushSave } = useAutoSaveBody({
    taskId,
    onContentChange: (json: string) => {
      const isEmpty = isEmptyBody(json);
      onBodyChange?.(!isEmpty);
    },
  });

  // Flush pending save when collapsing
  useEffect(() => {
    if (!isOpen) {
      flushSave();
    }
  }, [isOpen, flushSave]);

  const handleFocus = useCallback(() => {
    onEditModeChange?.(true);
  }, [onEditModeChange]);

  const handleBlur = useCallback(() => {
    onEditModeChange?.(false);

    // Auto-collapse if editor is empty
    if (editorRef.current) {
      const content = JSON.stringify(editorRef.current.document);
      if (isEmptyBody(content)) {
        isBlurCollapseRef.current = true;
        setIsOpen(false);
        onOpenStateChange?.(false);
        onBodyChange?.(false);
      }
    }
  }, [onOpenStateChange, onBodyChange, onEditModeChange]);

  const handleEditorReady = useCallback(
    (editor: BlockNoteEditor) => {
      // Intercept paste events to redirect image pastes to attachments
      if (onPasteImages) {
        const el = editor.domElement;
        if (el) {
          const handler = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            const imageFiles: File[] = [];
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
              }
            }

            if (imageFiles.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              onPasteImages(imageFiles);
            }
          };
          el.addEventListener('paste', handler, true);
          // No cleanup needed — editor DOM element lifecycle matches editor lifecycle
        }
      }
    },
    [onPasteImages],
  );

  if (!isOpen) return null;

  return (
    <div ref={containerRef} className="border-t border-border/30 px-3 py-2">
      <div className="mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          Note
        </span>
      </div>
      <BlockEditor
        content={body ?? ''}
        onChange={handleBodyChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="untask-task-editor"
        preset="task"
        contextMenuMode="off"
        editorRef={editorRef}
        getSlashMenuItems={getTextOnlySlashMenuItems}
        onEditorReady={handleEditorReady}
      />
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────

function isEmptyBody(json: string): boolean {
  try {
    const blocks = JSON.parse(json) as Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    if (blocks.length === 0) return true;
    return blocks.every((block) => {
      if (block.type !== 'paragraph') return false;
      if (!block.content || block.content.length === 0) return true;
      return block.content.every(
        (item) => item.type === 'text' && (!item.text || item.text.trim() === ''),
      );
    });
  } catch {
    return true;
  }
}
