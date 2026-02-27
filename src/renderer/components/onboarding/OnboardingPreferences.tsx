import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import type { OnboardingNavProps } from './OnboardingFlow';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { useTheme } from '../providers/ThemeProvider';
import { Key } from '../ui/Key';
import {
  SectionLabel,
  StepNav,
  TogglePair,
  useOnboardingAnimation,
  useOnboardingEnterKey,
} from './onboarding-shared';

type ThemeChoice = 'dark' | 'light' | 'system';

type OnboardingPreferencesProps = {
  onNext: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingPreferences = ({ onNext, nav, isActive }: OnboardingPreferencesProps) => {
  const { theme, setTheme } = useTheme();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(theme);
  const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const { Wrapper, Card, staggerProps, cardProps } = useOnboardingAnimation(isActive);

  useEffect(() => {
    setThemeChoice(theme);
  }, [theme]);

  useEffect(() => {
    const load = async () => {
      try {
        const launchResult = await getUntask().app.getLaunchAtLogin();
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

    // Silently apply dock mode default — not exposed in onboarding
    try {
      await getUntask().app.setDockMode('normal');
    } catch {
      // Non-fatal.
    }

    try {
      const launchResult = await getUntask().app.setLaunchAtLogin(launchAtLoginEnabled);
      if (launchResult.error) {
        if (launchAtLoginEnabled && launchResult.applied === false) {
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
  }, [isSaving, launchAtLoginEnabled, onNext]);

  useOnboardingEnterKey(
    () => void handleContinue(),
    isActive,
    { disabled: isSaving },
  );

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      {/* THEME */}
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel>Theme</SectionLabel>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={themeChoice === t}
              onClick={() => applyTheme(t)}
              className={cn(
                'h-8 flex-1 rounded-md border px-3 text-[12px] capitalize transition-[background-color,color] outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                themeChoice === t
                  ? 'border-foreground/40 bg-accent text-foreground'
                  : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </Card>

      {/* LAUNCH AT LOGIN */}
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel>Launch at login</SectionLabel>
        <TogglePair
          value={launchAtLoginEnabled}
          onChange={setLaunchAtLoginEnabled}
          enableLabel="Enable"
          disableLabel="Off"
        />
        <p className="mt-2 text-[12px] text-muted-foreground">
          Start Untask automatically when you log in.
        </p>
      </Card>

      {/* SHORTCUTS */}
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel className="mb-2">Shortcuts</SectionLabel>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center gap-1">
                <Key k="cmd" />
                <Key k="shift" />
                <Key>Space</Key>
              </div>
              <span className="text-[12px] text-muted-foreground">Summon Untask from anywhere</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center gap-1">
                <Key k="cmd" />
                <Key k="shift" />
                <Key>Q</Key>
              </div>
              <span className="text-[12px] text-muted-foreground">Quick-add a task</span>
            </div>
          </div>
        <p className="mt-2.5 text-[11px] text-muted-foreground/60">Customizable in Settings → Shortcuts</p>
      </Card>

      {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}

      <Card {...cardProps} className="flex items-center justify-center pt-3">
        <StepNav
          nav={nav}
          onContinue={() => void handleContinue()}
          continueDisabled={isSaving}
          continueLabel="Finish setup"
        />
      </Card>
    </Wrapper>
  );
};
