import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuickAddWindowPayload } from '../../../types/ipc';
import type { ChipToken, Suggestion } from './slashCommands';
import { detectSlashToken, extractTokens, getSuggestions } from './slashCommands';
import { SlashPopover } from './SlashPopover';
import { ChipRow } from './ChipRow';

const COLLAPSED_HEIGHT = 60;
const EXPANDED_HEIGHT = 140;
const CHIP_ROW_HEIGHT = 28;

type MetadataState = {
  priority: 'none' | 'low' | 'medium' | 'high';
  today: boolean;
  dueDate: string | null;
};

const DEFAULT_METADATA: MetadataState = {
  priority: 'none',
  today: false,
  dueDate: null,
};

const PRIORITY_ORDER: MetadataState['priority'][] = ['none', 'low', 'medium', 'high'];

const priorityLabel: Record<MetadataState['priority'], string> = {
  none: '\u2014',
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

const priorityColor: Record<MetadataState['priority'], string> = {
  none: 'text-muted-foreground',
  low: 'text-foreground/60',
  medium: 'text-foreground/80',
  high: 'text-foreground',
};

export function QuickAddApp() {
  const [title, setTitle] = useState('');
  const [metadata, setMetadata] = useState<MetadataState>(DEFAULT_METADATA);
  const [chips, setChips] = useState<ChipToken[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Slash command popover state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLButtonElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);

  const applyTheme = useCallback((theme: 'dark' | 'light') => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, []);

  const reset = useCallback(() => {
    setTitle('');
    setMetadata(DEFAULT_METADATA);
    setChips([]);
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

  // Resize window based on expanded + chips state
  useEffect(() => {
    let height = COLLAPSED_HEIGHT;
    if (chips.length > 0) height += CHIP_ROW_HEIGHT;
    if (expanded) height = Math.max(height, EXPANDED_HEIGHT);
    if (suggestions.length > 0) height += suggestions.length * 30 + 10;
    window.quickAdd.resize(height);
  }, [expanded, chips.length, suggestions.length]);

  // Apply chip to metadata
  const applyChip = useCallback((chip: ChipToken) => {
    if (chip.type === 'priority') {
      setMetadata((prev) => ({ ...prev, priority: chip.value as MetadataState['priority'] }));
    } else if (chip.type === 'today') {
      setMetadata((prev) => ({ ...prev, today: true }));
    } else if (chip.type === 'due') {
      setMetadata((prev) => ({ ...prev, dueDate: chip.value }));
    }
  }, []);

  // Remove a chip and revert metadata
  const removeChip = useCallback((type: ChipToken['type']) => {
    setChips((prev) => prev.filter((c) => c.type !== type));
    if (type === 'priority') {
      setMetadata((prev) => ({ ...prev, priority: 'none' }));
    } else if (type === 'today') {
      setMetadata((prev) => ({ ...prev, today: false }));
    } else if (type === 'due') {
      setMetadata((prev) => ({ ...prev, dueDate: null }));
    }
  }, []);

  // Handle text changes — detect slash tokens and extract completed tokens
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setTitle(newValue);

    // Check for completed tokens (after Space key finalizes)
    const { cleanTitle, chips: newChips } = extractTokens(newValue);
    if (newChips.length > 0) {
      setTitle(cleanTitle);
      setChips((prev) => {
        const merged = [...prev];
        for (const chip of newChips) {
          const existing = merged.findIndex((c) => c.type === chip.type);
          if (existing >= 0) {
            merged[existing] = chip;
          } else {
            merged.push(chip);
          }
        }
        return merged;
      });
      for (const chip of newChips) applyChip(chip);
      setSuggestions([]);
      if (newChips.some((c) => c.type !== 'today')) {
        setExpanded(true);
      }
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
  }, [applyChip]);

  // Insert a slash command from the popover
  const insertCommand = useCallback((suggestion: Suggestion) => {
    if (!suggestion.command.hasValue) {
      // Toggle command (e.g. /today) — apply immediately
      const chip: ChipToken = { type: 'today', label: 'Today', value: 'true' };
      setChips((prev) => {
        const existing = prev.findIndex((c) => c.type === 'today');
        if (existing >= 0) {
          // Remove toggle if already present
          return prev.filter((c) => c.type !== 'today');
        }
        return [...prev, chip];
      });
      setMetadata((prev) => ({ ...prev, today: !prev.today }));

      // Remove the partial slash token from input
      const input = inputRef.current;
      if (input) {
        const cursorPos = input.selectionStart ?? title.length;
        const beforeCursor = title.slice(0, cursorPos);
        const slashIdx = beforeCursor.lastIndexOf('/');
        const newTitle = title.slice(0, slashIdx) + title.slice(cursorPos);
        setTitle(newTitle.trim());
      }
    } else {
      // Command with value — replace the partial token with the full trigger + space
      const input = inputRef.current;
      if (input) {
        const cursorPos = input.selectionStart ?? title.length;
        const beforeCursor = title.slice(0, cursorPos);
        const slashIdx = beforeCursor.lastIndexOf('/');
        const afterCursor = title.slice(cursorPos);
        const newTitle = title.slice(0, slashIdx) + suggestion.command.trigger + ' ' + afterCursor;
        setTitle(newTitle);

        // Position cursor after the trigger + space
        requestAnimationFrame(() => {
          const newPos = slashIdx + suggestion.command.trigger.length + 1;
          input.setSelectionRange(newPos, newPos);
          input.focus();
        });
      }
    }

    setSuggestions([]);
  }, [title]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await window.quickAdd.createTask({
        title: trimmed,
        status: 'inbox',
        priority: metadata.priority,
        today: metadata.today,
        dueDate: metadata.dueDate,
      });
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

    // Backspace on empty input: remove last chip
    if (event.key === 'Backspace' && title === '' && chips.length > 0) {
      const lastChip = chips[chips.length - 1];
      removeChip(lastChip.type);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      if (!expanded) {
        setExpanded(true);
        // Focus priority after expand renders
        requestAnimationFrame(() => priorityRef.current?.focus());
      } else {
        priorityRef.current?.focus();
      }
      return;
    }

    if (event.key === 'Tab' && event.shiftKey && expanded) {
      event.preventDefault();
      dueDateRef.current?.focus();
    }
  }, [suggestions, selectedSuggestion, insertCommand, handleSubmit, reset, expanded, title, chips, removeChip]);

  // Global key handler for metadata row
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
          'bg-background/95 backdrop-blur-xl shadow-2xl',
          'transition-all duration-200',
          error ? 'border-destructive/60 shadow-destructive/10' : '',
        ].join(' ')}
      >
        {/* Title input row */}
        <div className="flex items-center px-3 h-[50px]">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && !submitting) {
                void handleSubmit();
              }
            }}
            placeholder="Add to inbox..."
            autoFocus
            aria-autocomplete={suggestions.length > 0 ? 'list' : undefined}
            aria-expanded={suggestions.length > 0 ? true : undefined}
            className={[
              'flex-1 bg-transparent text-foreground text-[15px]',
              'placeholder:text-muted-foreground/50',
              'outline-none border-none',
              'font-sans',
            ].join(' ')}
          />
          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={[
              'ml-2 p-1 rounded-md text-muted-foreground/50',
              'hover:text-muted-foreground hover:bg-accent',
              'transition-colors',
            ].join(' ')}
            aria-label={expanded ? 'Collapse metadata' : 'Expand metadata'}
            tabIndex={-1}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className={[
                'transition-transform duration-200',
                expanded ? 'rotate-45' : '',
              ].join(' ')}
            >
              <path
                d="M7 2v10M2 7h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Chip row */}
        <ChipRow chips={chips} onRemove={removeChip} />

        {/* Slash command popover */}
        <SlashPopover
          suggestions={suggestions}
          selectedIndex={selectedSuggestion}
          onSelect={insertCommand}
        />

        {/* Metadata row */}
        {expanded && (
          <div
            className={[
              'flex items-center gap-2 px-3 pb-3',
              'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200',
            ].join(' ')}
          >
            {/* Priority */}
            <button
              ref={priorityRef}
              type="button"
              onClick={cyclePriority}
              onKeyDown={(e) => {
                handleMetaKeyDown(e);
                if (e.key === ' ') { e.preventDefault(); cyclePriority(); }
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                  e.preventDefault(); cyclePriority();
                }
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); todayRef.current?.focus(); }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); inputRef.current?.focus(); }
              }}
              className={[
                'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium',
                'border border-border/50 hover:bg-accent transition-colors',
                priorityColor[metadata.priority],
              ].join(' ')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 9V3l4 2.5L10 3v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {priorityLabel[metadata.priority]}
            </button>

            {/* Today */}
            <button
              ref={todayRef}
              type="button"
              onClick={toggleToday}
              onKeyDown={(e) => {
                handleMetaKeyDown(e);
                if (e.key === ' ') { e.preventDefault(); toggleToday(); }
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); dueDateRef.current?.focus(); }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); priorityRef.current?.focus(); }
              }}
              className={[
                'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium',
                'border transition-colors',
                metadata.today
                  ? 'border-foreground/20 bg-foreground/10 text-foreground'
                  : 'border-border/50 text-muted-foreground hover:bg-accent',
              ].join(' ')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                {metadata.today && <circle cx="6" cy="6" r="2" fill="currentColor" />}
              </svg>
              Today
            </button>

            {/* Due date */}
            <input
              ref={dueDateRef}
              type="date"
              value={metadata.dueDate ?? ''}
              onChange={(e) => {
                setMetadata((prev) => ({
                  ...prev,
                  dueDate: e.target.value || null,
                }));
              }}
              onKeyDown={(e) => {
                handleMetaKeyDown(e);
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); inputRef.current?.focus(); }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); todayRef.current?.focus(); }
              }}
              className={[
                'px-2 py-1 rounded-md text-[11px] font-medium',
                'border border-border/50 bg-transparent',
                'text-muted-foreground hover:bg-accent transition-colors',
                'outline-none',
                metadata.dueDate ? 'text-foreground' : '',
              ].join(' ')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
