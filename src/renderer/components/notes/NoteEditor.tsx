import { useCallback, useEffect, useRef } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare, Sparkles, Trash2 } from 'lucide-react';

import {
  selectActiveNoteId,
  selectActiveNoteTitle,
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
import { BlockEditor } from '../editor/BlockEditor';
import { Button } from '../ui/button';

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

const createProcessItem = (editor: BlockNoteEditor): DefaultReactSuggestionItem => ({
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

const createTaskItem = (editor: BlockNoteEditor): DefaultReactSuggestionItem => ({
  title: 'Create Task',
  onItemClick: () => {
    void createTaskFromCursor(editor);
  },
  aliases: ['task', 'todo'],
  group: 'Untask',
  icon: <CheckSquare size={18} />,
  subtext: 'Create a task from selection or nearby text',
});

const getSlashMenuItems = (editor: BlockNoteEditor): DefaultReactSuggestionItem[] => [
  ...getDefaultReactSlashMenuItems(editor),
  createTaskItem(editor),
  createProcessItem(editor),
];

type NoteEditorProps = {
  showBackButton?: boolean;
};

// ─── Component ─────────────────────────────────────────────

export const NoteEditor = ({ showBackButton = true }: NoteEditorProps) => {
  const activeNoteId = useNotesStore(selectActiveNoteId);
  const title = useNotesStore(selectActiveNoteTitle);
  const content = useNotesStore(selectNotesContent);
  const isDirty = useNotesStore(selectNotesIsDirty);
  const isLoading = useNotesStore(selectNotesIsLoading);
  const isSaving = useNotesStore(selectNotesIsSaving);
  const isProcessing = useNotesStore(selectNotesIsProcessing);
  const error = useNotesStore(selectNotesError);
  const notice = useNotesStore(selectNotesNotice);
  const isArchived = useNotesStore(selectIsActiveNoteArchived);
  const setContent = useNotesStore((s) => s.setContent);
  const setTitle = useNotesStore((s) => s.setTitle);
  const backToList = useNotesStore((s) => s.backToList);
  const archiveNote = useNotesStore((s) => s.archiveNote);
  const restoreNote = useNotesStore((s) => s.restoreNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const processWithAI = useNotesStore((s) => s.processWithAI);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);

  // 2s debounced auto-save
  const handleChange = useCallback(
    (json: string) => {
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

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
    },
    [setTitle],
  );

  const handleTitleBlur = useCallback(() => {
    // Trigger save on title blur to persist title changes.
    if (useNotesStore.getState().isDirty) {
      void useNotesStore.getState().save();
    }
  }, []);

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

        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Untitled note"
        />

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
            >
              <Archive size={12} />
              archive
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <BlockEditor
          key={activeNoteId}
          content={content}
          onChange={handleChange}
          className="untask-notes-editor"
          getSlashMenuItems={getSlashMenuItems}
          editorRef={editorRef}
        />
      </div>
    </div>
  );
};
