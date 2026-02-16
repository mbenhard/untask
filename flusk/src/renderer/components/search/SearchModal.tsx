import { useCallback, useEffect, useRef } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Search, X } from 'lucide-react';

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
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const DEBOUNCE_MS = 300;

export const SearchModal = () => {
  const isOpen = useSearchStore(selectSearchIsOpen);
  const query = useSearchStore(selectSearchQuery);
  const isSearching = useSearchStore(selectSearchIsSearching);
  const total = useSearchStore(selectSearchTotal);
  const error = useSearchStore(selectSearchError);
  const selectedIndex = useSearchStore(selectSearchSelectedIndex);
  const activeResults = useSearchStore((state) => state.activeResults);
  const doneResults = useSearchStore((state) => state.doneResults);
  const setQuery = useSearchStore((state) => state.setQuery);
  const search = useSearchStore((state) => state.search);
  const close = useSearchStore((state) => state.close);
  const selectNext = useSearchStore((state) => state.selectNext);
  const selectPrevious = useSearchStore((state) => state.selectPrevious);
  const getSelectedResult = useSearchStore((state) => state.getSelectedResult);

  const setView = useAppStore((state) => state.setView);
  const exitChatMode = useAppStore((state) => state.exitChatMode);
  const selectTask = useTaskStore((state) => state.selectTask);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefersReducedMotion = useReducedMotion();

  const transition = prefersReducedMotion
    ? { duration: 0.12, ease: 'easeOut' as const }
    : { duration: 0.2, ease: 'easeOut' as const };

  const overlayVariants = prefersReducedMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 } };

  // Autofocus input when modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length === 0) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      void search();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, isOpen, search]);

  const navigateToResult = useCallback(
    (result: SearchResultItem) => {
      close();
      exitChatMode();

      if (result.status === 'done') {
        setView('projects');
      } else {
        setView('today');
      }

      selectTask(result.id);
    },
    [close, exitChatMode, selectTask, setView],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectNext();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectPrevious();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = getSelectedResult();
        if (selected) {
          navigateToResult(selected);
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    },
    [close, getSelectedResult, navigateToResult, selectNext, selectPrevious],
  );

  const renderResult = (
    result: SearchResultItem,
    flatIndex: number,
  ) => {
    const isSelected = flatIndex === selectedIndex;

    return (
      <button
        key={result.id}
        type="button"
        className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
          isSelected
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50'
        }`}
        onClick={() => navigateToResult(result)}
        onMouseEnter={() =>
          useSearchStore.setState({ selectedIndex: flatIndex })
        }
      >
        <p className="truncate text-sm font-medium text-foreground">
          {result.title}
        </p>
        {result.client ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {result.client}
          </p>
        ) : null}
        {result.snippet ? (
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: result.snippet }}
          />
        ) : null}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="search-modal"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1 },
          }}
          transition={transition}
          className="no-drag absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks..."
              className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          {/* Results */}
          <motion.div
            variants={overlayVariants}
            className="flex-1 overflow-y-auto px-4 py-3"
          >
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
                {error}
              </p>
            ) : null}

            {isSearching ? (
              <p className="text-sm text-muted-foreground">Searching...</p>
            ) : null}

            {!isSearching && query.trim().length > 0 && total === 0 ? (
              <p className="text-sm text-muted-foreground">No results found.</p>
            ) : null}

            {!isSearching && query.trim().length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Type to search across all tasks.
              </p>
            ) : null}

            {activeResults.length > 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Active ({activeResults.length})
                </p>
                <div className="space-y-1">
                  {activeResults.map((result, index) =>
                    renderResult(result, index),
                  )}
                </div>
              </div>
            ) : null}

            {doneResults.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Done ({doneResults.length})
                </p>
                <div className="space-y-1">
                  {doneResults.map((result, index) =>
                    renderResult(result, activeResults.length + index),
                  )}
                </div>
              </div>
            ) : null}
          </motion.div>

          {/* Footer */}
          {total > 0 ? (
            <footer className="border-t border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">
                {total} result{total !== 1 ? 's' : ''} &middot; Arrow keys to
                navigate &middot; Enter to select
              </p>
            </footer>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
