import { useCallback, useState } from 'react';

import { buildIdentityString } from '../../lib/identity';
import { cn } from '../../lib/utils';
import type { OnboardingNavProps } from './OnboardingFlow';
import { Input } from '../ui/input';
import {
  COMMUNICATION_OPTIONS,
  ROLE_OPTIONS,
  type CommunicationStyle,
  type Role,
  SectionLabel,
  StepNav,
  useOnboardingAnimation,
  useOnboardingEnterKey,
} from './onboarding-shared';

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
  const { Wrapper, Card, staggerProps, cardProps } = useOnboardingAnimation(isActive);

  const handleContinue = useCallback(() => {
    const identity = buildIdentityString(userName, role, style, focus);
    onNext(identity, role, style, focus);
  }, [focus, onNext, role, style, userName]);

  useOnboardingEnterKey(handleContinue, isActive);

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="flex flex-col gap-4 rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        {/* ROLE */}
        <div>
          <SectionLabel>Role</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={role === opt.value}
                onClick={() => setRole(role === opt.value ? null : opt.value)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-[12px] transition-[background-color,color] outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  role === opt.value
                    ? 'border-foreground/40 bg-accent text-foreground'
                    : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* COMMUNICATION */}
        <div>
          <SectionLabel>Tone</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {COMMUNICATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={style === opt.value}
                onClick={() => setStyle(style === opt.value ? null : opt.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] transition-[background-color,color] outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  style === opt.value
                    ? 'border-foreground/40 bg-accent text-foreground'
                    : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{opt.shortLabel}</span>
                <span className="text-[11px] opacity-50">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* FOCUS */}
        <div>
          <SectionLabel>Focus</SectionLabel>
          <label htmlFor="onboarding-focus" className="sr-only">
            What are you focused on?
          </label>
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
        <StepNav nav={nav} onContinue={handleContinue} onSkip={onSkip} />
      </Card>
    </Wrapper>
  );
};
