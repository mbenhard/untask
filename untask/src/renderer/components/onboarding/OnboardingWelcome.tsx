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
    <div className="onboarding-dot-grid relative flex flex-col items-center gap-8 text-center">
      <BirdMascot size={52} animated variant="float" className="text-foreground/80" />

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Untask</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A quiet place to get things done.
        </p>
      </div>

      <Button onClick={onNext} className="w-full">
        Get Started
      </Button>

      <div className="flex items-center justify-center gap-4 text-muted-foreground/50">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
          <span className="text-[10px]">Continue</span>
        </span>
      </div>
    </div>
  );
};
