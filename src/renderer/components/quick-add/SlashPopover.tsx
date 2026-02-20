import { useEffect, useRef } from 'react';

import type { Suggestion } from './slashCommands';

type Props = {
  suggestions: Suggestion[];
  selectedIndex: number;
  onSelect: (suggestion: Suggestion) => void;
};

export function SlashPopover({ suggestions, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll active option into view
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
        aria-label="Slash commands"
        className="py-1"
      >
        {suggestions.map((s, i) => (
          <li
            key={s.command.type}
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
            <span className="font-mono text-[11px] text-muted-foreground/70">{s.matchText}</span>
            <span>{s.command.label}</span>
            {s.command.hasValue && (
              <span className="ml-auto text-[10px] text-muted-foreground/50">
                {s.command.options ? s.command.options.join(', ') : 'date'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
