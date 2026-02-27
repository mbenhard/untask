import React, { useCallback, useEffect, useRef, useState } from 'react';

import { MotionConfig, motion, useReducedMotion } from 'framer-motion';

import { AppShell } from './components/layout/AppShell';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { AppBootstrapSkeleton } from './components/ui/loadingShells';
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

export const AppRoot = () => {
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(() =>
    localStorage.getItem(BOOTSTRAP_DONE_KEY) === '1' ? 'ready' : 'loading',
  );
  const [isTransitioningToApp, setIsTransitioningToApp] = useState(false);
  const [isResettingToOnboarding, setIsResettingToOnboarding] = useState(false);
  const setAiEnabled = useAppStore((state) => state.setAiEnabled);
  const prefersReducedMotion = useReducedMotion();
  const transitionFallbackRef = useRef<number | null>(null);

  const clearTransitionFallback = useCallback(() => {
    if (transitionFallbackRef.current !== null) {
      window.clearTimeout(transitionFallbackRef.current);
      transitionFallbackRef.current = null;
    }
  }, []);

  const finishBootstrapTransition = useCallback(() => {
    clearTransitionFallback();
    setIsTransitioningToApp(false);
    setBootstrapStatus('ready');
  }, [clearTransitionFallback]);

  const finishResetTransition = useCallback(() => {
    clearTransitionFallback();
    setIsResettingToOnboarding(false);
  }, [clearTransitionFallback]);

  useEffect(
    () => () => {
      clearTransitionFallback();
    },
    [clearTransitionFallback],
  );

  // Listen for "restart onboarding" from Settings → play reverse transition
  useEffect(() => {
    const handler = () => {
      if (bootstrapStatus !== 'ready' || isResettingToOnboarding) return;

      localStorage.removeItem(BOOTSTRAP_DONE_KEY);
      const untask = window.untask;
      if (untask) {
        void untask.settings.set('app.bootstrap_completed', 'false');
      }

      setIsResettingToOnboarding(true);
      setBootstrapStatus('onboarding');

      const durationMs = prefersReducedMotion ? 80 : 320;
      clearTransitionFallback();
      transitionFallbackRef.current = window.setTimeout(() => {
        finishResetTransition();
      }, durationMs + 80);
    };

    window.addEventListener('untask:restart-onboarding', handler);
    return () => window.removeEventListener('untask:restart-onboarding', handler);
  }, [bootstrapStatus, isResettingToOnboarding, prefersReducedMotion, clearTransitionFallback, finishResetTransition]);

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
    return <AppBootstrapSkeleton />;
  }

  if (bootstrapStatus === 'onboarding') {
    const transitionDurationMs = prefersReducedMotion ? 80 : 320;

    const handleOnboardingComplete = async () => {
      if (isTransitioningToApp) {
        return;
      }

      try {
        // Sync AI enabled setting from onboarding to store
        const untask = window.untask;
        if (untask) {
          const aiEnabledResult = await untask.settings.getAiEnabled();
          setAiEnabled(aiEnabledResult.enabled);
        }
      } catch {
        // Use default if loading fails
      }

      localStorage.setItem(BOOTSTRAP_DONE_KEY, '1');
      setIsTransitioningToApp(true);

      clearTransitionFallback();
      transitionFallbackRef.current = window.setTimeout(() => {
        finishBootstrapTransition();
      }, transitionDurationMs + 80);
    };

    return (
      <div className="relative h-full w-full overflow-hidden bg-background">
        {/* App fading in (onboarding → app) */}
        {isTransitioningToApp ? (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.08 : 0.28, ease: 'easeOut' }}
          >
            <AppShell />
          </motion.div>
        ) : null}

        {/* App fading out (app → onboarding reset) */}
        {isResettingToOnboarding ? (
          <motion.div
            className="absolute inset-0 z-10 pointer-events-none"
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: prefersReducedMotion ? 0 : -24 }}
            transition={{ duration: prefersReducedMotion ? 0.08 : 0.28, ease: 'easeOut' }}
            onAnimationComplete={() => finishResetTransition()}
          >
            <AppShell />
          </motion.div>
        ) : null}

        <motion.div
          className={isTransitioningToApp ? 'absolute inset-0 pointer-events-none' : 'h-full w-full'}
          initial={false}
          animate={
            isTransitioningToApp
              ? { opacity: 0, y: prefersReducedMotion ? 0 : -24 }
              : { opacity: 1, y: 0 }
          }
          transition={{ duration: prefersReducedMotion ? 0.08 : 0.28, ease: 'easeOut' }}
          onAnimationComplete={() => {
            if (isTransitioningToApp) {
              finishBootstrapTransition();
            }
          }}
        >
          <OnboardingFlow
            isTransitioningToApp={isTransitioningToApp}
            onComplete={() => {
              void handleOnboardingComplete();
            }}
          />
        </motion.div>
      </div>
    );
  }

  return <AppShell />;
};

const App = () => (
  <AppErrorBoundary>
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={75}>
        <AppRoot />
      </TooltipProvider>
    </MotionConfig>
  </AppErrorBoundary>
);

export default App;
