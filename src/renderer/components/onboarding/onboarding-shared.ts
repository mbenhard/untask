import { Fragment, type RefObject, createElement, useCallback, useEffect } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import type { OnboardingNavProps } from './OnboardingFlow';

export { COMMUNICATION_OPTIONS, ROLE_OPTIONS, type CommunicationStyle, type Role } from '../../lib/identity';

// ── Hooks ──

export function useOnboardingAnimation(isActive: boolean) {
  const prefersReducedMotion = useReducedMotion();
  const Wrapper = prefersReducedMotion ? 'div' : motion.div;
  const Card = prefersReducedMotion ? 'div' : motion.div;
  const staggerProps = prefersReducedMotion
    ? {}
    : { variants: onboardingStaggerContainer, initial: 'enter', animate: isActive ? 'center' : 'enter' };
  const cardProps = prefersReducedMotion ? {} : { variants: onboardingCardVariants };

  return { Wrapper, Card, staggerProps, cardProps } as const;
}

export function useOnboardingEnterKey(
  handler: () => void,
  isActive: boolean,
  options?: { disabled?: boolean; ignoreSelector?: string },
) {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isActive) return;
      if (event.key !== 'Enter') return;
      if (options?.disabled) return;

      if (options?.ignoreSelector) {
        const target = event.target as HTMLElement | null;
        if (target?.closest(options.ignoreSelector)) return;
      }

      event.preventDefault();
      stableHandler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stableHandler, isActive, options?.disabled, options?.ignoreSelector]);
}

// ── Components ──

type SectionLabelProps = {
  children: string;
  className?: string;
};

export function SectionLabel({ children, className }: SectionLabelProps) {
  return createElement(
    'span',
    {
      className: cn(
        'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70',
        className,
      ),
    },
    children,
  );
}

type TogglePairProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  enableLabel: string;
  disableLabel: string;
  enableRef?: RefObject<HTMLButtonElement | null>;
};

export function TogglePair({ value, onChange, enableLabel, disableLabel, enableRef }: TogglePairProps) {
  return createElement(
    'div',
    { className: 'flex gap-2' },
    createElement(
      'button',
      {
        ref: enableRef,
        type: 'button',
        'aria-pressed': value,
        onClick: () => onChange(true),
        className: cn(
          'h-8 flex-1 rounded-md border px-3 text-[12px] transition-[background-color,color]',
          value
            ? 'border-foreground/40 bg-accent text-foreground'
            : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
        ),
      },
      enableLabel,
    ),
    createElement(
      'button',
      {
        type: 'button',
        'aria-pressed': !value,
        onClick: () => onChange(false),
        className: cn(
          'h-8 flex-1 rounded-md border px-3 text-[12px] transition-[background-color,color]',
          !value
            ? 'border-foreground/40 bg-accent text-foreground'
            : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
        ),
      },
      disableLabel,
    ),
  );
}

type StepNavProps = {
  nav: OnboardingNavProps;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
};

export function StepNav({
  nav,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled,
  onSkip,
  skipLabel = 'Skip',
}: StepNavProps) {
  const buttons = createElement(
    'div',
    { className: 'flex items-center gap-3' },
    createElement(
      Button,
      {
        type: 'button',
        variant: 'outline',
        size: 'sm',
        onClick: nav.onBack,
        disabled: !nav.canGoBack,
        className: 'h-8 border-dashed border-border/60 bg-transparent px-4 text-[12px] hover:bg-accent/50',
      },
      'Back',
    ),
    createElement(
      Button,
      {
        onClick: onContinue,
        disabled: continueDisabled,
        size: 'sm',
        className: 'h-8 px-6 text-[12px]',
      },
      continueLabel,
    ),
  );

  if (onSkip) {
    return createElement(
      Fragment,
      null,
      buttons,
      createElement(
        'button',
        {
          type: 'button',
          onClick: onSkip,
          className: 'py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground',
        },
        skipLabel,
      ),
    );
  }

  return buttons;
}
