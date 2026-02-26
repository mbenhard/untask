import { useEffect } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import { BirdMascot } from '../chat/BirdMascot';
import { Button } from '../ui/button';

type OnboardingWelcomeProps = {
  onNext: () => void;
  isActive: boolean;
};

export const OnboardingWelcome = ({ onNext, isActive }: OnboardingWelcomeProps) => {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
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
    <Wrapper {...staggerProps} className="flex flex-col items-center gap-5">
      <Card {...cardProps} className="bg-background px-6 py-4">
        <BirdMascot size={36} animated variant="wobble" className="text-muted-foreground" />
      </Card>

      <Card {...cardProps} className="flex flex-col items-center gap-3 bg-background px-4 text-center">
        <h1 className="text-5xl font-normal tracking-tight text-foreground">Untask</h1>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          A quiet place to get things done.
        </p>
      </Card>

      <Card {...cardProps} className="flex items-center gap-3 pt-2">
        <Button onClick={onNext} size="sm" className="h-8 px-6 text-[12px]">
          Get Started
        </Button>
      </Card>
    </Wrapper>
  );
};
