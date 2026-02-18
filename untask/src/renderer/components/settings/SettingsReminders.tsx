import { useCallback, useEffect, useState } from 'react';

import type { RemindersSyncFilter, RemindersSyncStatusPayload } from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

type SettingsRemindersProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const SettingsReminders = ({ setError, setNotice }: SettingsRemindersProps) => {
  const [enabled, setEnabled] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [syncFilter, setSyncFilter] = useState<RemindersSyncFilter>('due_date_only');
  const [syncedCount, setSyncedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<RemindersSyncStatusPayload>({ status: 'idle' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getUntask().reminders.getStatus();
      setEnabled(result.enabled);
      setAuthorized(result.authorized);
      setSyncFilter(result.syncFilter);
      setSyncedCount(result.syncedCount);
      setLastSyncAt(result.lastSyncAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reminders status.');
    } finally {
      setIsLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Listen for live sync status updates
  useEffect(() => {
    const unsub = getUntask().reminders.onSyncStatus((payload) => {
      setSyncStatus(payload);
      if (payload.status === 'idle') {
        // Refresh counts after sync completes
        void loadStatus();
      }
    });
    return unsub;
  }, [loadStatus]);

  const handleToggle = useCallback(
    async (value: 'on' | 'off') => {
      const nextEnabled = value === 'on';
      const previousEnabled = enabled;
      setEnabled(nextEnabled);
      setNotice(null);
      setError(null);

      try {
        setIsSaving(true);

        // If enabling for the first time and not yet authorized, request access
        if (nextEnabled && !authorized) {
          const accessResult = await getUntask().reminders.requestAccess();
          if (!accessResult.granted) {
            setEnabled(previousEnabled);
            setError(
              'Reminders access denied. Open System Settings > Privacy & Security > Reminders to grant access.',
            );
            return;
          }
          setAuthorized(true);
        }

        await getUntask().reminders.toggle(nextEnabled);
        setNotice(nextEnabled ? 'Reminders sync enabled.' : 'Reminders sync disabled.');

        if (nextEnabled) {
          void loadStatus();
        }
      } catch (e) {
        setEnabled(previousEnabled);
        setError(e instanceof Error ? e.message : 'Failed to toggle reminders sync.');
      } finally {
        setIsSaving(false);
      }
    },
    [enabled, authorized, setError, setNotice, loadStatus],
  );

  const handleFilterChange = useCallback(
    async (filter: RemindersSyncFilter) => {
      const previousFilter = syncFilter;
      setSyncFilter(filter);
      setNotice(null);
      setError(null);

      try {
        setIsSaving(true);
        await getUntask().reminders.setFilter(filter);
        const labels: Record<RemindersSyncFilter, string> = {
          due_date_only: 'Tasks with due dates',
          today: 'Today + due dates',
          all: 'All active tasks',
        };
        setNotice(`Sync filter set to "${labels[filter]}".`);
      } catch (e) {
        setSyncFilter(previousFilter);
        setError(e instanceof Error ? e.message : 'Failed to update sync filter.');
      } finally {
        setIsSaving(false);
      }
    },
    [syncFilter, setError, setNotice],
  );

  const handleForceSync = useCallback(async () => {
    setNotice(null);
    setError(null);

    try {
      setIsSaving(true);
      await getUntask().reminders.forceSync();
      setNotice('Sync complete.');
      void loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setIsSaving(false);
    }
  }, [setError, setNotice, loadStatus]);

  const statusHint = (() => {
    if (!enabled) return 'Sync tasks with due dates to your Reminders app. Changes sync to all your Apple devices via iCloud.';
    if (syncStatus.status === 'syncing') return 'Syncing...';
    if (syncStatus.status === 'error') return syncStatus.message ?? 'Sync error.';

    const parts: string[] = [];
    parts.push(`${syncedCount} task${syncedCount !== 1 ? 's' : ''} synced`);
    if (lastSyncAt) parts.push(`last sync ${formatRelativeTime(lastSyncAt)}`);
    return parts.join(' · ');
  })();

  return (
    <div role="tabpanel" id="settings-panel-reminders" className="space-y-3">
      <SettingsSection title="Apple Reminders">
        <SettingsRow
          label="Sync to Reminders"
          hint={statusHint}
          loading={isLoading}
        >
          <SegmentedControl
            options={[
              { value: 'on' as const, label: 'On' },
              { value: 'off' as const, label: 'Off' },
            ]}
            value={enabled ? 'on' : 'off'}
            onChange={(v) => void handleToggle(v as 'on' | 'off')}
            disabled={isSaving}
          />
        </SettingsRow>

        {enabled && (
          <>
            <SettingsRow
              label="Sync filter"
              hint="Choose which tasks sync to Reminders."
            >
              <SegmentedControl
                options={[
                  { value: 'due_date_only' as const, label: 'Due dates' },
                  { value: 'today' as const, label: 'Today + due' },
                  { value: 'all' as const, label: 'All active' },
                ]}
                value={syncFilter}
                onChange={(v) => void handleFilterChange(v as RemindersSyncFilter)}
                disabled={isSaving}
              />
            </SettingsRow>

            <SettingsRow
              label="Manual sync"
              hint="Force a full sync now."
            >
              <button
                type="button"
                className="rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void handleForceSync()}
                disabled={isSaving || syncStatus.status === 'syncing'}
              >
                {syncStatus.status === 'syncing' ? 'Syncing...' : 'Sync now'}
              </button>
            </SettingsRow>
          </>
        )}
      </SettingsSection>
    </div>
  );
};
