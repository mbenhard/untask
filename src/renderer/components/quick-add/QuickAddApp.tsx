import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Bookmark } from 'lucide-react';

import type { Task } from '../../../types/models';
import type { QuickAddWindowPayload } from '../../../types/ipc';
import type { SuggestionItem, SuggestionData } from './slashCommands';
import { detectToken, extractTokens, getSuggestions, highlightRanges } from './slashCommands';
import { TokenPopover } from './TokenPopover';
import { TokenHighlightOverlay } from './TokenHighlightOverlay';
import { formatDueDateDisplay } from '../tasks/dueDate';
import { PRIORITY_DOT, PRIORITY_LABEL, SEGMENT, SEGMENT_EMPTY } from '../../lib/taskConstants';
import { QuickAddDueDatePicker } from './QuickAddDueDatePicker';
import { Key } from '../ui/Key';

const COLLAPSED_HEIGHT = 60;
const EXPANDED_HEIGHT = 102;

const PRIORITY_ORDER: NonNullable<Task['priority']>[] = ['none', 'low', 'medium', 'high'];

type MetadataState = {
  priority: NonNullable<Task['priority']>;
  today: boolean;
  dueDate: string | null;
  tags: string[];
  status: string;
};

const DEFAULT_METADATA: MetadataState = {
  priority: 'none',
  today: false,
  dueDate: null,
  tags: [],
  status: 'inbox',
};

type TokenDerivedMetadata = {
  priority?: MetadataState['priority'];
  today: boolean;
  dueDate?: string;
  tags: string[];
  status?: string;
};

function deriveTokenMetadata(text: string): TokenDerivedMetadata {
  const { tokens } = extractTokens(text);
  const derived: TokenDerivedMetadata = {
    today: false,
    tags: [],
  };

  for (const token of tokens) {
    if (token.type === 'priority') derived.priority = token.value as MetadataState['priority'];
    if (token.type === 'today') derived.today = true;
    if (token.type === 'due') derived.dueDate = token.value;
    if (token.type === 'tag') derived.tags.push(token.value);
    if (token.type === 'status') derived.status = token.value;
  }

  return derived;
}

