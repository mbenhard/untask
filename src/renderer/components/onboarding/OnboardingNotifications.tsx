import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/utils';
import type { OnboardingNavProps } from './OnboardingFlow';
import { getUntask } from '../../lib/untask';
import type { RemindersSyncFilter } from '../../../types/ipc';
import {
  SectionLabel,
  StepNav,
  TogglePair,
  useOnboardingAnimation,
  useOnboardingEnterKey,
} from './onboarding-shared';

const SYNC_FILTER_OPTIONS: { value: RemindersSyncFilter; label: string; hint: string }[] = [
  { value: 'due_date_only', label: 'Due dates only', hint: 'Tasks with a due date.' },
  { value: 'today', label: 'Today + due', hint: 'Due today or overdue.' },
  { value: 'all', label: 'All tasks', hint: 'Everything.' },
];

type OnboardingNotificationsProps = {
  onNext: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingNotifications = ({ onNext, nav, isActive }: OnboardingNotificationsProps) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [remindersSyncEnabled, setRemindersSyncEnabled] = useState(false);
  const [syncFilter, setSyncFilter] = useState<RemindersSyncFilter>('due_date_only');
  const [isSaving, setIsSaving] = useState(false);
  const [notificationHint, setNotificationHint] = useState<string | null>(null);
  const [remindersHint, setRemindersHint] = useState<string | null>(null);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const { Wrapper, Card, staggerProps, cardProps } = useOnboardingAnimation(isActive);

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

  useOnboardingEnterKey(
    () => void handleContinue(),
    isActive,
    { disabled: isSaving, ignoreSelector: '[data-onboarding-enter-ignore="true"]' },
  );

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <SectionLabel>REMINDERS</SectionLabel>
        <p className="text-[12px] text-muted-foreground">
          Get notified when tasks are due.
        </p>
        <div className="mt-2">
          <TogglePair
            value={notificationsEnabled}
            onChange={setNotificationsEnabled}
            enableLabel="Enable"
            disableLabel="Skip"
            enableRef={firstActionRef}
          />
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
        <SectionLabel>APPLE REMINDERS</SectionLabel>
        <p className="text-[12px] text-muted-foreground">
          Sync tasks with the macOS Reminders app.
        </p>
        <div className="mt-2">
          <TogglePair
            value={remindersSyncEnabled}
            onChange={setRemindersSyncEnabled}
            enableLabel="Sync"
            disableLabel="Skip"
          />
        </div>
        {remindersSyncEnabled ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {SYNC_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={syncFilter === opt.value}
                onClick={() => setSyncFilter(opt.value)}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left transition-[background-color,color]',
                  syncFilter === opt.value
                    ? 'border-foreground/40 bg-accent text-foreground'
                    : 'border-dashed border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="text-[12px]">{opt.label}</span>
                <span className="text-[11px] text-muted-foreground/70">{opt.hint}</span>
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

      <Card {...cardProps} className="flex items-center justify-center pt-3">
        <StepNav
          nav={nav}
          onContinue={() => void handleContinue()}
          continueDisabled={isSaving}
          continueLabel={isSaving ? 'Saving...' : 'Continue'}
        />
      </Card>
    </Wrapper>
  );
};
