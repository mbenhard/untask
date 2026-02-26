import { useCallback, useEffect, useRef, useState } from 'react';

import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';

type OnboardingNotificationsProps = {
  onNext: () => void;
};

export const OnboardingNotifications = ({ onNext }: OnboardingNotificationsProps) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [remindersSyncEnabled, setRemindersSyncEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notificationHint, setNotificationHint] = useState<string | null>(null);
  const [remindersHint, setRemindersHint] = useState<string | null>(null);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);

  const handleContinue = useCallback(async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setNotificationHint(null);
    setRemindersHint(null);

    try {
      try {
        await getUntask().settings.set('notifications.enabled', String(notificationsEnabled));
        if (notificationsEnabled) {
          const permission = await getUntask().notifications.fireTest();
          if (permission.status === 'denied') {
            setNotificationHint('Notifications are blocked by macOS Focus/notification settings.');
          }
        }
      } catch {
        setNotificationHint('Could not save notification preference. You can update this in Settings.');
      }

      try {
        if (remindersSyncEnabled) {
          const accessResult = await getUntask().reminders.requestAccess();
          if (accessResult.granted) {
            await getUntask().reminders.toggle(true);
          } else {
            setRemindersHint('Reminders permission denied. Continue now and enable later in Settings.');
          }
        } else {
          await getUntask().reminders.toggle(false);
        }
      } catch {
        setRemindersHint('Could not configure Apple Reminders sync. You can update this in Settings.');
      }
    } finally {
      setIsSaving(false);
    }

    onNext();
  }, [isSaving, notificationsEnabled, remindersSyncEnabled, onNext]);

  useEffect(() => {
    firstActionRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || isSaving) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-onboarding-enter-ignore="true"]')) {
        return;
      }

      event.preventDefault();
      void handleContinue();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleContinue, isSaving]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            REMINDERS
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Get notified when tasks are due.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            ref={firstActionRef}
            type="button"
            aria-pressed={notificationsEnabled}
            onClick={() => setNotificationsEnabled(true)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              notificationsEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Enable
          </button>
          <button
            type="button"
            aria-pressed={!notificationsEnabled}
            onClick={() => setNotificationsEnabled(false)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              !notificationsEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Skip
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Using Focus modes?{' '}
          <button
            type="button"
            data-onboarding-enter-ignore="true"
            onClick={() =>
              void getUntask().shell.openExternal(
                'x-apple.systempreferences:com.apple.Focus-Settings.extension',
              )
            }
            className="underline transition-colors hover:text-foreground"
          >
            Open macOS settings
          </button>
        </p>
        {notificationHint ? (
          <p className="mt-1 text-[11px] text-muted-foreground/80">{notificationHint}</p>
        ) : null}
      </div>

      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            APPLE REMINDERS
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Sync tasks with the macOS Reminders app.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            aria-pressed={remindersSyncEnabled}
            onClick={() => setRemindersSyncEnabled(true)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              remindersSyncEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Sync
          </button>
          <button
            type="button"
            aria-pressed={!remindersSyncEnabled}
            onClick={() => setRemindersSyncEnabled(false)}
            className={[
              'h-8 flex-1 rounded-md border px-3 text-[12px] transition-colors',
              !remindersSyncEnabled
                ? 'border-foreground/40 bg-accent text-foreground'
                : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Skip
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Two-way sync — changes reflect in both apps.</p>
        {remindersHint ? (
          <p className="mt-1 text-[11px] text-muted-foreground/80">{remindersHint}</p>
        ) : null}
      </div>

      <div className="mt-auto">
        <Button
          onClick={() => void handleContinue()}
          disabled={isSaving}
          size="sm"
          className="h-8 w-full text-[12px]"
        >
          {isSaving ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </div>
  );
};
