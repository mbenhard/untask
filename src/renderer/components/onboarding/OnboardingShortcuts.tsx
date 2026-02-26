import { useEffect } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import type { OnboardingNavProps } from './OnboardingFlow';
import { Button } from '../ui/button';

type OnboardingShortcutsProps = {
  onNext: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingShortcuts = ({ onNext, nav, isActive }: OnboardingShortcutsProps) => {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isActive) return;
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      onNext();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext, isActive]);

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
          GLOBAL SHORTCUTS
        </span>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Cmd
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Shift
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Space
              </span>
            </div>
            <span className="text-[12px] text-muted-foreground">Summon Untask from anywhere</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Cmd
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Shift
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Q
              </span>
            </div>
            <span className="text-[12px] text-muted-foreground">Quick add a task</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground/70">Customizable in Settings → Shortcuts</p>
      </Card>

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
        <Button onClick={onNext} size="sm" className="h-8 px-6 text-[12px]">
          Continue
        </Button>
      </Card>
    </Wrapper>
  );
};
