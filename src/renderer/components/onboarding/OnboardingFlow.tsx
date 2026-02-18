import { useState } from 'react';

import { getUntask } from '../../lib/untask';
import { OnboardingBasics } from './OnboardingBasics';
import { OnboardingIdentity } from './OnboardingIdentity';
import { OnboardingProvider } from './OnboardingProvider';
import { OnboardingReady } from './OnboardingReady';
import { OnboardingWelcome } from './OnboardingWelcome';

type Step = 1 | 2 | 3 | 4 | 5;

type OnboardingFlowProps = {
  onComplete: () => void;
};

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [step, setStep] = useState<Step>(1);
  const [isFinishing, setIsFinishing] = useState(false);

  const goTo = (next: Step) => setStep(next);

  const handleWelcomeNext = () => {
    goTo(2);
  };

  const handleBasicsNext = async (name: string, aiEnabled: boolean) => {
    try {
      if (name.length > 0) {
        await getUntask().settings.setUserName(name);
      }
      await getUntask().settings.setAiEnabled(aiEnabled);
    } catch {
      // Non-fatal — proceed anyway
    }

    if (aiEnabled) {
      goTo(3);
    } else {
      goTo(5);
    }
  };

  const handleProviderNext = async (provider: string, keyOrUrl: string) => {
    try {
      if (provider === 'ollama') {
        await getUntask().settings.set('ai_ollama_base_url', keyOrUrl);
        await getUntask().settings.set('ai_provider', 'ollama');
      } else {
        await getUntask().apiKeys.set(provider, keyOrUrl);
        await getUntask().settings.set('ai_provider', provider);
      }
    } catch {
      // Non-fatal — proceed anyway
    }
    goTo(4);
  };

  const handleProviderSkip = () => {
    goTo(4);
  };

  const handleIdentityNext = async (identityString: string) => {
    try {
      if (identityString.trim().length > 0) {
        await getUntask().settings.setIdentity(identityString);
      }
    } catch {
      // Non-fatal — proceed anyway
    }
    goTo(5);
  };

  const handleIdentitySkip = () => {
    goTo(5);
  };

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      await getUntask().settings.markBootstrapCompleted();
    } catch {
      // Even if this fails, complete onboarding in the UI
    } finally {
      setIsFinishing(false);
      onComplete();
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-[480px]">
        {step > 1 && step < 5 ? (
          <div className="mb-6 flex gap-1">
            {([2, 3, 4] as Step[]).map((s) => (
              <div
                key={s}
                className={[
                  'h-0.5 flex-1 rounded-full transition-colors',
                  step >= s ? 'bg-foreground/40' : 'bg-border',
                ].join(' ')}
              />
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <OnboardingWelcome onNext={handleWelcomeNext} />
        ) : step === 2 ? (
          <OnboardingBasics
            onNext={(name, aiEnabled) => {
              void handleBasicsNext(name, aiEnabled);
            }}
          />
        ) : step === 3 ? (
          <OnboardingProvider
            onNext={(provider, keyOrUrl) => {
              void handleProviderNext(provider, keyOrUrl);
            }}
            onSkip={handleProviderSkip}
          />
        ) : step === 4 ? (
          <OnboardingIdentity
            onNext={(identityString) => {
              void handleIdentityNext(identityString);
            }}
            onSkip={handleIdentitySkip}
          />
        ) : (
          <OnboardingReady onFinish={() => void handleFinish()} isFinishing={isFinishing} />
        )}
      </div>
    </div>
  );
};
