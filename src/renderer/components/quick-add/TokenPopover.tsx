import { useEffect, useRef } from 'react';
import type { SuggestionItem } from './slashCommands';

type Props = {
  suggestions: SuggestionItem[];
  selectedIndex: number;
  onSelect: (suggestion: SuggestionItem) => void;
};

export function TokenPopover({ suggestions, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      className={[
        'absolute left-3 right-3 top-[52px] z-50',
        'rounded-lg border border-border/70 bg-background/95 backdrop-blur-xl shadow-lg',
        'overflow-hidden',
      ].join(' ')}
    >
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Token suggestions"
        className="py-1"
      >
        {suggestions.map((s, i) => (
          <li
            key={`${s.type}-${s.value}-${i}`}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(s);
            }}
            className={[
              'flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer',
              i === selectedIndex
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            ].join(' ')}
          >
            {/* Slash menu: show trigger + label + shorthand */}
            {s.type === 'slash' || (s.shorthand && !s.isCreate) ? (
              <>
                <span className="font-mono text-[11px] text-muted-foreground/70 w-16">
                  {s.value}
                </span>
                <span>{s.label}</span>
                {s.shorthand && (
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground/50">
                    {s.shorthand}
                  </span>
                )}
                {s.detail && !s.shorthand && (
                  <span className="ml-auto text-[10px] text-muted-foreground/50">
                    {s.detail}
                  </span>
                )}
              </>
            ) : (
              <>
                {/* Tag/Status/Priority items */}
                {s.isCreate && (
                  <span className="text-[11px] text-muted-foreground/50">Create</span>
                )}
                <span>{s.label}</span>
                {s.detail && !s.isCreate && (
                  <span className="ml-auto text-[10px] text-muted-foreground/50">
                    {s.detail}
                  </span>
                )}
                {s.shorthand && (
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground/50">
                    {s.shorthand}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
