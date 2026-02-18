import { useCallback, useMemo, useState } from 'react';

import { Archive, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';

import type { Note } from '../../../types/models';
import { cn } from '../../lib/utils';
import {
  selectActiveNotes,
  selectArchivedNotes,
  selectIsListLoading,
  selectSelectedListNoteId,
  useNotesStore,
} from '../../stores/notesStore';
import { Button } from '../ui/button';

const formatRelativeTime = (iso: string | null): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};

const getPreview = (content: string): string => {
  if (!content.trim()) return 'Empty note';

  try {
    const blocks = JSON.parse(content) as Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;

    if (!Array.isArray(blocks)) return 'Empty note';

    for (const block of blocks) {
      if (block.content && Array.isArray(block.content)) {
        const text = block.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('');
        if (text.trim()) return text.trim();
      }
    }

    return 'Empty note';
  } catch {
    // Legacy markdown — take first non-empty line.
    const firstLine = content.split('\n').find((line) => line.trim());
    return firstLine?.trim() || 'Empty note';
  }
};

type NoteListItemProps = {
  note: Note;
  selected: boolean;
  onClick: (id: string) => void;
  onHover: (id: string) => void;
  onDelete?: (id: string) => void;
};

const NoteListItem = ({ note, selected, onClick, onHover, onDelete }: NoteListItemProps) => {
  const preview = getPreview(note.content);
  const isArchived = note.status === 'archived';

  return (
    <button
      type="button"
      onClick={() => onClick(note.id)}
      onMouseEnter={() => onHover(note.id)}
      onFocus={() => onHover(note.id)}
      className={cn(
        'group flex w-full items-center gap-2 border-b border-border/40 px-2 py-2 text-left transition-colors duration-100 last:border-b-0',
        selected
          ? 'bg-accent/20'
          : 'hover:bg-accent/10',
      )}
      aria-selected={selected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {note.title}
          </span>
          {isArchived ? (
            <span className="inline-flex items-center gap-0.5 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles size={8} />
              processed
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {preview}
        </p>
      </div>
      {onDelete ? (
        <span
          role="button"
          tabIndex={0}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onDelete(note.id);
            }
          }}
          aria-label="Delete note"
        >
          <Trash2 size={12} />
        </span>
      ) : null}
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatRelativeTime(note.createdAt)}
      </span>
    </button>
  );
};

type NotesListProps = {
  compact?: boolean;
};

export const NotesList = ({ compact = false }: NotesListProps) => {
  const activeNotes = useNotesStore(selectActiveNotes);
  const archivedNotes = useNotesStore(selectArchivedNotes);
  const isLoading = useNotesStore(selectIsListLoading);
  const selectedListNoteId = useNotesStore(selectSelectedListNoteId);

  const createNote = useNotesStore((s) => s.createNote);
  const openNote = useNotesStore((s) => s.openNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const setSelectedListNoteId = useNotesStore((s) => s.setSelectedListNoteId);

  const [archiveExpanded, setArchiveExpanded] = useState(false);

  const effectiveSelectedId = useMemo(() => {
    if (selectedListNoteId && activeNotes.some((note) => note.id === selectedListNoteId)) {
      return selectedListNoteId;
    }
    return activeNotes[0]?.id ?? null;
  }, [activeNotes, selectedListNoteId]);

  const handleCreate = useCallback(() => {
    void createNote();
  }, [createNote]);

  const handleOpen = useCallback(
    (id: string) => {
      setSelectedListNoteId(id);
      void openNote(id);
    },
    [openNote, setSelectedListNoteId],
  );

  const handleHover = useCallback(
    (id: string) => {
      setSelectedListNoteId(id);
    },
    [setSelectedListNoteId],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void deleteNote(id);
    },
    [deleteNote],
  );

  if (isLoading && activeNotes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Notes
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={handleCreate}
        >
          <Plus size={12} />
          New
        </Button>
      </header>

      <div className={cn('min-h-0 flex-1 overflow-y-auto px-1', compact && 'pr-0')} role="listbox">
        {activeNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 pt-16 text-center">
            <p className="text-sm text-muted-foreground">No active notes</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Press <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Cmd+Shift+N</kbd> to create one
            </p>
          </div>
        ) : (
          <div>
            {activeNotes.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                selected={effectiveSelectedId === note.id}
                onClick={handleOpen}
                onHover={handleHover}
              />
            ))}
          </div>
        )}

        {archivedNotes.length > 0 ? (
          <div className="mt-4 border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setArchiveExpanded((value) => !value)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight
                size={12}
                className={cn(
                  'transition-transform',
                  archiveExpanded && 'rotate-90',
                )}
              />
              <Archive size={12} />
              <span>Archived</span>
              <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium">
                {archivedNotes.length}
              </span>
            </button>

            {archiveExpanded ? (
              <div className="mt-1 opacity-70">
                {archivedNotes.map((note) => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    selected={false}
                    onClick={handleOpen}
                    onHover={handleHover}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
