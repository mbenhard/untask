import React from 'react';

import { DragBar } from './components/DragBar';
import { useBootstrapState } from './hooks/useBootstrapState';

const App = (): React.JSX.Element => {
  const { status, loading } = useBootstrapState();

  return (
    <div className="flex h-full w-full flex-col rounded-[var(--radius-window)] border border-border bg-background">
      <DragBar />
      <main className="grid gap-2 p-6">
        <h1 className="text-[15px] font-semibold text-foreground">Flusk</h1>
        <p className="text-[13px] text-muted-foreground">
          Personal assistant runtime initialized.
        </p>
        <p className="text-[13px] text-muted-foreground">
          IPC bootstrap:
          <strong className="text-foreground">
            {loading ? ' checking...' : ` ${status}`}
          </strong>
        </p>
      </main>
    </div>
  );
};

export default App;
