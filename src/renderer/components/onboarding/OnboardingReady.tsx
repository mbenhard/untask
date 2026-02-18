import { Button } from '../ui/button';

type OnboardingReadyProps = {
  onFinish: () => void;
  isFinishing: boolean;
};

export const OnboardingReady = ({ onFinish, isFinishing }: OnboardingReadyProps) => {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">You're all set.</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your workspace is ready. Let's get to work.
        </p>
      </div>

      <Button onClick={onFinish} disabled={isFinishing} className="w-full">
        {isFinishing ? 'Opening...' : 'Open App'}
      </Button>
    </div>
  );
};
