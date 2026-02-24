import { useCallback, useEffect, useState } from 'react';

import type { RemindersSyncFilter, RemindersSyncStatusPayload } from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

type ReminderOffset = 'at_due' | '15m' | '1h' | '1d';

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

// ─── Notification settings keys (must match defaultSettings.ts) ───
const NOTIFICATIONS_ENABLED_KEY = 'notifications.enabled';
const NOTIFICATIONS_DEFAULT_OFFSET_KEY = 'notifications.default_offset';
const NOTIFICATIONS_SOUND_KEY = 'notifications.sound';

const OFFSET_LABELS: Record<ReminderOffset, string> = {
  at_due: 'At due time',
  '15m': '15 min before',
  '1h': '1 hour before',
  '1d': '1 day before',
};

export const SettingsReminders = ({ setError, setNotice }: SettingsRemindersProps) => {
  // ─── Notification state ─────────────────────────────────────
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifDefaultOffset, setNotifDefaultOffset] = useState<ReminderOffset>('at_due');
  const [notifSound, setNotifSound] = useState(true);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [notifLoading, setNotifLoading] = useState(true);

  // Load notification settings on mount
  useEffect(() => {
    const load = async () => {
      try {
        const api = getUntask();
        const [enabledVal, offsetVal, soundVal] = await Promise.all([
          api.settings.get(NOTIFICATIONS_ENABLED_KEY),
          api.settings.get(NOTIFICATIONS_DEFAULT_OFFSET_KEY),
          api.settings.get(NOTIFICATIONS_SOUND_KEY),
        ]);
        setNotifEnabled(enabledVal !== 'false');
        if (offsetVal && offsetVal in OFFSET_LABELS) {
          setNotifDefaultOffset(offsetVal as ReminderOffset);
        }
        setNotifSound(soundVal !== 'false');

        // Probe permission
        const result = await api.notifications.probePermission();
        setNotifPermission(result.status);
      } catch {
        // Silently fail — settings will use defaults
      } finally {
        setNotifLoading(false);
      }
    };
    void load();
  }, []);

  const handleNotifToggle = useCallback(async (value: 'on' | 'off') => {
    const next = value === 'on';
    setNotifEnabled(next);
    setNotice(null);
    setError(null);

    try {
      await getUntask().settings.set(NOTIFICATIONS_ENABLED_KEY, String(next));
      if (next) {
        // Fire test notification to trigger macOS permission dialog.
        // fireTest returns the permission result directly (no separate probe needed).
        const result = await getUntask().notifications.fireTest();
        setNotifPermission(result.status);
        setNotice('Notifications enabled.');
      } else {
        setNotice('Notifications disabled.');
      }
    } catch (e) {
      setNotifEnabled(!next);
      setError(e instanceof Error ? e.message : 'Failed to toggle notifications.');
    }
  }, [setError, setNotice]);

  const handleNotifOffsetChange = useCallback(async (offset: ReminderOffset) => {
    const prev = notifDefaultOffset;
    setNotifDefaultOffset(offset);
    try {
      await getUntask().settings.set(NOTIFICATIONS_DEFAULT_OFFSET_KEY, offset);
    } catch {
      setNotifDefaultOffset(prev);
    }
  }, [notifDefaultOffset]);

  const handleNotifSoundToggle = useCallback(async (value: 'on' | 'off') => {
    const next = value === 'on';
    setNotifSound(next);
    try {
      await getUntask().settings.set(NOTIFICATIONS_SOUND_KEY, String(next));
    } catch {
      setNotifSound(!next);
    }
  }, []);

  const handleOpenNotifSettings = useCallback(() => {
    void getUntask().notifications.openSettings();
  }, []);

  // ─── Apple Reminders state ──────────────────────────────────
  const [enabled, setEnabled] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [syncFilter, setSyncFilter] = useState<RemindersSyncFilter>('due_date_only');
  const [importEnabled, setImportEnabled] = useState(true);
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
      setImportEnabled(result.importEnabled);
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

  const handleImportToggle = useCallback(
    async (value: 'on' | 'off') => {
      const nextEnabled = value === 'on';
      const previousEnabled = importEnabled;
      setImportEnabled(nextEnabled);
      setNotice(null);
      setError(null);

      try {
        setIsSaving(true);
        await getUntask().reminders.setImport(nextEnabled);
        setNotice(nextEnabled ? 'Import from Reminders enabled.' : 'Import from Reminders disabled.');
      } catch (e) {
        setImportEnabled(previousEnabled);
        setError(e instanceof Error ? e.message : 'Failed to update import setting.');
      } finally {
        setIsSaving(false);
      }
    },
    [importEnabled, setError, setNotice],
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

  const handleImportFromReminders = useCallback(async () => {
    setNotice(null);
    setError(null);

    try {
      setIsSaving(true);
      await getUntask().reminders.pullOnly();
      setNotice('Import complete.');
      void loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
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
      <SettingsSection title="Notifications">
        <SettingsRow
          label="Notifications"
          hint={
            notifPermission === 'denied' && notifEnabled
              ? (
                <span className="text-amber-500">
                  Notifications are blocked by macOS.{' '}
                  <button
                    type="button"
                    className="underline hover:text-amber-400"
                    onClick={handleOpenNotifSettings}
                  >
                    Open System Settings
                  </button>
                </span>
              )
              : 'Get reminders when tasks are due.'
          }
          loading={notifLoading}
        >
          <SegmentedControl
            options={[
              { value: 'on' as const, label: 'On' },
              { value: 'off' as const, label: 'Off' },
            ]}
            value={notifEnabled ? 'on' : 'off'}
            onChange={(v) => void handleNotifToggle(v as 'on' | 'off')}
          />
        </SettingsRow>

        {notifEnabled && (
          <>
            <SettingsRow
              label="Default reminder"
              hint="New tasks with a due date will use this reminder."
            >
              <SegmentedControl
                options={[
                  { value: 'at_due' as const, label: 'At due' },
                  { value: '15m' as const, label: '15m' },
                  { value: '1h' as const, label: '1h' },
                  { value: '1d' as const, label: '1d' },
                ]}
                value={notifDefaultOffset}
                onChange={(v) => void handleNotifOffsetChange(v as ReminderOffset)}
              />
            </SettingsRow>

            <SettingsRow
              label="Sound"
              hint="Play a sound with notifications."
            >
              <SegmentedControl
                options={[
                  { value: 'on' as const, label: 'On' },
                  { value: 'off' as const, label: 'Off' },
                ]}
                value={notifSound ? 'on' : 'off'}
                onChange={(v) => void handleNotifSoundToggle(v as 'on' | 'off')}
              />
            </SettingsRow>
          </>
        )}
      </SettingsSection>

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
              label="Which tasks sync"
              hint="Choose which Untask tasks appear in Reminders."
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
              label="Auto-import"
              hint="Pull reminders added to Untask list in Apple Reminders."
            >
              <SegmentedControl
                options={[
                  { value: 'on' as const, label: 'On' },
                  { value: 'off' as const, label: 'Off' },
                ]}
                value={importEnabled ? 'on' : 'off'}
                onChange={(v) => void handleImportToggle(v as 'on' | 'off')}
                disabled={isSaving}
              />
            </SettingsRow>

            <SettingsRow
              label="Sync now"
              hint="Push Untask changes to Reminders and pull any changes back."
            >
              <button
                type="button"
                className="rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void handleForceSync()}
                disabled={isSaving || syncStatus.status === 'syncing'}
              >
                {syncStatus.status === 'syncing' ? 'Syncing...' : 'Sync'}
              </button>
            </SettingsRow>

            <SettingsRow
              label="Import now"
              hint="Pull reminders from Apple Reminders without pushing changes."
            >
              <button
                type="button"
                className="rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void handleImportFromReminders()}
                disabled={isSaving || syncStatus.status === 'syncing'}
              >
                Import
              </button>
            </SettingsRow>
          </>
        )}
      </SettingsSection>
    </div>
  );
};
