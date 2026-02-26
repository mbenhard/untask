import { useEffect, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import type { OnboardingNavProps } from './OnboardingFlow';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type OnboardingBasicsProps = {
  onNext: (name: string, aiEnabled: boolean) => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingBasics = ({ onNext, nav, isActive }: OnboardingBasicsProps) => {
  const [name, setName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const prefersReducedMotion = useReducedMotion();

  const handleContinue = () => {
    onNext(name.trim(), aiEnabled);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isActive) return;
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      handleContinue();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [name, aiEnabled, isActive]);

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
          NAME
        </span>
        <label htmlFor="onboarding-name" className="sr-only">
          What should I call you?
        </label>
        <Input
          id="onboarding-name"
          type="text"
          placeholder="What should I call you?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="h-8 text-[13px]"
        />
      </Card>

      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
          AI ASSISTANT
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={aiEnabled}
            onClick={() => setAiEnabled(true)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              aiEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Enable
          </button>
          <button
            type="button"
            aria-pressed={!aiEnabled}
            onClick={() => setAiEnabled(false)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              !aiEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Skip
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {aiEnabled
            ? 'AI is optional — disable anytime in Settings.'
            : 'No AI. Pure task management. Enable later in Settings.'}
        </p>
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
        <Button onClick={handleContinue} size="sm" className="h-8 px-6 text-[12px]">
          Continue
        </Button>
      </Card>
    </Wrapper>
  );
};
