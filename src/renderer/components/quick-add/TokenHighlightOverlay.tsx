import { useMemo } from 'react';
import { highlightRanges } from './slashCommands';

type Props = {
  text: string;
};

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
    segments.push(
      <span
        key={`token-${range.start}`}
        className="rounded-[4px] text-muted-foreground bg-foreground/7 ring-[3px] ring-foreground/7"
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
