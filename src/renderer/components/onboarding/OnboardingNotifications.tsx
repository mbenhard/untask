import { useCallback, useEffect, useRef, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import type { OnboardingNavProps } from './OnboardingFlow';
import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import type { RemindersSyncFilter } from '../../../types/ipc';

type OnboardingNotificationsProps = {
  onNext: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

const SYNC_FILTER_OPTIONS: { value: RemindersSyncFilter; label: string; hint: string }[] = [
  { value: 'due_date_only', label: 'Due dates only', hint: 'Tasks with a due date.' },
  { value: 'today', label: 'Today + due', hint: 'Due today or overdue.' },
  { value: 'all', label: 'All tasks', hint: 'Everything.' },
];

export const OnboardingNotifications = ({ onNext, nav, isActive }: OnboardingNotificationsProps) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [remindersSyncEnabled, setRemindersSyncEnabled] = useState(false);
  const [syncFilter, setSyncFilter] = useState<RemindersSyncFilter>('due_date_only');
  const [isSaving, setIsSaving] = useState(false);
  const [notificationHint, setNotificationHint] = useState<string | null>(null);
  const [remindersHint, setRemindersHint] = useState<string | null>(null);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

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
            await getUntask().reminders.setFilter(syncFilter);
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
  }, [isSaving, notificationsEnabled, remindersSyncEnabled, syncFilter, onNext]);

  useEffect(() => {
    firstActionRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isActive) return;
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
  }, [handleContinue, isSaving, isActive]);

  const Wrapper = prefersReducedMotion ? 'div' : motion.div;
  const Card = prefersReducedMotion ? 'div' : motion.div;
  const staggerProps = prefersReducedMotion
    ? {}
    : { variants: onboardingStaggerContainer, initial: 'enter', animate: isActive ? 'center' : 'enter' };
  const cardProps = prefersReducedMotion ? {} : { variants: onboardingCardVariants };

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
          REMINDERS
        </span>
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
      </Card>

      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
          APPLE REMINDERS
        </span>
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
        {remindersSyncEnabled ? (
          <div className="mt-2 flex gap-1.5">
            {SYNC_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={syncFilter === opt.value}
                onClick={() => setSyncFilter(opt.value)}
                className={[
                  'flex-1 rounded-md border px-2 py-1.5 text-left transition-colors',
                  syncFilter === opt.value
                    ? 'border-foreground/40 bg-accent text-foreground'
                    : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <span className="block text-[11px]">{opt.label}</span>
                <span className="block text-[10px] text-muted-foreground/70">{opt.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-muted-foreground">Two-way sync — changes reflect in both apps.</p>
        )}
        {remindersHint ? (
          <p className="mt-1 text-[11px] text-muted-foreground/80">{remindersHint}</p>
        ) : null}
      </Card>

      <Card {...cardProps} className="flex items-center justify-center gap-3 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={nav.onBack}
          disabled={!nav.canGoBack}
          className="h-8 border-dashed border-border/60 bg-transparent px-4 text-[12px] hover:bg-accent/50"
        >
          Back
        </Button>
        <Button
          onClick={() => void handleContinue()}
          disabled={isSaving}
          size="sm"
          className="h-8 px-6 text-[12px]"
        >
          {isSaving ? 'Saving...' : 'Continue'}
        </Button>
      </Card>
    </Wrapper>
  );
};
