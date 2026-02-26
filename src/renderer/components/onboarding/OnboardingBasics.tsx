import { useEffect, useState } from 'react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';

type OnboardingBasicsProps = {
  onNext: (name: string, aiEnabled: boolean) => void;
};

export const OnboardingBasics = ({ onNext }: OnboardingBasicsProps) => {
  const [name, setName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);

  const handleContinue = () => {
    onNext(name.trim(), aiEnabled);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      handleContinue();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [name, aiEnabled]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            NAME
          </span>
        </div>
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
      </div>

      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            AI ASSISTANT
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={aiEnabled}
            onClick={() => setAiEnabled(true)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              aiEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Enable
          </button>
          <button
            type="button"
            aria-pressed={!aiEnabled}
            onClick={() => setAiEnabled(false)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              !aiEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Skip
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {aiEnabled
            ? "I'll help you organize tasks and stay focused."
            : 'You can always enable this later in Settings.'}
        </p>
      </div>

      <Button onClick={handleContinue} size="sm" className="mt-auto h-8 w-full text-[12px]">
        Continue
      </Button>
    </div>
  );
};
