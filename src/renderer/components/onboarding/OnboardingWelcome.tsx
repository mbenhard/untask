import { useEffect } from 'react';

import { BirdMascot } from '../chat/BirdMascot';
import { Button } from '../ui/button';

type OnboardingWelcomeProps = {
  onNext: () => void;
};

export const OnboardingWelcome = ({ onNext }: OnboardingWelcomeProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext]);

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="onboarding-mascot-stage flex min-h-[300px] items-center justify-center rounded-md border border-dashed border-border/60 bg-accent/20 p-6">
        <BirdMascot size={88} animated variant="wobble" className="text-foreground/80" />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Untask</h1>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          A quiet place to get things done.
        </p>
        <span className="rounded-full border border-border/40 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          v0.x.x
        </span>
      </div>

      <Button onClick={onNext} size="sm" className="mt-auto h-8 w-full text-[12px]">
        Get Started
      </Button>
    </div>
  );
};
