import React from 'react';

import { AppShell } from './components/layout/AppShell';

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[renderer] unhandled render error', error, info.componentStack);
  }

  render(): JSX.Element {
    if (!this.state.error) {
      return <>{this.props.children}</>;
    }

    return (
      <main className="flex h-full w-full items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-lg border border-destructive/40 bg-card p-4">
          <h1 className="text-sm font-semibold text-foreground">Renderer Error</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
        </div>
      </main>
    );
  }
}

const App = (): JSX.Element => (
  <AppErrorBoundary>
    <AppShell />
  </AppErrorBoundary>
);

export default App;
