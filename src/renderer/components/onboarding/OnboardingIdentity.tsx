import { useCallback, useEffect, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import type { OnboardingNavProps } from './OnboardingFlow';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type Role = 'freelancer' | 'developer' | 'student' | 'creative' | 'other';
type CommunicationStyle = 'direct' | 'friendly' | 'professional';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'developer', label: 'Developer' },
  { value: 'student', label: 'Student' },
  { value: 'creative', label: 'Creative' },
  { value: 'other', label: 'Other' },
];

const COMMUNICATION_OPTIONS: { value: CommunicationStyle; label: string; hint: string }[] = [
  { value: 'direct', label: 'Direct', hint: 'Short.' },
  { value: 'friendly', label: 'Friendly', hint: 'Warm.' },
  { value: 'professional', label: 'Professional', hint: 'Thorough.' },
];

const buildIdentityString = (
  userName: string,
  role: Role | null,
  style: CommunicationStyle | null,
  focus: string,
): string => {
  const parts: string[] = [];

  if (userName.trim().length > 0) {
    parts.push(`The user's name is ${userName.trim()}.`);
  }

  if (role && role !== 'other') {
    const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label.toLowerCase() ?? role;
    parts.push(`They are a ${roleLabel}.`);
  }

  if (style) {
    const styleLabel = COMMUNICATION_OPTIONS.find((o) => o.value === style)?.label.toLowerCase() ?? style;
    parts.push(`They prefer ${styleLabel} communication.`);
  }

  if (focus.trim().length > 0) {
    parts.push(`Their main focus is: ${focus.trim()}.`);
  }

  return parts.join(' ');
};

type OnboardingIdentityProps = {
  userName: string;
  onNext: (
    identityString: string,
    roleValue: Role | null,
    styleValue: CommunicationStyle | null,
    focusValue: string,
  ) => void;
  onSkip: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingIdentity = ({ userName, onNext, onSkip, nav, isActive }: OnboardingIdentityProps) => {
  const [role, setRole] = useState<Role | null>(null);
  const [style, setStyle] = useState<CommunicationStyle | null>(null);
  const [focus, setFocus] = useState('');
  const prefersReducedMotion = useReducedMotion();

  const handleContinue = useCallback(() => {
    const identity = buildIdentityString(userName, role, style, focus);
    onNext(identity, role, style, focus);
  }, [focus, onNext, role, style, userName]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        handleContinue();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleContinue, isActive]);

  const Wrapper = prefersReducedMotion ? 'div' : motion.div;
  const Card = prefersReducedMotion ? 'div' : motion.div;
  const staggerProps = prefersReducedMotion
    ? {}
    : { variants: onboardingStaggerContainer, initial: 'enter', animate: isActive ? 'center' : 'enter' };
  const cardProps = prefersReducedMotion ? {} : { variants: onboardingCardVariants };

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="flex flex-col gap-4 rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        {/* ROLE */}
        <div>
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            Role
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={role === opt.value}
                onClick={() => setRole(role === opt.value ? null : opt.value)}
                className={[
                  'rounded-md border px-3 py-1.5 text-[12px] transition-[background-color,color]',
                  role === opt.value
                    ? 'border-foreground/40 bg-accent text-foreground'
                    : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* COMMUNICATION */}
        <div>
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            Tone
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COMMUNICATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={style === opt.value}
                onClick={() => setStyle(style === opt.value ? null : opt.value)}
                className={[
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] transition-[background-color,color]',
                  style === opt.value
                    ? 'border-foreground/40 bg-accent text-foreground'
                    : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <span>{opt.label}</span>
                <span className="text-[11px] opacity-50">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* FOCUS */}
        <div>
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            Focus
          </span>
          <Input
            id="onboarding-focus"
            type="text"
            placeholder="e.g. shipping a startup, finishing my thesis..."
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="h-8 text-[13px]"
          />
        </div>
      </Card>

      <Card {...cardProps} className="flex flex-col items-center gap-2 pt-3">
        <div className="flex items-center gap-3">
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
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>
      </Card>
    </Wrapper>
  );
};
