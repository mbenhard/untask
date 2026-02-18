import { Button } from '../ui/button';

type OnboardingWelcomeProps = {
  onNext: () => void;
};

export const OnboardingWelcome = ({ onNext }: OnboardingWelcomeProps) => {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Untask</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your personal task manager and AI assistant.
        </p>
      </div>

      <Button onClick={onNext} className="w-full">
        Get Started
      </Button>
    </div>
  );
};
