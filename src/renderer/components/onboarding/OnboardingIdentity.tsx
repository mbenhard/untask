import { useCallback, useEffect, useState } from 'react';

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
  { value: 'direct', label: 'Direct & concise', hint: 'Short, to the point.' },
  { value: 'friendly', label: 'Friendly & casual', hint: 'Warm and conversational.' },
  { value: 'professional', label: 'Professional', hint: 'Formal and thorough.' },
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
};

export const OnboardingIdentity = ({ userName, onNext, onSkip }: OnboardingIdentityProps) => {
  const [role, setRole] = useState<Role | null>(null);
  const [style, setStyle] = useState<CommunicationStyle | null>(null);
  const [focus, setFocus] = useState('');

  const handleContinue = useCallback(() => {
    const identity = buildIdentityString(userName, role, style, focus);
    onNext(identity, role, style, focus);
  }, [focus, onNext, role, style, userName]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleContinue();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleContinue]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            ROLE
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={role === opt.value}
              onClick={() => setRole(role === opt.value ? null : opt.value)}
              className={[
                'rounded-md border px-3 py-1.5 text-[12px] transition-colors',
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

      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            COMMUNICATION
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMMUNICATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={style === opt.value}
              onClick={() => setStyle(style === opt.value ? null : opt.value)}
              className={[
                'rounded-md border px-3 py-1.5 text-[12px] transition-colors',
                style === opt.value
                  ? 'border-foreground/40 bg-accent text-foreground'
                  : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <span>{opt.value === 'direct' ? 'Direct' : opt.value === 'friendly' ? 'Friendly' : 'Professional'}</span>
              <span className="ml-2 text-[11px] text-muted-foreground/70">
                {opt.value === 'direct' ? 'Short.' : opt.value === 'friendly' ? 'Warm.' : 'Thorough.'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            FOCUS
          </span>
        </div>
        <Input
          id="onboarding-focus"
          type="text"
          placeholder="shipping my startup, finishing my thesis..."
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="h-8 text-[13px]"
        />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Button onClick={handleContinue} size="sm" className="h-8 w-full text-[12px]">
          Continue
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>
      </div>
    </div>
  );
};
