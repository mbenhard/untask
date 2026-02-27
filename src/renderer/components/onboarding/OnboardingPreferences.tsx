import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import type { OnboardingNavProps } from './OnboardingFlow';
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

type ThemeChoice = 'dark' | 'light';

type OnboardingPreferencesProps = {
  onNext: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingPreferences = ({ onNext, nav, isActive }: OnboardingPreferencesProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(resolvedTheme);
  const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const { Wrapper, Card, staggerProps, cardProps } = useOnboardingAnimation(isActive);

  useEffect(() => {
    setThemeChoice(resolvedTheme);
  }, [resolvedTheme]);

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

      {/* THEME */}
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel>Theme</SectionLabel>
        <TogglePair
          value={themeChoice === 'dark'}
          onChange={(isDark) => applyTheme(isDark ? 'dark' : 'light')}
          enableLabel="Dark"
          disableLabel="Light"
        />
      </Card>

      {/* LAUNCH AT LOGIN */}
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel>Launch at login</SectionLabel>
        <TogglePair
          value={launchAtLoginEnabled}
          onChange={setLaunchAtLoginEnabled}
          enableLabel="Enable"
          disableLabel="Skip"
        />
        <p className="mt-2 text-[12px] text-muted-foreground">
          Start Untask automatically when you log in.
        </p>
      </Card>

      {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}

      <Card {...cardProps} className="flex items-center justify-center pt-3">
        <StepNav
          nav={nav}
          onContinue={() => void handleContinue()}
          continueDisabled={isSaving}
          continueLabel={isSaving ? 'Saving...' : 'Finish setup'}
        />
      </Card>
    </Wrapper>
  );
};
