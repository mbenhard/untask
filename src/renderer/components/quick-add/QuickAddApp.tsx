import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Task } from '../../../types/models';
import type { QuickAddWindowPayload } from '../../../types/ipc';
import type { Suggestion } from './slashCommands';
import { detectSlashToken, extractTokens, getSuggestions } from './slashCommands';
import { SlashPopover } from './SlashPopover';
import { formatDueDateDisplay } from '../tasks/dueDate';
import { PRIORITY_DOT, PRIORITY_LABEL, SEGMENT, SEGMENT_EMPTY } from '../../lib/taskConstants';
import { QuickAddDueDatePicker } from './QuickAddDueDatePicker';

const COLLAPSED_HEIGHT = 60;
const EXPANDED_HEIGHT = 102;

const PRIORITY_ORDER: NonNullable<Task['priority']>[] = ['none', 'low', 'medium', 'high'];

type MetadataState = {
  priority: NonNullable<Task['priority']>;
  today: boolean;
  dueDate: string | null;
};

const DEFAULT_METADATA: MetadataState = {
  priority: 'none',
  today: false,
  dueDate: null,
};

export function QuickAddApp() {
  const [title, setTitle] = useState('');
  const [metadata, setMetadata] = useState<MetadataState>(DEFAULT_METADATA);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Slash command popover state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLButtonElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  const dueDateLabel = useMemo(
    () => (metadata.dueDate ? formatDueDateDisplay(metadata.dueDate) : null),
    [metadata.dueDate],
  );

  const applyTheme = useCallback((theme: 'dark' | 'light') => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, []);

  const reset = useCallback(() => {
    setTitle('');
    setMetadata(DEFAULT_METADATA);
    setExpanded(false);
    setError(false);
    setSubmitting(false);
    setSuggestions([]);
    setSelectedSuggestion(0);
  }, []);

  // Listen for payload from main process
  useEffect(() => {
    const unsubscribe = window.quickAdd.onPayload((payload: QuickAddWindowPayload) => {
      reset();
      applyTheme(payload.theme);
      setTitle(payload.text);

      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          if (payload.text) {
            inputRef.current.select();
          }
        }
      });
    });

    return unsubscribe;
  }, [applyTheme, reset]);

  // Resize window based on expanded state + suggestions
  useEffect(() => {
    let height = COLLAPSED_HEIGHT;
    if (expanded) height = EXPANDED_HEIGHT;
    if (suggestions.length > 0) height += suggestions.length * 30 + 10;
    window.quickAdd.resize(height);
  }, [expanded, suggestions.length]);

  // Handle text changes — detect slash tokens and extract completed tokens
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setTitle(newValue);

    // Check for completed tokens (after Space key finalizes)
    const { cleanTitle, chips: newChips } = extractTokens(newValue);
    if (newChips.length > 0) {
      setTitle(cleanTitle);
      // Apply slash command values directly to metadata (no chip system)
      for (const chip of newChips) {
        if (chip.type === 'priority') {
          setMetadata((prev) => ({ ...prev, priority: chip.value as MetadataState['priority'] }));
        } else if (chip.type === 'today') {
          setMetadata((prev) => ({ ...prev, today: true }));
        } else if (chip.type === 'due') {
          setMetadata((prev) => ({ ...prev, dueDate: chip.value }));
        }
      }
      setSuggestions([]);
      setExpanded(true);
      return;
    }

    // Detect in-progress slash command for popover
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const partial = detectSlashToken(newValue, cursorPos);
    if (partial) {
      const matched = getSuggestions(partial);
      setSuggestions(matched);
      setSelectedSuggestion(0);
    } else {
      setSuggestions([]);
    }
  }, []);

  // Insert a slash command from the popover
  const insertCommand = useCallback((suggestion: Suggestion) => {
    // Remove the partial slash token from input
    const input = inputRef.current;
    const cursorPos = input?.selectionStart ?? title.length;
    const beforeCursor = title.slice(0, cursorPos);
    const slashIdx = beforeCursor.lastIndexOf('/');

    if (!suggestion.command.hasValue) {
      // Toggle command (e.g. /today) — apply immediately
      setMetadata((prev) => ({ ...prev, today: !prev.today }));
      const newTitle = title.slice(0, slashIdx) + title.slice(cursorPos);
      setTitle(newTitle.trim());
      setExpanded(true);
    } else {
      // Command with value — replace the partial token with the full trigger + space
      const afterCursor = title.slice(cursorPos);
      const newTitle = title.slice(0, slashIdx) + suggestion.command.trigger + ' ' + afterCursor;
      setTitle(newTitle);

      // Position cursor after the trigger + space
      requestAnimationFrame(() => {
        if (input) {
          const newPos = slashIdx + suggestion.command.trigger.length + 1;
          input.setSelectionRange(newPos, newPos);
          input.focus();
        }
      });
    }

    setSuggestions([]);
  }, [title]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const result = await window.quickAdd.createTask({
        title: trimmed,
        status: 'inbox',
        priority: metadata.priority,
        today: metadata.today,
        dueDate: metadata.dueDate,
      }) as { id: string } | null;

      if (result?.id) {
        window.quickAdd.navigateToTask(result.id);
      }

      reset();
      window.quickAdd.hide();
    } catch {
      setError(true);
      setSubmitting(false);
      setTimeout(() => setError(false), 600);
    }
  }, [title, metadata, submitting, reset]);

  const cyclePriority = useCallback(() => {
    setMetadata((prev) => {
      const idx = PRIORITY_ORDER.indexOf(prev.priority);
      return { ...prev, priority: PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length] };
    });
    if (!expanded) setExpanded(true);
  }, [expanded]);

  const toggleToday = useCallback(() => {
    setMetadata((prev) => ({ ...prev, today: !prev.today }));
    if (!expanded) setExpanded(true);
  }, [expanded]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Popover navigation
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedSuggestion((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insertCommand(suggestions[selectedSuggestion]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSuggestions([]);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      reset();
      window.quickAdd.hide();
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      if (!expanded) {
        setExpanded(true);
        requestAnimationFrame(() => priorityRef.current?.focus());
      } else {
        priorityRef.current?.focus();
      }
      return;
    }

    if (event.key === 'Tab' && event.shiftKey && expanded) {
      event.preventDefault();
      // Wrap to last metadata field
      todayRef.current?.focus();
    }
  }, [suggestions, selectedSuggestion, insertCommand, handleSubmit, reset, expanded]);

  // Global key handler for metadata row fields
  const handleMetaKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') { event.preventDefault(); void handleSubmit(); }
    if (event.key === 'Escape') { event.preventDefault(); reset(); window.quickAdd.hide(); }
  }, [handleSubmit, reset]);

  return (
    <div
      role="dialog"
      aria-label="Quick add task"
      className="flex flex-col w-full h-full"
    >
      <div
        className={[
          'relative mx-1 mt-1 flex flex-col rounded-xl border border-border/60',
          'bg-background shadow-2xl',
          'transition-all duration-200',
          error ? 'border-destructive/60 shadow-destructive/10' : '',
        ].join(' ')}
      >
        {/* Title input row */}
        <div className="flex items-center gap-2 px-3 h-[50px]">
          {/* Ghost checkbox + priority dot (matching InlineTaskInput) */}
          <div className="flex items-center gap-1.5">
            <span className="inline-flex size-5 items-center justify-center">
              <span
                className="inline-flex size-3.5 items-center justify-center rounded-full border border-dashed"
                style={{ borderColor: 'var(--foreground-muted, rgba(255,255,255,0.35))' }}
              />
            </span>
            <span
              className={[
                'size-[5px] rounded-full transition-colors duration-200',
                PRIORITY_DOT[metadata.priority],
              ].join(' ')}
            />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Add to inbox..."
            autoFocus
            aria-autocomplete={suggestions.length > 0 ? 'list' : undefined}
            aria-expanded={suggestions.length > 0 ? true : undefined}
            className={[
              'flex-1 min-w-0 bg-transparent text-foreground text-[13px]',
              'placeholder:text-muted-foreground/50',
              'outline-none border-none',
              'font-sans',
            ].join(' ')}
          />

          {/* Right badges — show set metadata as compact badges */}
          <div className="ml-auto flex items-center gap-1">
            {dueDateLabel && !expanded && (
              <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
                {dueDateLabel}
              </span>
            )}
            {metadata.today && !expanded && (
              <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
                today
              </span>
            )}
          </div>

          {/* Keyboard hints / expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 p-1 rounded-md transition-colors hover:bg-accent"
            aria-label={expanded ? 'Collapse metadata' : 'Expand metadata'}
            tabIndex={-1}
          >
            {!expanded && (
              <kbd className="inline-flex h-4 items-center rounded border border-border/40 bg-muted/30 px-1 font-mono text-[9px] text-muted-foreground/60">
                tab
              </kbd>
            )}
            <kbd className="inline-flex h-4 items-center rounded border border-border/40 bg-muted/30 px-1 font-mono text-[9px] text-muted-foreground/60">
              ↵
            </kbd>
          </button>
        </div>

        {/* Slash command popover */}
        <SlashPopover
          suggestions={suggestions}
          selectedIndex={selectedSuggestion}
          onSelect={insertCommand}
        />

        {/* Metadata row — matches InlineTaskInput design */}
        {expanded && (
          <div
            className="flex items-center gap-1.5 px-3 pb-2.5 pt-0.5 text-[11px] font-mono text-muted-foreground border-t border-border/40 mx-1"
            onKeyDown={handleMetaKeyDown}
          >
            {/* Priority toggle */}
            <button
              ref={priorityRef}
              type="button"
              tabIndex={0}
              onClick={cyclePriority}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  inputRef.current?.focus();
                  return;
                }
                if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                  e.preventDefault(); cyclePriority();
                }
              }}
              className={[SEGMENT, metadata.priority === 'none' && SEGMENT_EMPTY].filter(Boolean).join(' ')}
              aria-label={`Priority: ${metadata.priority} — click to cycle`}
            >
              {metadata.priority !== 'none' && (
                <span
                  className={['mr-1 inline-block size-1.5 rounded-full', PRIORITY_DOT[metadata.priority]].join(' ')}
                />
              )}
              {PRIORITY_LABEL[metadata.priority]}
            </button>

            <span aria-hidden="true" className="text-border select-none">&middot;</span>

            {/* Due date picker */}
            <QuickAddDueDatePicker
              dueDate={metadata.dueDate}
              onChange={(next) => setMetadata((prev) => ({ ...prev, dueDate: next }))}
            />

            <span aria-hidden="true" className="text-border select-none">&middot;</span>

            {/* Today toggle */}
            <button
              ref={todayRef}
              type="button"
              tabIndex={0}
              onClick={toggleToday}
              onKeyDown={(e) => {
                if (e.key === ' ') { e.preventDefault(); toggleToday(); }
              }}
              className={[SEGMENT, !metadata.today && SEGMENT_EMPTY].filter(Boolean).join(' ')}
              aria-label={metadata.today ? 'Remove from today' : 'Add to today'}
              aria-pressed={metadata.today}
            >
              today
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
