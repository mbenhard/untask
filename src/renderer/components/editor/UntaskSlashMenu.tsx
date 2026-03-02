import { useEffect, useRef } from 'react';

import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';

import { cn } from '../../lib/utils';

/**
 * Custom slash menu that matches Untask's industrial, compact aesthetic.
 * Replaces BlockNote's default Mantine-based suggestion menu.
 *
 * Keyboard navigation is handled by BlockNote's SuggestionMenuController —
 * this component only renders the visual list.
 */
export const UntaskSlashMenu = ({
  items,
  selectedIndex,
  onItemClick,
  loadingState,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (selectedIndex === undefined || !containerRef.current) return;

    const el = containerRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Group items by their `group` field
  const grouped = new Map<string, DefaultReactSuggestionItem[]>();
  for (const item of items) {
    const group = item.group ?? '';
    const list = grouped.get(group);
    if (list) {
      list.push(item);
    } else {
      grouped.set(group, [item]);
    }
  }

  // Build flat index for data-index mapping
  let flatIndex = 0;

  const isEmpty =
    loadingState === 'loaded' && items.length === 0;

  return (
    <div
      ref={containerRef}
      className="untask-editor-slash-menu min-w-[220px] overflow-y-auto rounded-md border border-border/60 bg-popover/95 p-1 backdrop-blur-sm"
    >
      {loadingState === 'loading-initial' && (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground/50">
          Loading…
        </div>
      )}

      {isEmpty && (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground/50">
          No results
        </div>
      )}

      {Array.from(grouped.entries()).map(([group, groupItems]) => (
        <div key={group}>
          {group && (
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 px-2 pb-1 pt-2">
              {group}
            </div>
          )}

          {groupItems.map((item) => {
            const idx = flatIndex++;
            const isSelected = idx === selectedIndex;

            return (
              <button
                key={item.title}
                type="button"
                data-index={idx}
                className={cn(
                  'untask-editor-slash-item flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors duration-100',
                  isSelected
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => onItemClick?.(item)}
              >
                {item.icon && (
                  <span className="size-5 shrink-0 flex items-center justify-center">
                    {item.icon}
                  </span>
                )}

                <span className="truncate">{item.title}</span>

                {item.subtext && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/50">
                    {item.subtext}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
