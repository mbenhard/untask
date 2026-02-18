import React, { useEffect, useState } from 'react';

import { AppShell } from './components/layout/AppShell';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';

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

  render(): React.ReactNode {
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

type BootstrapStatus = 'loading' | 'onboarding' | 'ready';

const AppRoot = () => {
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>('loading');

  useEffect(() => {
    const untask = window.untask;
    if (!untask) {
      // In dev/test without preload, skip onboarding
      setBootstrapStatus('ready');
      return;
    }

    untask.settings
      .getBootstrapCompleted()
      .then((result) => {
        setBootstrapStatus(result.completed ? 'ready' : 'onboarding');
      })
      .catch(() => {
        // On error, skip onboarding to avoid blocking the app
        setBootstrapStatus('ready');
      });
  }, []);

  if (bootstrapStatus === 'loading') {
    return null;
  }

  if (bootstrapStatus === 'onboarding') {
    return (
      <OnboardingFlow
        onComplete={() => setBootstrapStatus('ready')}
      />
    );
  }

  return <AppShell />;
};

const App = () => (
  <AppErrorBoundary>
    <AppRoot />
  </AppErrorBoundary>
);

export default App;
