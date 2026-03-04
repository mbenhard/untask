import { useMemo } from 'react';
import { highlightRanges, type HighlightRange } from './slashCommands';

type Props = {
  text: string;
};

const PRIORITY_BG: Record<string, string> = {
  high: 'bg-rose-500/15',
  medium: 'bg-amber-500/15',
  low: 'bg-emerald-500/15',
};

function getTokenBg(range: HighlightRange, text: string): string {
  if (range.type === 'priority') {
    const token = text.slice(range.start, range.end);
    const bangMatch = token.match(/!!([1-3])/);
    if (bangMatch) {
      const map: Record<string, string> = { '1': 'high', '2': 'medium', '3': 'low' };
      return PRIORITY_BG[map[bangMatch[1]]] ?? 'bg-muted/50';
    }
    const slashMatch = token.match(/\/p\s+(high|medium|med|low)/i);
    if (slashMatch) {
      const val = slashMatch[1].toLowerCase() === 'med' ? 'medium' : slashMatch[1].toLowerCase();
      return PRIORITY_BG[val] ?? 'bg-muted/50';
    }
  }
  return 'bg-muted/50';
}

export function TokenHighlightOverlay({ text }: Props) {
  const ranges = useMemo(() => highlightRanges(text), [text]);

  if (ranges.length === 0) {
    return <span>{text}</span>;
  }

  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (cursor < range.start) {
      segments.push(
        <span key={`plain-${cursor}`}>{text.slice(cursor, range.start)}</span>
      );
    }
    const bg = getTokenBg(range, text);
    segments.push(
      <span
        key={`token-${range.start}`}
        className={`${bg} rounded-sm px-0.5 -mx-0.5`}
      >
        {text.slice(range.start, range.end)}
      </span>
    );
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push(
      <span key={`plain-${cursor}`}>{text.slice(cursor)}</span>
    );
  }

  return <>{segments}</>;
}
