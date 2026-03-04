import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';

import { useAutoSaveBody } from '../../hooks/useAutoSaveBody';
import {
  BlockEditor,
  type BlockEditorSlashMenuItem,
  type BlockEditorSlashMenuParams,
} from '../editor/BlockEditor';
import { hasNoteContent } from './noteContent';

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
  /** Increment to request opening and focusing the editor (e.g. user clicked "+ note"). */
  focusRequestId?: number;
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
  focusRequestId,
  onBodyChange,
  onOpenStateChange,
  onEditModeChange,
  onPasteImages,
}: NoteSectionProps) => {
  const hasContent = hasNoteContent(body);
  const [isOpen, setIsOpen] = useState(hasContent);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  const lastFocusRequestIdRef = useRef<number | null>(focusRequestId ?? null);
  const pendingFocusRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const flushPendingFocus = useCallback((): boolean => {
    if (!pendingFocusRef.current) {
      return false;
    }

    const editableEl = containerRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (editableEl) {
      pendingFocusRef.current = false;
      editableEl.focus();
      return true;
    }

    if (editorRef.current) {
      pendingFocusRef.current = false;
      editorRef.current.focus();
      return true;
    }

    return false;
  }, []);


  const collapseIfEmpty = useCallback((): boolean => {
    if (!isOpenRef.current || !editorRef.current) {
      return false;
    }

    const content = JSON.stringify(editorRef.current.document);
    if (hasNoteContent(content)) {
      return false;
    }

    isOpenRef.current = false;
    setIsOpen(false);
    onOpenStateChange?.(false);
    onBodyChange?.(false);
    onEditModeChange?.(false);
    return true;
  }, [onBodyChange, onEditModeChange, onOpenStateChange]);

  // Sync focus requests from parent.
  useEffect(() => {
    if (focusRequestId === undefined || focusRequestId === null) {
      return;
    }
    if (focusRequestId === lastFocusRequestIdRef.current) {
      return;
    }

    lastFocusRequestIdRef.current = focusRequestId;
    if (!isOpenRef.current) {
      isOpenRef.current = true;
      setIsOpen(true);
      onOpenStateChange?.(true);
    }
    pendingFocusRef.current = true;
  }, [focusRequestId, onOpenStateChange]);

  useEffect(() => {
    if (!isOpen || !pendingFocusRef.current) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      flushPendingFocus();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isOpen, focusRequestId, flushPendingFocus]);

  // Auto-expand when body gets content externally (e.g. from store refresh)
  useEffect(() => {
    if (hasContent && !isOpenRef.current) {
      isOpenRef.current = true;
      setIsOpen(true);
      onOpenStateChange?.(true);
    }
  }, [hasContent, onOpenStateChange]);

  const { handleBodyChange, flushSave } = useAutoSaveBody({
    taskId,
    onContentChange: (json: string) => {
      const isEmpty = !hasNoteContent(json);
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
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof Node && containerRef.current?.contains(activeElement)) {
        return;
      }
      collapseIfEmpty();
    });
  }, [collapseIfEmpty, onEditModeChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (containerRef.current?.contains(target)) {
        return;
      }
      collapseIfEmpty();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [collapseIfEmpty, isOpen]);

  const handleEditorReady = useCallback(
    (editor: BlockNoteEditor) => {
      // Apply any queued focus request now that the editor is mounted.
      if (pendingFocusRef.current) {
        requestAnimationFrame(() => {
          if (!flushPendingFocus()) {
            editor.focus();
            pendingFocusRef.current = false;
          }
        });
      }

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
    [flushPendingFocus, onPasteImages],
  );

  if (!isOpen) return null;

  return (
    <div ref={containerRef} data-note-section="true" className="border-t border-border/30 px-3 py-2">
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
