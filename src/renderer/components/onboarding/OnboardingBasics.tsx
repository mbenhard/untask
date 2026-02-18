import { useState } from 'react';

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

  const isNameValid = name.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Let's get set up</h2>
        <p className="text-xs text-muted-foreground">A couple of quick questions.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="onboarding-name" className="text-xs font-medium text-foreground">
            What should I call you?
          </label>
          <Input
            id="onboarding-name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isNameValid) {
                handleContinue();
              }
            }}
            autoFocus
            className="h-9 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-foreground">Enable AI assistant?</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAiEnabled(true)}
              className={[
                'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                aiEnabled
                  ? 'border-foreground/30 bg-accent text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setAiEnabled(false)}
              className={[
                'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                !aiEnabled
                  ? 'border-foreground/30 bg-accent text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              No, task manager only
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {aiEnabled
              ? 'AI features will be enabled. You can turn this off later in settings.'
              : 'App works as a pure task manager. You can enable AI later in settings.'}
          </p>
        </div>
      </div>

      <Button onClick={handleContinue} disabled={!isNameValid} className="w-full">
        Continue
      </Button>

      <div className="flex items-center justify-center gap-4 text-muted-foreground/50">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
          <span className="text-[10px]">Continue</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd>
          <span className="text-[10px]">Next field</span>
        </span>
      </div>
    </div>
  );
};
