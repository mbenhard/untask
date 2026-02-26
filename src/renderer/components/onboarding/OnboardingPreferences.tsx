import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { motion, useReducedMotion } from 'framer-motion';

import type { DockMode } from '../../../types/ipc';
import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import type { OnboardingNavProps } from './OnboardingFlow';
import { getUntask } from '../../lib/untask';
import { useTheme } from '../providers/ThemeProvider';
import { Button } from '../ui/button';

type ThemeChoice = 'dark' | 'light';

type OnboardingPreferencesProps = {
  onNext: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingPreferences = ({ onNext, nav, isActive }: OnboardingPreferencesProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(resolvedTheme);
  const [dockMode, setDockMode] = useState<DockMode>('normal');
  const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setThemeChoice(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const load = async () => {
      try {
        const [dockResult, launchResult] = await Promise.all([
          getUntask().app.getDockMode(),
          getUntask().app.getLaunchAtLogin(),
        ]);
        setDockMode(dockResult.mode);
        setLaunchAtLoginEnabled(launchResult.enabled);
      } catch {
        // Non-fatal.
      }
    };

    void load();
  }, []);

  const applyTheme = useCallback(
    (next: ThemeChoice) => {
      setThemeChoice(next);
      const doc = document as Document & {
        startViewTransition?: (callback: () => void) => void;
      };

      if (!doc.startViewTransition) {
        setTheme(next);
        return;
      }

      doc.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });
    },
    [setTheme],
  );

  const handleContinue = useCallback(async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setHint(null);

    try {
      await getUntask().app.setDockMode(dockMode);
    } catch {
      setHint('Could not save dock preference. You can change this later in Settings.');
    }

      try {
      const launchResult = await getUntask().app.setLaunchAtLogin(launchAtLoginEnabled);
      if (launchResult.error) {
        // Dev builds can't register login items — suppress the hint silently.
        if (launchAtLoginEnabled && launchResult.applied === false) {
          // Only show a hint in production if it genuinely failed.
          const isDevError = launchResult.error.includes('unavailable in this runtime');
          if (!isDevError) {
            setHint('Launch-at-login saved. It will take effect once Untask is installed.');
          }
        }
      }
    } catch {
      setHint('Could not save launch-at-login preference. You can change this later in Settings.');
    }

    setIsSaving(false);
    onNext();
  }, [dockMode, isSaving, launchAtLoginEnabled, onNext]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isActive) return;
      if (event.key !== 'Enter' || isSaving) {
        return;
      }
      event.preventDefault();
      void handleContinue();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleContinue, isSaving, isActive]);

  const Wrapper = prefersReducedMotion ? 'div' : motion.div;
  const Card = prefersReducedMotion ? 'div' : motion.div;
  const staggerProps = prefersReducedMotion
    ? {}
    : { variants: onboardingStaggerContainer, initial: 'enter', animate: isActive ? 'center' : 'enter' };
  const cardProps = prefersReducedMotion ? {} : { variants: onboardingCardVariants };

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
          THEME
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={themeChoice === 'dark'}
            onClick={() => applyTheme('dark')}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              themeChoice === 'dark'
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Dark
          </button>
          <button
            type="button"
            aria-pressed={themeChoice === 'light'}
            onClick={() => applyTheme('light')}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              themeChoice === 'light'
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Light
          </button>
        </div>
      </Card>

      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
          DOCK
        </span>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['normal', 'Normal'],
            ['dock-only', 'Dock only'],
            ['menu-bar-only', 'Menu bar only'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={dockMode === value}
              onClick={() => setDockMode(value)}
              className={[
                'rounded-md border px-3 py-1.5 text-[12px] transition-colors',
                dockMode === value
                  ? 'border-foreground/40 bg-accent text-foreground'
                  : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {dockMode === 'normal'
            ? 'Show in dock and menu bar.'
            : dockMode === 'dock-only'
              ? 'Show in dock. Hide menu bar icon.'
              : 'Hide from dock. Show in menu bar only.'}
        </p>
      </Card>

      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
          LAUNCH AT LOGIN
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={launchAtLoginEnabled}
            onClick={() => setLaunchAtLoginEnabled(true)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              launchAtLoginEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Enable
          </button>
          <button
            type="button"
            aria-pressed={!launchAtLoginEnabled}
            onClick={() => setLaunchAtLoginEnabled(false)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              !launchAtLoginEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Skip
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Start Untask automatically when you log in.
        </p>
      </Card>

      {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}

      <Card {...cardProps} className="flex items-center justify-center gap-3 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={nav.onBack}
          disabled={!nav.canGoBack}
          className="h-8 border-dashed border-border/60 bg-transparent px-4 text-[12px] hover:bg-accent/50"
        >
          Back
        </Button>
        <Button onClick={() => void handleContinue()} disabled={isSaving} size="sm" className="h-8 px-6 text-[12px]">
          {isSaving ? 'Saving...' : "Let's go"}
        </Button>
      </Card>
    </Wrapper>
  );
};
