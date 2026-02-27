import { useCallback, useState } from 'react';

import type { OnboardingNavProps } from './OnboardingFlow';
import { Input } from '../ui/input';
import {
  SectionLabel,
  StepNav,
  TogglePair,
  useOnboardingAnimation,
  useOnboardingEnterKey,
} from './onboarding-shared';

type OnboardingBasicsProps = {
  onNext: (name: string, aiEnabled: boolean) => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingBasics = ({ onNext, nav, isActive }: OnboardingBasicsProps) => {
  const [name, setName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const { Wrapper, Card, staggerProps, cardProps } = useOnboardingAnimation(isActive);

  const handleContinue = useCallback(() => {
    onNext(name.trim(), aiEnabled);
  }, [onNext, name, aiEnabled]);

  useOnboardingEnterKey(handleContinue, isActive);

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel>NAME</SectionLabel>
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
        <SectionLabel>AI ASSISTANT</SectionLabel>
        <TogglePair
          value={aiEnabled}
          onChange={setAiEnabled}
          enableLabel="Enable"
          disableLabel="Off"
        />
        <p className="mt-2 text-[12px] text-muted-foreground">
          {aiEnabled
            ? 'AI is optional — disable anytime in Settings.'
            : 'No AI. Pure task management. Enable later in Settings.'}
        </p>
      </Card>

      <Card {...cardProps} className="flex items-center justify-center pt-3">
        <StepNav nav={nav} onContinue={handleContinue} />
      </Card>
    </Wrapper>
  );
};
