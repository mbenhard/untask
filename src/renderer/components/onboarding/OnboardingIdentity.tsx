import { useState } from 'react';

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
  role: Role | null,
  style: CommunicationStyle | null,
  focus: string,
): string => {
  const parts: string[] = [];

  if (role) {
    const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label.toLowerCase() ?? role;
    parts.push(`The user is a ${roleLabel}.`);
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
  onNext: (identityString: string) => void;
  onSkip: () => void;
};

export const OnboardingIdentity = ({ onNext, onSkip }: OnboardingIdentityProps) => {
  const [role, setRole] = useState<Role | null>(null);
  const [style, setStyle] = useState<CommunicationStyle | null>(null);
  const [focus, setFocus] = useState('');

  const canContinue = role !== null || style !== null || focus.trim().length > 0;

  const handleContinue = () => {
    const identity = buildIdentityString(role, style, focus);
    onNext(identity);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Tell me about yourself</h2>
        <p className="text-xs text-muted-foreground">
          So I can be more useful from day one. All optional.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-foreground">What do you do?</span>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(role === opt.value ? null : opt.value)}
                className={[
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  role === opt.value
                    ? 'border-foreground/30 bg-accent text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-foreground">How should I communicate?</span>
          <div className="flex flex-col gap-1.5">
            {COMMUNICATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStyle(style === opt.value ? null : opt.value)}
                className={[
                  'rounded-md border px-3 py-2 text-xs text-left transition-colors',
                  style === opt.value
                    ? 'border-foreground/30 bg-accent text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="ml-2 opacity-70">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="onboarding-focus" className="text-xs font-medium text-foreground">
            What's your main focus right now?
          </label>
          <Input
            id="onboarding-focus"
            type="text"
            placeholder="e.g. shipping my startup, finishing my thesis..."
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={handleContinue} disabled={!canContinue} className="w-full">
          Continue
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
};
