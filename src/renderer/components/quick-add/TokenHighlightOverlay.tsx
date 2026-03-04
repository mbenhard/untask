import { useMemo } from 'react';
import { highlightRanges, type HighlightRange } from './slashCommands';

type Props = {
  text: string;
};

const TOKEN_STYLE_BY_TYPE: Record<HighlightRange['type'], string> = {
  tag: 'bg-emerald-500/20 border-emerald-400/35 text-emerald-100',
  status: 'bg-sky-500/20 border-sky-400/35 text-sky-100',
  due: 'bg-blue-500/18 border-blue-400/35 text-blue-100',
  today: 'bg-cyan-500/18 border-cyan-400/35 text-cyan-100',
  priority: 'bg-muted/50 border-border/60 text-foreground',
};

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-rose-500/22 border-rose-400/40 text-rose-100',
  medium: 'bg-amber-500/22 border-amber-400/40 text-amber-100',
  low: 'bg-emerald-500/22 border-emerald-400/40 text-emerald-100',
};

function getTokenStyle(range: HighlightRange, text: string): string {
  if (range.type === 'priority') {
    const token = text.slice(range.start, range.end);
    const bangMatch = token.match(/!!([1-3])/);
    if (bangMatch) {
      const map: Record<string, string> = { '1': 'high', '2': 'medium', '3': 'low' };
      return PRIORITY_STYLE[map[bangMatch[1]]] ?? TOKEN_STYLE_BY_TYPE.priority;
    }
    const slashMatch = token.match(/\/p\s+(high|medium|med|low)/i);
    if (slashMatch) {
      const val = slashMatch[1].toLowerCase() === 'med' ? 'medium' : slashMatch[1].toLowerCase();
      return PRIORITY_STYLE[val] ?? TOKEN_STYLE_BY_TYPE.priority;
    }
  }
  return TOKEN_STYLE_BY_TYPE[range.type];
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
    const tokenStyle = getTokenStyle(range, text);
    segments.push(
      <span
        key={`token-${range.start}`}
        className={`rounded px-0.5 -mx-0.5 border font-medium ${tokenStyle}`}
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
