import { useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import { OnboardingBasics } from './OnboardingBasics';
import { OnboardingIdentity } from './OnboardingIdentity';
import { OnboardingNotifications } from './OnboardingNotifications';
import { OnboardingPreferences } from './OnboardingPreferences';
import { OnboardingProvider } from './OnboardingProvider';
import { OnboardingShortcuts } from './OnboardingShortcuts';
import { OnboardingWelcome } from './OnboardingWelcome';

type Role = 'freelancer' | 'developer' | 'student' | 'creative' | 'other';
type CommunicationStyle = 'direct' | 'friendly' | 'professional';

type StepKey =
  | 'welcome'
  | 'basics'
  | 'notifications'
  | 'provider'
  | 'identity'
  | 'shortcuts'
  | 'preferences';

const STEP_TITLES: Record<StepKey, string> = {
  welcome: 'WELCOME',
  basics: 'BASICS',
  notifications: 'NOTIFICATIONS',
  provider: 'PROVIDER',
  identity: 'IDENTITY',
  shortcuts: 'SHORTCUTS',
  preferences: 'PREFERENCES',
};

const ALL_STEPS: StepKey[] = [
  'welcome',
  'basics',
  'notifications',
  'provider',
  'identity',
  'shortcuts',
  'preferences',
];

const getVisibleSteps = (aiEnabled: boolean): StepKey[] => {
  if (aiEnabled) {
    return ALL_STEPS;
  }

  return ['welcome', 'basics', 'notifications', 'shortcuts', 'preferences'];
};

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

type OnboardingFlowProps = {
  onComplete: () => void;
  isTransitioningToApp?: boolean;
};

export const OnboardingFlow = ({ onComplete, isTransitioningToApp = false }: OnboardingFlowProps) => {
  const [currentStep, setCurrentStep] = useState<StepKey>('welcome');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFinishing, setIsFinishing] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Summary state captured across steps
  const [userName, setUserName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const visibleSteps = useMemo(() => getVisibleSteps(aiEnabled), [aiEnabled]);
  const currentIndex = visibleSteps.indexOf(currentStep);

  // Guard against stale step IDs when the visible step list changes.
  useEffect(() => {
    if (currentIndex !== -1) {
      return;
    }

    const fallback = visibleSteps[visibleSteps.length - 1] ?? 'welcome';
    setCurrentStep(fallback);
  }, [currentIndex, visibleSteps]);

  const resolveIndex = (step: StepKey): number => {
    const idx = visibleSteps.indexOf(step);
    if (idx !== -1) {
      return idx;
    }

    const allIdx = ALL_STEPS.indexOf(step);
    return allIdx === -1 ? 0 : allIdx;
  };

  const goTo = (nextStep: StepKey) => {
    const currentResolvedIndex = resolveIndex(currentStep);
    const nextResolvedIndex = resolveIndex(nextStep);
    setDirection(nextResolvedIndex > currentResolvedIndex ? 1 : -1);
    setCurrentStep(nextStep);
  };

  const goNext = () => {
    if (currentIndex < 0 || currentIndex >= visibleSteps.length - 1) {
      return;
    }

    const next = visibleSteps[currentIndex + 1];
    if (next) {
      goTo(next);
    }
  };

  const goBack = () => {
    if (currentIndex <= 0) {
      return;
    }

    const previous = visibleSteps[currentIndex - 1];
    if (previous) {
      goTo(previous);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key !== 'Escape') {
        return;
      }

      if (isTransitioningToApp) {
        return;
      }

      if (currentIndex <= 0) {
        return;
      }

      event.preventDefault();
      const previous = visibleSteps[currentIndex - 1];
      if (previous) {
        goTo(previous);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, isTransitioningToApp, visibleSteps]);

  const handleWelcomeNext = () => {
    goNext();
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

    goTo('notifications');
  };

  const handleNotificationsNext = () => {
    goNext();
  };

  const handleProviderNext = async (provider: string, keyOrUrl: string, modelId: string) => {
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

    goNext();
  };

  const handleProviderSkip = () => {
    goNext();
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

    goNext();
  };

  const handleIdentitySkip = () => {
    goNext();
  };

  const handleShortcutsNext = () => {
    goNext();
  };

  const handlePreferencesNext = () => {
    void handleFinish();
  };

  const handleFinish = async () => {
    if (isFinishing || isTransitioningToApp) {
      return;
    }

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
    switch (currentStep) {
      case 'welcome':
        return <OnboardingWelcome onNext={handleWelcomeNext} />;
      case 'basics':
        return (
          <OnboardingBasics
            onNext={(name, ai) => {
              void handleBasicsNext(name, ai);
            }}
          />
        );
      case 'notifications':
        return <OnboardingNotifications onNext={handleNotificationsNext} />;
      case 'provider':
        return (
          <OnboardingProvider
            onNext={(provider, keyOrUrl, modelId) => {
              void handleProviderNext(provider, keyOrUrl, modelId);
            }}
            onSkip={handleProviderSkip}
          />
        );
      case 'identity':
        return (
          <OnboardingIdentity
            userName={userName}
            onNext={(identityString, roleValue, styleValue, focusValue) => {
              void handleIdentityNext(identityString, roleValue, styleValue, focusValue);
            }}
            onSkip={handleIdentitySkip}
          />
        );
      case 'shortcuts':
        return <OnboardingShortcuts onNext={handleShortcutsNext} />;
      case 'preferences':
        return <OnboardingPreferences onNext={handlePreferencesNext} />;
    }
  };

  const displayStep = Math.max(1, currentIndex + 1);
  const totalSteps = visibleSteps.length;
  const sectionLabel = `${String(displayStep).padStart(2, '0')} — ${STEP_TITLES[currentStep]}`;

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-4">
      <div className="relative flex h-full max-h-[680px] w-full max-w-[680px] overflow-hidden rounded-lg border border-border/70 bg-card/80">
        <div
          className={[
            'pointer-events-none absolute bottom-8 left-8 top-8 border-l border-dashed border-border/60 transition-opacity duration-200',
            isTransitioningToApp ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
        />
        <div className="pointer-events-none absolute left-[29px] top-[37px] size-2 rounded-full border border-border/80 bg-background/90" />

        <div
          className={[
            'relative flex w-full flex-col px-8 pb-6 pt-7',
            isTransitioningToApp ? 'pointer-events-none' : '',
          ].join(' ')}
        >
          <header
            className={[
              'mb-4 pl-8 transition-opacity duration-200',
              isTransitioningToApp ? 'opacity-0' : 'opacity-100',
            ].join(' ')}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {sectionLabel}
            </p>
          </header>

          <div className="relative min-h-0 flex-1 pl-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : direction > 0 ? 16 : -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : direction > 0 ? -10 : 10 }}
                transition={{ duration: prefersReducedMotion ? 0.06 : 0.24, ease: 'easeOut' }}
                className="h-full"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            className={[
              'mt-4 flex items-center justify-between border-t border-dashed border-border/60 pt-3 pl-8 transition-opacity duration-200',
              isTransitioningToApp ? 'opacity-0' : 'opacity-100',
            ].join(' ')}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goBack}
              disabled={currentIndex <= 0 || isFinishing}
              className="h-8 border-dashed border-border/60 bg-transparent text-[12px] hover:bg-accent/50"
            >
              Back
            </Button>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
              {String(displayStep).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
