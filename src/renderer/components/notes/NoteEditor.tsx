import { Suspense, lazy, useCallback, useEffect, useRef } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { Archive, ArchiveRestore, ArrowLeft, Sparkles, Trash2 } from 'lucide-react';

import {
  selectActiveNoteId,
  selectActiveNoteUpdatedAt,
  selectIsActiveNoteArchived,
  selectNotesContent,
  selectNotesError,
  selectNotesIsDirty,
  selectNotesIsLoading,
  selectNotesIsProcessing,
  selectNotesIsSaving,
  selectNotesNotice,
  useNotesStore,
} from '../../stores/notesStore';
import { Button } from '../ui/button';
import { EditorBlockSkeleton } from '../ui/loadingShells';
import { Skeleton } from '../ui/skeleton';
import type { BlockEditorSlashMenuItem, BlockEditorSlashMenuParams } from '../editor/BlockEditor';

const LazyBlockEditor = lazy(async () => {
  const module = await import('../editor/BlockEditor');
  return { default: module.BlockEditor };
});

// ─── Helpers ────────────────────────────────────────────────

const formatEditedTime = (iso: string | null): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Edited just now';
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Edited yesterday';
  if (days < 7) return `Edited ${days}d ago`;
  // Fall back to absolute date
  const d = new Date(iso);
  return `Edited ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

// ─── Slash menu items ──────────────────────────────────────

const createProcessItem = (editor: BlockNoteEditor): BlockEditorSlashMenuItem => ({
  title: 'Send note to AI',
  onItemClick: () => {
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    void useNotesStore.getState().processWithAI(markdown);
  },
  aliases: ['process', 'ai'],
  group: 'Untask',
  icon: <Sparkles size={18} />,
  subtext: 'Start a new AI chat with this note attached',
});

const getSlashMenuItems = ({
  editor,
  defaultItems,
}: BlockEditorSlashMenuParams): BlockEditorSlashMenuItem[] => [
  ...defaultItems
    .filter((item) => {
      const titleIsEmoji = item.title.trim().toLowerCase() === 'emoji';
      const aliasIsEmoji = (item.aliases ?? []).some((alias) => alias.toLowerCase() === 'emoji');
      return !(titleIsEmoji || aliasIsEmoji);
    })
    .map((item) =>
      item.title === 'Check List'
        ? { ...item, aliases: [...(item.aliases ?? []), 'todo'] }
        : item,
    ),
  createProcessItem(editor),
];

type NoteEditorProps = {
  showBackButton?: boolean;
};

type DevLatencyApi = {
  start: (flow: string, key: string | number) => void;
  end: (flow: string, key: string | number) => number | null;
  cancel: (flow: string, key: string | number) => void;
};

const NOOP_DEV_LATENCY: DevLatencyApi = {
  start: () => undefined,
  end: () => null,
  cancel: () => undefined,
};

// ─── Component ─────────────────────────────────────────────

export const NoteEditor = ({ showBackButton = true }: NoteEditorProps) => {
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const updatedAt = useNotesStore(selectActiveNoteUpdatedAt);
  const content = useNotesStore(selectNotesContent);
  const isDirty = useNotesStore(selectNotesIsDirty);
  const isLoading = useNotesStore(selectNotesIsLoading);
  const isSaving = useNotesStore(selectNotesIsSaving);
  const isProcessing = useNotesStore(selectNotesIsProcessing);
  const error = useNotesStore(selectNotesError);
  const notice = useNotesStore(selectNotesNotice);
  const isArchived = useNotesStore(selectIsActiveNoteArchived);
  const setContent = useNotesStore((s) => s.setContent);
  const backToList = useNotesStore((s) => s.backToList);
  const archiveNote = useNotesStore((s) => s.archiveNote);
  const restoreNote = useNotesStore((s) => s.restoreNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const processWithAI = useNotesStore((s) => s.processWithAI);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const devLatencyRef = useRef<DevLatencyApi>(NOOP_DEV_LATENCY);
  const openMetricKeyRef = useRef<string | null>(null);
  const hasRecordedOpenLatencyRef = useRef(false);
  const shouldAutoFocusRef = useRef(false);
  const lastAutoFocusedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      let disposed = false;
      void import('../../lib/devLatencyMetrics').then(({ devLatencyMetrics }) => {
        if (!disposed) {
          devLatencyRef.current = devLatencyMetrics;
        }
      });
      return () => {
        disposed = true;
        devLatencyRef.current = NOOP_DEV_LATENCY;
      };
    }
    return undefined;
  }, []);

  // 2s debounced auto-save
  const handleChange = useCallback(
    (json: string) => {
      const metricKey = openMetricKeyRef.current;
      if (!hasRecordedOpenLatencyRef.current && metricKey) {
        hasRecordedOpenLatencyRef.current = true;
        devLatencyRef.current.end('note-editor-open', metricKey);
      }
      setContent(json);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void useNotesStore.getState().save();
      }, 2000);
    },
    [setContent],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const state = useNotesStore.getState();
      if (state.isDirty) void state.save();
    };
  }, []);

  const handleBack = useCallback(() => {
    void backToList();
  }, [backToList]);

  const handleArchive = useCallback(() => {
    if (!activeNoteId) return;
    void archiveNote(activeNoteId);
  }, [activeNoteId, archiveNote]);

  const handleRestore = useCallback(() => {
    if (!activeNoteId) return;
    void restoreNote(activeNoteId);
  }, [activeNoteId, restoreNote]);

  const handleDelete = useCallback(() => {
    if (!activeNoteId) return;
    void deleteNote(activeNoteId);
  }, [activeNoteId, deleteNote]);

  const handleProcess = useCallback(() => {
    void processWithAI();
  }, [processWithAI]);

  const isEditorSurfaceFocused = useCallback((): boolean => {
    const host = editorHostRef.current;
    if (!host) return false;
    const activeEl = document.activeElement;
    return activeEl instanceof HTMLElement && host.contains(activeEl);
  }, []);

  const focusEditorSurface = useCallback((): boolean => {
    editorRef.current?.focus();
    const host = editorHostRef.current;
    const editable = host?.querySelector<HTMLElement>(
      '.bn-editor [contenteditable="true"], .ProseMirror[contenteditable="true"]',
    );
    editable?.focus();
    return isEditorSurfaceFocused();
  }, [isEditorSurfaceFocused]);

  const attemptAutoFocus = useCallback(() => {
    if (!activeNoteId || !shouldAutoFocusRef.current || lastAutoFocusedNoteIdRef.current === activeNoteId) {
      return;
    }

    const focused = focusEditorSurface();
    if (focused) {
      shouldAutoFocusRef.current = false;
      lastAutoFocusedNoteIdRef.current = activeNoteId;
    }
  }, [activeNoteId, focusEditorSurface]);

  const handleEditorReady = useCallback(() => {
    attemptAutoFocus();
  }, [attemptAutoFocus]);

  useEffect(() => {
    if (!activeNoteId || !shouldAutoFocusRef.current || lastAutoFocusedNoteIdRef.current === activeNoteId) {
      return;
    }

    let attempts = 0;
    let frameId: number | null = null;
    const maxAttempts = 10;

    const tick = () => {
      if (!shouldAutoFocusRef.current || lastAutoFocusedNoteIdRef.current === activeNoteId) {
        return;
      }

      attempts += 1;
      const focused = focusEditorSurface();
      if (focused) {
        shouldAutoFocusRef.current = false;
        lastAutoFocusedNoteIdRef.current = activeNoteId;
        return;
      }

      if (attempts < maxAttempts) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [activeNoteId, focusEditorSurface]);

  // Auto-focus editor when note opens
  useEffect(() => {
    if (!isLoading && activeNoteId) {
      if (lastAutoFocusedNoteIdRef.current !== activeNoteId) {
        shouldAutoFocusRef.current = true;
      }
      // Small delay to let BlockNote finish hydration
      const timer = setTimeout(() => {
        attemptAutoFocus();
      }, 50);
      return () => clearTimeout(timer);
    }
    shouldAutoFocusRef.current = false;
    if (!activeNoteId) {
      lastAutoFocusedNoteIdRef.current = null;
    }
    return undefined;
  }, [activeNoteId, attemptAutoFocus, isLoading]);

  // Dev-only latency probe: note opened -> first content change.
  useEffect(() => {
    if (!activeNoteId || isLoading) {
      if (!hasRecordedOpenLatencyRef.current && openMetricKeyRef.current) {
        devLatencyRef.current.cancel('note-editor-open', openMetricKeyRef.current);
      }
      openMetricKeyRef.current = null;
      hasRecordedOpenLatencyRef.current = false;
      return;
    }

    const key = String(activeNoteId);
    openMetricKeyRef.current = key;
    hasRecordedOpenLatencyRef.current = false;
    devLatencyRef.current.start('note-editor-open', key);

    return () => {
      if (!hasRecordedOpenLatencyRef.current) {
        devLatencyRef.current.cancel('note-editor-open', key);
      }
      if (openMetricKeyRef.current === key) {
        openMetricKeyRef.current = null;
      }
    };
  }, [activeNoteId, isLoading]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden" aria-busy="true" data-testid="note-editor-skeleton">
        <header className="flex items-center gap-2 px-3 py-2">
          {showBackButton ? <Skeleton className="h-6 w-6 rounded-sm" /> : null}
          <Skeleton className="h-3 w-28" />
          <div className="min-w-0 flex-1" />
          <Skeleton className="h-3 w-20" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-6 w-14 rounded-sm" />
            <Skeleton className="h-6 w-14 rounded-sm" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <EditorBlockSkeleton className="h-full" />
        </div>
      </div>
    );
  }

  const noticeClassName =
    notice?.kind === 'success'
      ? 'text-emerald-400'
      : notice?.kind === 'error'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 px-3 py-2">
        {showBackButton ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleBack}
            aria-label="Back to notes list"
          >
            <ArrowLeft size={14} />
          </Button>
        ) : null}

        {updatedAt ? (
          <span className="text-[10px] text-muted-foreground/70">
            {formatEditedTime(updatedAt)}
          </span>
        ) : null}

        <div className="min-w-0 flex-1" />

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {notice ? (
            <span className={`truncate text-[11px] ${noticeClassName}`}>{notice.message}</span>
          ) : error ? (
            <span className="truncate text-[11px] text-destructive">{error}</span>
          ) : (
            <span className="text-[10px] tracking-[0.01em] text-muted-foreground">
              {isDirty ? 'unsaved' : isSaving ? 'saving' : ''}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleProcess}
            disabled={isProcessing}
            title="Send note to AI (⌘↵)"
          >
            <Sparkles size={12} />
            {isProcessing ? 'sending' : 'send to ai'}
          </Button>

          {isArchived ? (
            <>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleRestore}
              >
                <ArchiveRestore size={12} />
                restore
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 size={12} />
                delete
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={handleArchive}
              title="Archive (⌘⌫)"
            >
              <Archive size={12} />
              archive
            </Button>
          )}
        </div>
      </header>

      <div ref={editorHostRef} className="min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={<EditorBlockSkeleton className="h-full px-3 py-2" />}
        >
          <LazyBlockEditor
            key={activeNoteId}
            content={content}
            onChange={handleChange}
            className="untask-notes-editor"
            preset="notes"
            contextMenuMode="notes_contextual"
            getSlashMenuItems={getSlashMenuItems}
            editorRef={editorRef}
            onEditorReady={handleEditorReady}
          />
        </Suspense>
      </div>
    </div>
  );
};
