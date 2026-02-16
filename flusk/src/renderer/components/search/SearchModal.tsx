import { useCallback, useEffect, useRef } from 'react';

import { useFocusTrap } from '../../hooks/useFocusTrap';

import { Search } from 'lucide-react';

import type { SearchResultItem } from '../../../types/ipc';
import {
  selectSearchIsOpen,
  selectSearchQuery,
  selectSearchIsSearching,
  selectSearchTotal,
  selectSearchError,
  selectSearchSelectedIndex,
  useSearchStore,
} from '../../stores/searchStore';
import { useAppStore } from '../../stores/appStore';
import { useTaskStore } from '../../stores/taskStore';
import { resolveSearchResultView } from './searchRouting';

const DEBOUNCE_MS = 250;

const PRIORITY_DOT: Record<string, string> = {
  none: 'bg-foreground/10',
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-rose-500',
};

export const SearchModal = () => {
  const isOpen = useSearchStore(selectSearchIsOpen);
  const query = useSearchStore(selectSearchQuery);
  const isSearching = useSearchStore(selectSearchIsSearching);
  const total = useSearchStore(selectSearchTotal);
  const error = useSearchStore(selectSearchError);
  const selectedIndex = useSearchStore(selectSearchSelectedIndex);
  const results = useSearchStore((s) => s.results);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const close = useSearchStore((s) => s.close);
  const selectNext = useSearchStore((s) => s.selectNext);
  const selectPrevious = useSearchStore((s) => s.selectPrevious);
  const getSelectedResult = useSearchStore((s) => s.getSelectedResult);

  const setView = useAppStore((s) => s.setView);
  const selectTask = useTaskStore((s) => s.selectTask);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) return;
    debounceRef.current = setTimeout(() => void search(), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, isOpen, search]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const navigateToResult = useCallback(
    (result: SearchResultItem) => {
      close();
      setView(resolveSearchResultView(result));
      selectTask(result.id);
    },
    [close, selectTask, setView],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectNext(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); selectPrevious(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const r = getSelectedResult();
        if (r) navigateToResult(r);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    },
    [close, getSelectedResult, navigateToResult, selectNext, selectPrevious],
  );

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div
      className="no-drag absolute inset-0 z-50 flex justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search tasks"
        className="mt-24 h-fit w-full max-w-sm rounded-md border border-border bg-background shadow-[0_8px_40px_-4px_rgba(0,0,0,0.35)]"
      >
        {/* Input */}
        <div className="flex h-9 items-center gap-2 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            autoComplete="off"
            spellCheck={false}
            className="h-full flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          {hasQuery && (
            <span className="text-[10px] tabular-nums text-muted-foreground/50">
              {isSearching ? '...' : total}
            </span>
          )}
        </div>

        {/* Results */}
        {(hasQuery || error) && (
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto border-t border-border py-0.5"
          >
            {error ? (
              <p className="px-2.5 py-1.5 text-[11px] text-destructive">{error}</p>
            ) : !isSearching && total === 0 ? (
              <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground/50">No results</p>
            ) : (
              results.map((result, i) => {
                const isSelected = i === selectedIndex;
                const isDone = result.status === 'done';
                const priority = result.priority ?? 'none';

                return (
                  <button
                    key={result.id}
                    type="button"
                    data-selected={isSelected}
                    className={`flex w-full items-center gap-2 px-2.5 py-1 text-left ${
                      isSelected ? 'bg-accent' : ''
                    } ${isDone ? 'opacity-40' : ''}`}
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => useSearchStore.setState({ selectedIndex: i })}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[priority] ?? PRIORITY_DOT.none}`} />
                    <span className={`min-w-0 flex-1 truncate text-[13px] text-foreground ${isDone ? 'line-through' : ''}`}>
                      {result.title}
                    </span>
                    {result.client && (
                      <span className="shrink-0 truncate text-[10px] text-muted-foreground/40">
                        {result.client}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
