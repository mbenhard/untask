import React from 'react';

export const DragBar = (): React.JSX.Element => (
  <header className="drag-region flex h-10 items-center justify-between border-b border-border bg-card px-3">
    <span className="text-xs uppercase tracking-wider text-muted-foreground">
      Flusk
    </span>
    <span className="no-drag rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
      Desktop Assistant
    </span>
  </header>
);
