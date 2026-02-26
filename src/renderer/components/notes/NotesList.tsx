import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import { SNAPPY, fadeVariants, heightVariants } from '../../lib/animation';

import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Clipboard,
  Copy,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';

import type { Note } from '../../../types/models';
import { useAutoFocusList } from '../../hooks/useAutoFocusList';
import { useNotesListKeyboard } from '../../hooks/useNotesListKeyboard';
import { deriveAutoTitle, getContentPreview, getDisplayTitle } from '../../lib/noteUtils';
import { cn } from '../../lib/utils';
import { Key } from '../ui/Key';
import {
  selectActiveNotes,
  selectArchivedNotes,
  selectIsListLoading,
  selectSelectedListNoteId,
  useNotesStore,
} from '../../stores/notesStore';
import { NotesListSkeleton } from '../ui/loadingShells';
import { Button } from '../ui/button';

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Context Menu ────────────────────────────────────────────

type ContextMenuState = {
  noteId: string;
  x: number;
  y: number;
  isArchived: boolean;
  isPinned: boolean;
};

type NoteContextMenuProps = ContextMenuState & {
  onClose: () => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCopyMarkdown: (id: string) => void;
  onDelete: (id: string) => void;
};

const NoteContextMenu = ({
  noteId,
  x,
  y,
  isArchived,
  isPinned,
  onClose,
  onPin,
  onUnpin,
  onArchive,
  onRestore,
  onDuplicate,
  onCopyMarkdown,
  onDelete,
}: NoteContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth) el.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${y - rect.height}px`;
  }, [x, y]);

  const itemClass = cn(
    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs',
    'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-100',
  );

  const action = (fn: (id: string) => void) => () => {
    fn(noteId);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-border/60 bg-popover p-1 shadow-md"
      style={{ left: x, top: y }}
    >
      {isArchived ? (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={action(onRestore)}>
            <ArchiveRestore className="size-3.5" aria-hidden="true" />
            <span>Restore</span>
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={action(onCopyMarkdown)}>
            <Clipboard className="size-3.5" aria-hidden="true" />
            <span>Copy as Markdown</span>
          </button>
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, 'hover:bg-destructive/10 hover:text-destructive')}
            onClick={action(onDelete)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={action(isPinned ? onUnpin : onPin)}>
            <Pin className="size-3.5" aria-hidden="true" />
            <span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={action(onArchive)}>
            <Archive className="size-3.5" aria-hidden="true" />
            <span>Archive</span>
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={action(onDuplicate)}>
            <Copy className="size-3.5" aria-hidden="true" />
            <span>Duplicate</span>
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={action(onCopyMarkdown)}>
            <Clipboard className="size-3.5" aria-hidden="true" />
            <span>Copy as Markdown</span>
          </button>
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, 'hover:bg-destructive/10 hover:text-destructive')}
            onClick={action(onDelete)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );
};

// ─── Note List Item ──────────────────────────────────────────

type NoteListItemProps = {
  note: Note;
  selected: boolean;
  onClick: (id: string) => void;
  onFocusSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, note: Note) => void;
  // Archived-only hover actions
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  // Active-only hover actions
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
  onArchive?: (id: string) => void;
};

const NoteListItem = ({
  note,
  selected,
  onClick,
  onFocusSelect,
  onContextMenu,
  onRestore,
  onDelete,
  onPin,
  onUnpin,
  onArchive,
}: NoteListItemProps) => {
  const title = getDisplayTitle(note.title, note.content);
  const preview = getContentPreview(note.title, note.content);
  const isEmptyTitle = !note.title && !deriveAutoTitle(note.content);

  return (
    <button
      type="button"
      data-note-id={note.id}
      onClick={() => onClick(note.id)}
      onFocus={() => onFocusSelect(note.id)}
      onContextMenu={(e) => onContextMenu(e, note)}
      className={cn(
        'group flex w-full items-center gap-2 border-b border-border/40 px-2 py-2 text-left transition-colors duration-100 last:border-b-0',
        selected ? 'bg-accent/40' : 'hover:bg-accent/10',
      )}
      aria-selected={selected}
    >
      {/* Pin indicator */}
      {note.isPinned ? (
        <Pin size={10} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate pl-0.5 text-[13px] font-medium',
              isEmptyTitle ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {title}
          </span>
        </div>
        {preview ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {preview}
          </p>
        ) : null}
      </div>

      {/* Hover actions for active notes */}
      {onPin || onUnpin || onArchive ? (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {note.isPinned && onUnpin ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onUnpin(note.id); }}
              aria-label="Unpin note"
            >
              <Pin size={12} aria-hidden="true" />
            </button>
          ) : onPin ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onPin(note.id); }}
              aria-label="Pin note"
            >
              <Pin size={12} aria-hidden="true" />
            </button>
          ) : null}
          {onArchive ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onArchive(note.id); }}
              aria-label="Archive note"
            >
              <Archive size={12} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ) : null}

      {/* Hover actions for archived notes */}
      {onRestore ? (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => { e.stopPropagation(); onRestore(note.id); }}
          aria-label="Restore note"
        >
          <ArchiveRestore size={12} aria-hidden="true" />
        </button>
      ) : null}
      {onDelete && !onArchive ? (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
          aria-label="Delete note"
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      ) : null}

      {/* Timestamp — hidden on hover when actions are visible */}
      <span className={cn(
        'shrink-0 font-mono text-[10px] text-muted-foreground',
        (onPin || onRestore) && 'group-hover:hidden',
      )}>
        {formatRelativeTime(note.updatedAt)}
      </span>
    </button>
  );
};

// ─── Notes List ──────────────────────────────────────────────

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
  const restoreNote = useNotesStore((s) => s.restoreNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const archiveNote = useNotesStore((s) => s.archiveNote);
  const pinNote = useNotesStore((s) => s.pinNote);
  const unpinNote = useNotesStore((s) => s.unpinNote);
  const duplicateNote = useNotesStore((s) => s.duplicateNote);
  const copyAsMarkdown = useNotesStore((s) => s.copyAsMarkdown);
  const setSelectedListNoteId = useNotesStore((s) => s.setSelectedListNoteId);

  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelectRelative = useCallback(
    (delta: -1 | 1) => {
      useNotesStore.getState().selectRelativeActive(delta);
    },
    [],
  );

  const handleOpenSelected = useCallback(() => {
    void useNotesStore.getState().openSelectedNote();
  }, []);

  const onKeyDown = useNotesListKeyboard({
    noteCount: activeNotes.length,
    onSelectRelative: handleSelectRelative,
    onOpenSelected: handleOpenSelected,
    containerRef,
  });

  const effectiveSelectedId = useMemo(() => {
    if (selectedListNoteId && activeNotes.some((note) => note.id === selectedListNoteId)) {
      return selectedListNoteId;
    }
    return activeNotes[0]?.id ?? null;
  }, [activeNotes, selectedListNoteId]);

  const selectedIndex = activeNotes.findIndex((n) => n.id === effectiveSelectedId);

  useAutoFocusList({
    items: activeNotes,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
    getItemId: (n) => n.id,
    containerRef,
    itemSelector: 'data-note-id',
  });

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

  const handleFocusSelect = useCallback(
    (id: string) => {
      setSelectedListNoteId(id);
    },
    [setSelectedListNoteId],
  );

  const handleRestore = useCallback(
    (id: string) => { void restoreNote(id); },
    [restoreNote],
  );

  const handleDelete = useCallback(
    (id: string) => { void deleteNote(id); },
    [deleteNote],
  );

  const handleArchive = useCallback(
    (id: string) => { void archiveNote(id); },
    [archiveNote],
  );

  const handlePin = useCallback(
    (id: string) => { void pinNote(id); },
    [pinNote],
  );

  const handleUnpin = useCallback(
    (id: string) => { void unpinNote(id); },
    [unpinNote],
  );

  const handleDuplicate = useCallback(
    (id: string) => { void duplicateNote(id); },
    [duplicateNote],
  );

  const handleCopyMarkdown = useCallback(
    (id: string) => { void copyAsMarkdown(id); },
    [copyAsMarkdown],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, note: Note) => {
      e.preventDefault();
      setContextMenu({
        noteId: note.id,
        x: e.clientX,
        y: e.clientY,
        isArchived: note.status === 'archived',
        isPinned: note.isPinned,
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  if (isLoading && activeNotes.length === 0) {
    return <NotesListSkeleton />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" aria-busy={false}>
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
          <Plus size={12} aria-hidden="true" />
          New
        </Button>
      </header>

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn('min-h-0 flex-1 overflow-y-auto px-1 outline-none', compact && 'pr-0')}
        role="listbox"
        data-primary-focusable=""
      >
        {activeNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 pt-16 text-center">
            <p className="text-sm text-muted-foreground">No active notes</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Press <span className="inline-flex items-center gap-0.5"><Key k="cmd" size="sm" /><Key size="sm">N</Key></span> to create one
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
                onFocusSelect={handleFocusSelect}
                onContextMenu={handleContextMenu}
                onPin={handlePin}
                onUnpin={handleUnpin}
                onArchive={handleArchive}
              />
            ))}
          </div>
        )}

        <AnimatePresence>
          {archivedNotes.length > 0 ? (
            <motion.div
              key="archive-section"
              variants={fadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.1 }}
              className="mt-4 border-t border-border/50 pt-2"
            >
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
                  aria-hidden="true"
                />
                <Archive size={12} aria-hidden="true" />
                <span>Archived</span>
                <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium">
                  {archivedNotes.length}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {archiveExpanded ? (
                  <motion.div
                    key="archive-list"
                    variants={heightVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={SNAPPY}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="mt-1 opacity-70">
                      {archivedNotes.map((note) => (
                        <NoteListItem
                          key={note.id}
                          note={note}
                          selected={false}
                          onClick={handleOpen}
                          onFocusSelect={handleFocusSelect}
                          onContextMenu={handleContextMenu}
                          onRestore={handleRestore}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {contextMenu ? (
        <NoteContextMenu
          {...contextMenu}
          onClose={handleCloseContextMenu}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onDuplicate={handleDuplicate}
          onCopyMarkdown={handleCopyMarkdown}
          onDelete={handleDelete}
        />
      ) : null}
    </div>
  );
};
