import { Suspense, lazy, useCallback, useEffect, useRef } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare, Sparkles, Trash2 } from 'lucide-react';

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
import { useTaskStore } from '../../stores/taskStore';
import { resolveTaskTitleFromEditor } from './noteSlashActions';
import { Button } from '../ui/button';
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

const createTaskFromCursor = async (editor: BlockNoteEditor): Promise<void> => {
  const title = resolveTaskTitleFromEditor(editor);
  if (!title) {
    useNotesStore
      .getState()
      .setNotice({ kind: 'error', message: 'Could not create task. Add text first.' });
    return;
  }

  const created = await useTaskStore.getState().createTask({ title, status: 'inbox' });
  if (created) {
    useNotesStore
      .getState()
      .setNotice({ kind: 'success', message: 'Task added to Inbox.' });
    return;
  }

  const taskError = useTaskStore.getState().error;
  useNotesStore.getState().setNotice({
    kind: 'error',
    message: taskError ?? 'Task creation failed.',
  });
};

const createProcessItem = (editor: BlockNoteEditor): BlockEditorSlashMenuItem => ({
  title: 'Process with AI',
  onItemClick: () => {
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    void useNotesStore.getState().processWithAI(markdown);
  },
  aliases: ['process', 'ai'],
  group: 'Untask',
  icon: <Sparkles size={18} />,
  subtext: 'Open AI chat with this note as context',
});

const createTaskItem = (editor: BlockNoteEditor): BlockEditorSlashMenuItem => ({
  title: 'Create Task',
  onItemClick: () => {
    void createTaskFromCursor(editor);
  },
  aliases: ['task', 'todo'],
  group: 'Untask',
  icon: <CheckSquare size={18} />,
  subtext: 'Create a task from selection or nearby text',
});

const getSlashMenuItems = ({
  editor,
  defaultItems,
}: BlockEditorSlashMenuParams): BlockEditorSlashMenuItem[] => [
  ...defaultItems,
  createTaskItem(editor),
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
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const devLatencyRef = useRef<DevLatencyApi>(NOOP_DEV_LATENCY);
  const openMetricKeyRef = useRef<string | null>(null);
  const hasRecordedOpenLatencyRef = useRef(false);

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

  // Auto-focus editor when note opens
  useEffect(() => {
    if (!isLoading && activeNoteId && editorRef.current) {
      // Small delay to let BlockNote finish hydration
      const timer = setTimeout(() => {
        editorRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeNoteId, isLoading]);

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
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading note...</p>
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
            title="Process with AI (⌘↵)"
          >
            <Sparkles size={12} />
            {isProcessing ? 'processing' : 'process'}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={(
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading editor...</p>
            </div>
          )}
        >
          <LazyBlockEditor
            key={activeNoteId}
            content={content}
            onChange={handleChange}
            className="untask-notes-editor"
            getSlashMenuItems={getSlashMenuItems}
            editorRef={editorRef}
          />
        </Suspense>
      </div>
    </div>
  );
};
