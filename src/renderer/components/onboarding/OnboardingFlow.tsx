import { useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { getUntask } from '../../lib/untask';
import { OnboardingBasics } from './OnboardingBasics';
import { OnboardingIdentity } from './OnboardingIdentity';
import { OnboardingNotifications } from './OnboardingNotifications';
import { OnboardingProvider } from './OnboardingProvider';
import { OnboardingReady } from './OnboardingReady';
import { OnboardingWelcome } from './OnboardingWelcome';

type Role = 'freelancer' | 'developer' | 'student' | 'creative' | 'other';
type CommunicationStyle = 'direct' | 'friendly' | 'professional';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'developer', label: 'Developer' },
  { value: 'student', label: 'Student' },
  { value: 'creative', label: 'Creative' },
  { value: 'other', label: 'Other' },
];

const COMMUNICATION_OPTIONS: { value: CommunicationStyle; label: string }[] = [
  { value: 'direct', label: 'Direct & concise' },
  { value: 'friendly', label: 'Friendly & casual' },
  { value: 'professional', label: 'Professional' },
];

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type OnboardingFlowProps = {
  onComplete: () => void;
};

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [step, setStep] = useState<Step>(1);
  const [isFinishing, setIsFinishing] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Summary state captured across steps
  const [userName, setUserName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);

  const goTo = (next: Step) => setStep(next);

  const handleWelcomeNext = () => {
    goTo(2);
  };

  const handleBasicsNext = async (name: string, ai: boolean) => {
    setUserName(name);
    setAiEnabled(ai);

    try {
      if (name.length > 0) {
        await getUntask().settings.setUserName(name);
      }
      await getUntask().settings.setAiEnabled(ai);
    } catch {
      // Non-fatal — proceed anyway
    }

    // Always go to notifications step next
    goTo(3);
  };

  const handleNotificationsNext = () => {
    if (aiEnabled) {
      goTo(4);
    } else {
      goTo(6);
    }
  };

  const handleProviderNext = async (provider: string, keyOrUrl: string, modelId: string) => {
    setProviderName(provider);

    try {
      if (provider === 'ollama') {
        await getUntask().settings.set('ai_ollama_base_url', keyOrUrl);
        await getUntask().settings.set('ai_provider', 'ollama');
      } else {
        await getUntask().apiKeys.set(provider, keyOrUrl);
        await getUntask().settings.set('ai_provider', provider);
      }
      await getUntask().chat.setSelectedModel({ modelId });
    } catch {
      // Non-fatal — proceed anyway
    }
    goTo(5);
  };

  const handleProviderSkip = () => {
    goTo(5);
  };

  const handleIdentityNext = async (
    identityString: string,
    roleValue: Role | null,
    styleValue: CommunicationStyle | null,
    focusValue: string,
  ) => {
    const roleLabel = roleValue
      ? ROLE_OPTIONS.find((o) => o.value === roleValue)?.label ?? null
      : null;
    const styleLabel = styleValue
      ? COMMUNICATION_OPTIONS.find((o) => o.value === styleValue)?.label ?? null
      : null;
    setRoleName(roleLabel);

    try {
      if (identityString.trim().length > 0) {
        await getUntask().settings.setIdentity(identityString);
      }
      if (roleValue) {
        await getUntask().settings.set('user.role', roleLabel ?? '');
      }
      if (styleValue) {
        await getUntask().settings.set('communication.style', styleLabel ?? '');
      }
      if (focusValue.trim().length > 0) {
        await getUntask().settings.set('user.focus', focusValue.trim());
      }
    } catch {
      // Non-fatal — proceed anyway
    }
    goTo(6);
  };

  const handleIdentitySkip = () => {
    goTo(6);
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

  const renderStep = () => {
    switch (step) {
      case 1:
        return <OnboardingWelcome onNext={handleWelcomeNext} />;
      case 2:
        return (
          <OnboardingBasics
            onNext={(name, ai) => {
              void handleBasicsNext(name, ai);
            }}
          />
        );
      case 3:
        return (
          <OnboardingNotifications onNext={handleNotificationsNext} />
        );
      case 4:
        return (
          <OnboardingProvider
            onNext={(provider, keyOrUrl, modelId) => {
              void handleProviderNext(provider, keyOrUrl, modelId);
            }}
            onSkip={handleProviderSkip}
          />
        );
      case 5:
        return (
          <OnboardingIdentity
            userName={userName}
            onNext={(identityString, roleValue, styleValue, focusValue) => {
              void handleIdentityNext(identityString, roleValue, styleValue, focusValue);
            }}
            onSkip={handleIdentitySkip}
          />
        );
      case 6:
        return (
          <OnboardingReady
            onFinish={() => void handleFinish()}
            isFinishing={isFinishing}
            summary={{ userName, aiEnabled, providerName, roleName }}
          />
        );
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-[480px]">
        {step > 1 && step < 6 ? (
          <div className="mb-6 flex gap-1">
            {([2, 3, 4, 5] as Step[]).map((s) => (
              <div
                key={s}
                className={[
                  'h-0.5 flex-1 rounded-full transition-all duration-300',
                  step >= s ? 'bg-foreground/40' : 'bg-border',
                ].join(' ')}
              />
            ))}
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -6 }}
            transition={{ duration: prefersReducedMotion ? 0.05 : 0.2, ease: 'easeOut' }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
