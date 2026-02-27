import { BirdMascot } from '../chat/BirdMascot';
import { Button } from '../ui/button';
import { useOnboardingAnimation, useOnboardingEnterKey } from './onboarding-shared';

type OnboardingWelcomeProps = {
  onNext: () => void;
  isActive: boolean;
};

export const OnboardingWelcome = ({ onNext, isActive }: OnboardingWelcomeProps) => {
  const { Wrapper, Card, staggerProps, cardProps } = useOnboardingAnimation(isActive);

  useOnboardingEnterKey(onNext, isActive);

  return (
    <Wrapper {...staggerProps} className="flex flex-col items-center gap-3">
      <Card {...cardProps} className="bg-background px-6 py-2">
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
