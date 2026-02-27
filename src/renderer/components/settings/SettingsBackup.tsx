import { useCallback, useEffect, useState } from 'react';

import type {
  BackupListWithManifestsEntry,
  BackupSettingsFrequency,
  BackupSettingsPayload,
} from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';

type SettingsBackupProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

const FREQUENCY_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const;

const RETENTION_OPTIONS = [
  { value: '5', label: 'Keep 5' },
  { value: '10', label: 'Keep 10' },
  { value: '20', label: 'Keep 20' },
  { value: '30', label: 'Keep 30' },
  { value: '50', label: 'Keep 50' },
];

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SettingsBackup = ({ setError, setNotice }: SettingsBackupProps) => {
  // ─── Settings state ──────────────────────────────────────
  const [settings, setSettings] = useState<BackupSettingsPayload | null>(null);
  const [destination, setDestination] = useState('');
  const [frequency, setFrequency] = useState<BackupSettingsFrequency>('daily');
  const [retention, setRetention] = useState('10');
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  // ─── Backup history state ────────────────────────────────
  const [backups, setBackups] = useState<BackupListWithManifestsEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // ─── Action state ────────────────────────────────────────
  const [isBackingUpNow, setIsBackingUpNow] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);

  // ─── Load settings ───────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const s = await getUntask().backup.getSettings();
      setSettings(s);
      setDestination(s.destination);
      setFrequency(s.frequency);
      setRetention(String(s.retention));
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  // ─── Load backup history ─────────────────────────────────
  const loadBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    try {
      const result = await getUntask().backup.listWithManifests();
      setBackups(result.backups);
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        await Promise.all([loadSettings(), loadBackups()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load backup settings.');
      }
    })();
  }, [loadSettings, loadBackups, setError]);

  // ─── Auto-save helpers ───────────────────────────────────
  const saveSettings = useCallback(
    async (patch: Partial<{ destination: string; frequency: BackupSettingsFrequency; retention: string }>) => {
      const newDestination = patch.destination ?? destination;
      const newFrequency = patch.frequency ?? frequency;
      const newRetention = patch.retention ?? retention;
      const retentionValue = Number.parseInt(newRetention, 10);

      if (Number.isNaN(retentionValue) || retentionValue < 1 || retentionValue > 50) {
        setError('Retention must be between 1 and 50.');
        return;
      }

      try {
        setError(null);
        const updated = await getUntask().backup.setSettings({
          destination: newDestination,
          frequency: newFrequency,
          retention: retentionValue,
        });
        setSettings(updated);
        setDestination(updated.destination);
        setFrequency(updated.frequency);
        setRetention(String(updated.retention));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save backup settings.');
      }
    },
    [destination, frequency, retention, setError],
  );

  // ─── Folder picker ───────────────────────────────────────
  const handlePickFolder = useCallback(async () => {
    try {
      setError(null);
      const result = await getUntask().backup.pickDestinationFolder();
      if (result.canceled || !result.destination) return;
      setDestination(result.destination);
      await saveSettings({ destination: result.destination });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to choose destination folder.');
    }
  }, [saveSettings, setError]);

  // ─── Back up now ─────────────────────────────────────────
  const handleBackUpNow = useCallback(async () => {
    try {
      setIsBackingUpNow(true);
      setError(null);
      await getUntask().backup.offsiteCreate();
      setNotice('Backup created.');
      await Promise.all([loadSettings(), loadBackups()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup.');
    } finally {
      setIsBackingUpNow(false);
    }
  }, [loadBackups, loadSettings, setError, setNotice]);

  // ─── Restore ─────────────────────────────────────────────
  const handleRestore = useCallback(
    async (backup: BackupListWithManifestsEntry) => {
      const confirmed = window.confirm(
        `Restore from ${formatDate(backup.createdAt)}? This replaces all current data. A safety backup will be created first.`,
      );
      if (!confirmed) return;

      try {
        setRestoringPath(backup.path);
        setError(null);
        await getUntask().backup.restoreOffsite({ source: backup.path });
        setNotice('Backup restored. Reloading app state…');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore backup.');
      } finally {
        setRestoringPath(null);
      }
    },
    [setError, setNotice],
  );

  // ─── Delete ──────────────────────────────────────────────
  const handleDelete = useCallback(
    async (backup: BackupListWithManifestsEntry) => {
      const confirmed = window.confirm(`Delete backup from ${formatDate(backup.createdAt)}?`);
      if (!confirmed) return;

      try {
        setDeletingPath(backup.path);
        setError(null);
        await getUntask().backup.delete({ path: backup.path });
        setNotice('Backup deleted.');
        await loadBackups();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete backup.');
      } finally {
        setDeletingPath(null);
      }
    },
    [loadBackups, setError, setNotice],
  );

  // ─── Show in Finder ──────────────────────────────────────
  const handleReveal = useCallback(
    async (backup: BackupListWithManifestsEntry) => {
      try {
        setError(null);
        await getUntask().backup.reveal({ path: backup.path });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reveal backup.');
      }
    },
    [setError],
  );

  // ─── Import from file ────────────────────────────────────
  const handleImportFromFile = useCallback(async () => {
    try {
      setIsImporting(true);
      setError(null);

      const picked = await getUntask().backup.pickOffsiteFile();
      if (picked.canceled || !picked.source) return;

      await getUntask().backup.restoreOffsite({ source: picked.source });
      setNotice('Backup restored. Reloading app state…');
      // Refresh in case APP_BACKUP_RESTORED doesn't trigger a full reload
      // (e.g. main window unavailable at the time of restore).
      await loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import backup.');
    } finally {
      setIsImporting(false);
    }
  }, [loadBackups, setError, setNotice]);

  const isBusy = isLoadingSettings || isBackingUpNow;

  return (
    <div role="tabpanel" id="settings-panel-backup" className="space-y-3">
      {/* ── Section 1: Automatic Backups ── */}
      <SettingsSection title="Automatic Backups">
        <SettingsRow
          label="Backup folder"
          hint="Pick a cloud-synced folder (iCloud Drive, Dropbox) to keep backups off this machine."
        >
          <div className="flex items-center gap-1.5">
            <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">
              {destination || 'Not set'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => void handlePickFolder()}
              disabled={isBusy}
            >
              Change…
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow label="Frequency" hint="How often automatic backups run.">
          <SettingsSelect
            options={FREQUENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={frequency}
            onChange={(value) => {
              const next = value as BackupSettingsFrequency;
              setFrequency(next);
              void saveSettings({ frequency: next });
            }}
            disabled={isBusy}
            aria-label="Backup frequency"
            className="w-32"
          />
        </SettingsRow>

        <SettingsRow label="Keep" hint="Maximum number of backups to keep.">
          <SettingsSelect
            options={RETENTION_OPTIONS}
            value={retention}
            onChange={(value) => {
              setRetention(value);
              void saveSettings({ retention: value });
            }}
            disabled={isBusy}
            aria-label="Backup retention"
            className="w-28"
          />
        </SettingsRow>

        <SettingsRow label="Last backup" hint="When the most recent backup was created.">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {settings?.lastRunAt ? formatDate(settings.lastRunAt) : 'Never'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => void handleBackUpNow()}
              disabled={isBusy}
            >
              {isBackingUpNow ? 'Backing up…' : 'Back up now'}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* ── Section 2: Backup History ── */}
      <SettingsSection title="Backup History">
        {isLoadingBackups ? (
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground">No backups found.</p>
          </div>
        ) : (
          backups.map((backup) => {
            const isRestoring = restoringPath === backup.path;
            const isDeleting = deletingPath === backup.path;
            const isRowBusy = isRestoring || isDeleting || restoringPath !== null || deletingPath !== null;

            return (
              <div
                key={backup.path}
                className="border-t border-border/40 px-2 py-2 first:border-t-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-[12px] font-medium text-foreground">
                      {formatDate(backup.createdAt)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {backup.taskCount} tasks · {backup.noteCount} notes · {backup.attachmentCount} attachments
                      {' · '}
                      {formatSize(backup.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleRestore(backup)}
                      disabled={isRowBusy}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isRestoring ? 'Restoring…' : 'Restore'}
                    </button>
                    <span className="text-[11px] text-border">·</span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(backup)}
                      disabled={isRowBusy}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                    <span className="text-[11px] text-border">·</span>
                    <button
                      type="button"
                      onClick={() => void handleReveal(backup)}
                      disabled={isRowBusy}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      Show in Finder
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div className="flex justify-end border-t border-border/40 px-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => void handleImportFromFile()}
            disabled={isImporting || restoringPath !== null || deletingPath !== null}
          >
            {isImporting ? 'Importing…' : 'Import from file…'}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
};
