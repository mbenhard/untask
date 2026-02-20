import React, { useEffect, useState } from 'react';

import { AppShell } from './components/layout/AppShell';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { TooltipProvider } from './components/ui/tooltip';
import { useAppStore } from './stores/appStore';

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

const BOOTSTRAP_DONE_KEY = 'untask-bootstrap-done';

const AppRoot = () => {
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(() =>
    localStorage.getItem(BOOTSTRAP_DONE_KEY) === '1' ? 'ready' : 'loading',
  );
  const setAiEnabled = useAppStore((state) => state.setAiEnabled);

  useEffect(() => {
    const untask = window.untask;
    if (!untask) {
      // In dev/test without preload, skip onboarding
      setBootstrapStatus('ready');
      return;
    }

    // Load AI enabled setting (runs even when bootstrap is cached)
    untask.settings
      .getAiEnabled()
      .then((result) => setAiEnabled(result.enabled))
      .catch(() => setAiEnabled(true));

    // Skip IPC round-trip if we already know onboarding completed
    if (localStorage.getItem(BOOTSTRAP_DONE_KEY) === '1') {
      return;
    }

    untask.settings
      .getBootstrapCompleted()
      .then((result) => {
        if (result.completed) {
          localStorage.setItem(BOOTSTRAP_DONE_KEY, '1');
          setBootstrapStatus('ready');
        } else {
          setBootstrapStatus('onboarding');
        }
      })
      .catch(() => {
        // On error, skip onboarding to avoid blocking the app
        setBootstrapStatus('ready');
      });
  }, [setAiEnabled]);

  if (bootstrapStatus === 'loading') {
    return null;
  }

  if (bootstrapStatus === 'onboarding') {
    return (
      <OnboardingFlow
        onComplete={async () => {
          // Sync AI enabled setting from onboarding to store
          try {
            const untask = window.untask;
            if (untask) {
              const aiEnabledResult = await untask.settings.getAiEnabled();
              setAiEnabled(aiEnabledResult.enabled);
            }
          } catch {
            // Use default if loading fails
          }
          localStorage.setItem(BOOTSTRAP_DONE_KEY, '1');
          setBootstrapStatus('ready');
        }}
      />
    );
  }

  return <AppShell />;
};

const App = () => (
  <AppErrorBoundary>
    <TooltipProvider delayDuration={75}>
      <AppRoot />
    </TooltipProvider>
  </AppErrorBoundary>
);

export default App;