export function QuickAddApp() {
  const [title, setTitle] = useState('');
  const [metadata, setMetadata] = useState<MetadataState>(DEFAULT_METADATA);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Token popover state
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [suggestionData, setSuggestionData] = useState<SuggestionData>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLButtonElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  const tokenMetadata = useMemo(
    () => deriveTokenMetadata(title),
    [title],
  );

  const effectiveMetadata = useMemo<MetadataState>(
    () => ({
      priority: tokenMetadata.priority ?? metadata.priority,
      today: tokenMetadata.today || metadata.today,
      dueDate: tokenMetadata.dueDate ?? metadata.dueDate,
      tags: tokenMetadata.tags,
      status: tokenMetadata.status ?? metadata.status,
    }),
    [metadata, tokenMetadata],
  );

  const dueDateLabel = useMemo(
    () => (effectiveMetadata.dueDate ? formatDueDateDisplay(effectiveMetadata.dueDate) : null),
    [effectiveMetadata.dueDate],
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

      // Fetch autocomplete data
      Promise.all([
        window.quickAdd.getTags(),
        window.quickAdd.getStatuses(),
      ]).then(([tags, statuses]) => {
        setSuggestionData({ tags, statuses });
      });

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

  // Handle text changes — detect tokens for popover and preview metadata
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setTitle(newValue);

    if (!expanded && highlightRanges(newValue).length > 0) setExpanded(true);

    // Detect in-progress token for popover
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const detected = detectToken(newValue, cursorPos);
    if (detected) {
      const matched = getSuggestions(detected, suggestionData);
      setSuggestions(matched);
      setSelectedSuggestion(0);
    } else {
      setSuggestions([]);
    }
  }, [suggestionData, expanded]);

  // Insert a token from the popover
  const insertToken = useCallback((suggestion: SuggestionItem) => {
    const input = inputRef.current;
    const cursorPos = input?.selectionStart ?? title.length;
    const before = title.slice(0, cursorPos);
    const after = title.slice(cursorPos);

    // Find the start of the current token trigger
    let triggerStart = before.length;
    while (triggerStart > 0 && before[triggerStart - 1] !== ' ') {
      triggerStart--;
    }

    // /today is special — toggles metadata, removes trigger text
    if (suggestion.type === 'slash' && suggestion.value === '/today') {
      setMetadata((prev) => ({ ...prev, today: !prev.today }));
      setTitle((before.slice(0, triggerStart) + after).trim());
      setExpanded(true);
      setSuggestions([]);
      return;
    }

    // Build the insert text based on token type
    let insert: string;
    if (suggestion.type === 'slash') {
      insert = suggestion.value;
    } else if (suggestion.type === 'tag') {
      insert = '#' + suggestion.value.replace(/\s+/g, '-');
    } else if (suggestion.type === 'status') {
      insert = '@' + suggestion.value;
    } else {
      insert = '!!' + suggestion.value;
    }

    const newTitle = before.slice(0, triggerStart) + insert + ' ' + after;
    setTitle(newTitle);
    setSuggestions([]);

    requestAnimationFrame(() => {
      if (input) {
        const newPos = triggerStart + insert.length + 1;
        input.setSelectionRange(newPos, newPos);
        input.focus();
      }
    });
  }, [title]);

  const handleSubmit = useCallback(async () => {
    const { cleanTitle } = extractTokens(title);
    const trimmed = cleanTitle.trim();
    if (!trimmed || submitting) return;

    const finalMeta = effectiveMetadata;

    setSubmitting(true);
    try {
      const result = await window.quickAdd.createTask({
        title: trimmed,
        status: finalMeta.status,
        priority: finalMeta.priority,
        today: finalMeta.today,
        dueDate: finalMeta.dueDate,
        tags: finalMeta.tags,
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
  }, [title, effectiveMetadata, submitting, reset]);

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
        insertToken(suggestions[selectedSuggestion]);
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
  }, [suggestions, selectedSuggestion, insertToken, handleSubmit, reset, expanded]);

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
                    PRIORITY_DOT[effectiveMetadata.priority],
                  ].join(' ')}
                />
              </div>

          {/* Input with overlay mirror */}
          <div className="relative flex-1 min-w-0">
            {/* Mirror div — highlighted text */}
            <div
              className={[
                'absolute inset-0 pointer-events-none',
                'text-foreground text-[13px] font-sans',
                'whitespace-pre overflow-hidden',
                'flex items-center',
              ].join(' ')}
              aria-hidden="true"
            >
              <TokenHighlightOverlay text={title} />
            </div>
            {/* Real input — transparent text, visible caret */}
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              placeholder="Add to inbox..."
              autoFocus
              aria-autocomplete={suggestions.length > 0 ? 'list' : undefined}
              aria-expanded={suggestions.length > 0 ? true : undefined}
              className={[
                'w-full bg-transparent text-transparent caret-[var(--foreground)] text-[13px]',
                'placeholder:text-muted-foreground/50',
                'outline-none border-none',
                'font-sans',
              ].join(' ')}
            />
          </div>

          {/* Right badges — show set metadata as compact badges */}
          <div className="ml-auto flex items-center gap-1">
            {dueDateLabel && !expanded && (
              <span className="inline-flex h-5 items-center rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[10px] text-muted-foreground">
                {dueDateLabel}
              </span>
            )}
            {effectiveMetadata.today && !expanded && (
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
              <Key k="tab" size="xs" />
            )}
            <Key k="enter" size="xs" />
          </button>
        </div>

        {/* Token popover */}
        <TokenPopover
          suggestions={suggestions}
          selectedIndex={selectedSuggestion}
          onSelect={insertToken}
        />

        {/* Metadata row — matches InlineTaskInput design */}
        {expanded && (
          <div
            className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono text-muted-foreground border-t border-border/40 mx-1"
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
              className={[SEGMENT, effectiveMetadata.priority === 'none' && SEGMENT_EMPTY].filter(Boolean).join(' ')}
              aria-label={`Priority: ${effectiveMetadata.priority} — click to cycle`}
            >
              {effectiveMetadata.priority !== 'none' && (
                <span
                  className={['mr-1 inline-block size-1.5 rounded-full', PRIORITY_DOT[effectiveMetadata.priority]].join(' ')}
                />
              )}
              {PRIORITY_LABEL[effectiveMetadata.priority]}
            </button>

            <span aria-hidden="true" className="text-border select-none">&middot;</span>

            {/* Due date picker */}
            <QuickAddDueDatePicker
              dueDate={effectiveMetadata.dueDate}
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
              className={[SEGMENT, !effectiveMetadata.today && SEGMENT_EMPTY].filter(Boolean).join(' ')}
              aria-label={effectiveMetadata.today ? 'Remove from today' : 'Add to today'}
              aria-pressed={effectiveMetadata.today}
            >
              <Bookmark
                aria-hidden="true"
                className="mr-0.5 size-3"
                fill={effectiveMetadata.today ? 'currentColor' : 'none'}
              />
              today
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
