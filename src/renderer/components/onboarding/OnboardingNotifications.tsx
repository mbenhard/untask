import { useCallback, useEffect } from 'react';

import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';

type OnboardingNotificationsProps = {
  onNext: () => void;
};

export const OnboardingNotifications = ({ onNext }: OnboardingNotificationsProps) => {
  const handleEnable = useCallback(async () => {
    try {
      await getUntask().settings.set('notifications.enabled', 'true');
      await getUntask().notifications.fireTest();
    } catch {
      // Non-fatal — proceed anyway
    }
    onNext();
  }, [onNext]);

  const handleSkip = useCallback(async () => {
    try {
      await getUntask().settings.set('notifications.enabled', 'false');
    } catch {
      // Non-fatal
    }
    onNext();
  }, [onNext]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleEnable();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleEnable]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Stay on top of tasks
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Get reminders when tasks are due so nothing slips.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={() => void handleEnable()} className="w-full">
          Enable reminders
        </Button>
        <button
          type="button"
          onClick={() => void handleSkip()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};
