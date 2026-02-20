import { useCallback, useRef, useState } from 'react';

import { parseDate } from './slashCommands';
import { formatDueDateDisplay } from '../tasks/dueDate';

type Props = {
  dueDate: string | null;
  onChange: (next: string | null) => void;
};

const SEGMENT =
  'inline-flex items-center py-1 -my-1 cursor-pointer transition-colors duration-150 hover:text-foreground focus-visible:bg-accent/30 focus-visible:rounded-sm focus-visible:px-1 focus-visible:-mx-1 outline-none';
const SEGMENT_EMPTY = 'text-muted-foreground/50';

/**
 * Lightweight due date picker for the quick-add window.
 * Uses chrono-node text parsing instead of a native picker to avoid
 * stealing focus from the frameless window.
 * Accepts: "tomorrow", "monday", "next week", "15.03", "2026-03-15", etc.
 */
export function QuickAddDueDatePicker({ dueDate, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const label = dueDate ? formatDueDateDisplay(dueDate) : 'due date';

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      // Empty input clears the date
      onChange(null);
    } else {
      const parsed = parseDate(trimmed);
      if (parsed) {
        onChange(parsed);
      }
      // If parsing fails, keep the current value
    }
    setEditing(false);
    setDraft('');
  }, [draft, onChange]);

  const startEditing = useCallback(() => {
    setEditing(true);
    setDraft('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
            setDraft('');
          }
        }}
        onBlur={commit}
        placeholder="tomorrow, friday, 15.03..."
        className="w-32 bg-transparent text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/30 border-b border-foreground/20"
      />
    );
  }

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          startEditing();
        }
        if ((e.key === 'Backspace' || e.key === 'Delete') && dueDate) {
          e.preventDefault();
          onChange(null);
        }
      }}
      className={[SEGMENT, !dueDate && SEGMENT_EMPTY].filter(Boolean).join(' ')}
      aria-label={dueDate ? `Due date: ${label} — click to change` : 'Set due date'}
    >
      {label}
    </button>
  );
}
