import { useCallback, useEffect, useState } from 'react';

import type {
  BackupMetadataPayload,
  BackupOffsiteManifestPayload,
  BackupSettingsFrequency,
  BackupSettingsPayload,
} from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
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

const formatBackupSummary = (manifest: BackupOffsiteManifestPayload): string => {
  return `${new Date(manifest.createdAt).toLocaleString()} · ${manifest.taskCount} tasks · ${manifest.noteCount} notes · ${manifest.attachmentCount} attachments`;
};

export const SettingsBackup = ({ setError, setNotice }: SettingsBackupProps) => {
  const [backups, setBackups] = useState<BackupMetadataPayload[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState<string | null>(null);

  const [isLoadingOffsite, setIsLoadingOffsite] = useState(false);
  const [isSavingOffsite, setIsSavingOffsite] = useState(false);
  const [isRunningOffsiteBackup, setIsRunningOffsiteBackup] = useState(false);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [isRestoringOffsite, setIsRestoringOffsite] = useState(false);

  const [offsiteSettings, setOffsiteSettings] = useState<BackupSettingsPayload | null>(null);
  const [destination, setDestination] = useState('');
  const [frequency, setFrequency] = useState<BackupSettingsFrequency>('daily');
  const [retention, setRetention] = useState('10');
  const [cloudFolders, setCloudFolders] = useState<string[]>([]);

  const [selectedOffsiteSource, setSelectedOffsiteSource] = useState<string | null>(null);
  const [selectedOffsiteManifest, setSelectedOffsiteManifest] =
    useState<BackupOffsiteManifestPayload | null>(null);

  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');

  const loadBackups = useCallback(async () => {
    try {
      setIsLoadingBackups(true);
      const result = await getUntask().backup.list();
      setBackups(result.backups);
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  const loadOffsiteConfig = useCallback(async () => {
    try {
      setIsLoadingOffsite(true);
      const [settings, folders] = await Promise.all([
        getUntask().backup.getSettings(),
        getUntask().backup.detectCloudFolders(),
      ]);
      setOffsiteSettings(settings);
      setDestination(settings.destination);
      setFrequency(settings.frequency);
      setRetention(String(settings.retention));
      setCloudFolders(folders);
    } finally {
      setIsLoadingOffsite(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        await Promise.all([loadBackups(), loadOffsiteConfig()]);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load backup settings.');
      }
    })();
  }, [loadBackups, loadOffsiteConfig, setError]);

  const saveOffsiteSettings = useCallback(async (): Promise<BackupSettingsPayload | null> => {
    const normalizedDestination = destination.trim();
    const retentionValue = Number.parseInt(retention, 10);

    if (Number.isNaN(retentionValue) || retentionValue < 1 || retentionValue > 50) {
      setError('Retention must be between 1 and 50.');
      return null;
    }

    try {
      setIsSavingOffsite(true);
      setError(null);
      const settings = await getUntask().backup.setSettings({
        destination: normalizedDestination,
        frequency,
        retention: retentionValue,
      });
      setOffsiteSettings(settings);
      setDestination(settings.destination);
      setFrequency(settings.frequency);
      setRetention(String(settings.retention));
      setNotice('Backup settings saved.');
      return settings;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save backup settings.');
      return null;
    } finally {
      setIsSavingOffsite(false);
    }
  }, [destination, frequency, retention, setError, setNotice]);

  const handlePickDestinationFolder = useCallback(async () => {
    try {
      setError(null);
      const result = await getUntask().backup.pickDestinationFolder();
      if (result.canceled || !result.destination) {
        return;
      }
      setDestination(result.destination);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to choose destination folder.');
    }
  }, [setError]);

  const handleOffsiteBackupNow = useCallback(async () => {
    const settings = await saveOffsiteSettings();
    if (!settings) return;
    if (!settings.destination) {
      setError('Choose a destination folder before running offsite backup.');
      return;
    }

    try {
      setIsRunningOffsiteBackup(true);
      setError(null);
      const backup = await getUntask().backup.offsiteCreate();
      setNotice(`Offsite backup created: ${backup.filename}`);
      await loadOffsiteConfig();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to run offsite backup.');
    } finally {
      setIsRunningOffsiteBackup(false);
    }
  }, [loadOffsiteConfig, saveOffsiteSettings, setError, setNotice]);

  const handleSelectRestoreFile = useCallback(async () => {
    try {
      setIsLoadingManifest(true);
      setError(null);
      setSelectedOffsiteManifest(null);
      setSelectedOffsiteSource(null);

      const picked = await getUntask().backup.pickOffsiteFile();
      if (picked.canceled || !picked.source) {
        return;
      }

      const manifest = await getUntask().backup.readOffsiteManifest({
        source: picked.source,
      });

      setSelectedOffsiteSource(picked.source);
      setSelectedOffsiteManifest(manifest);
      setNotice('Backup manifest loaded. Review and confirm restore.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load backup manifest.');
    } finally {
      setIsLoadingManifest(false);
    }
  }, [setError, setNotice]);

  const handleConfirmOffsiteRestore = useCallback(async () => {
    if (!selectedOffsiteSource || !selectedOffsiteManifest) {
      return;
    }

    const confirmed = window.confirm(
      `Restore backup from ${new Date(selectedOffsiteManifest.createdAt).toLocaleString()}? This replaces all current data and cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsRestoringOffsite(true);
      setError(null);
      await getUntask().backup.restoreOffsite({ source: selectedOffsiteSource });
      setNotice('Backup restored. Reloading app state...');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to restore backup.');
    } finally {
      setIsRestoringOffsite(false);
    }
  }, [selectedOffsiteManifest, selectedOffsiteSource, setError, setNotice]);

  const handleCreateBackup = useCallback(async () => {
    try {
      setIsCreatingBackup(true);
      setError(null);
      setNotice(null);
      await getUntask().backup.create();
      setNotice('Local backup created successfully.');
      await loadBackups();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create backup.');
    } finally {
      setIsCreatingBackup(false);
    }
  }, [loadBackups, setError, setNotice]);

  const handleExportBackup = useCallback(async () => {
    try {
      setIsExportingBackup(true);
      setError(null);
      setNotice(null);

      const response = await getUntask().backup.exportWithDialog({
        passphrase: exportPassphrase.trim() || undefined,
      });

      if (response.canceled) {
        setNotice('Backup export canceled.');
        return;
      }

      setNotice(`Backup exported to ${response.destination ?? 'selected path'}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export backup.');
    } finally {
      setIsExportingBackup(false);
    }
  }, [exportPassphrase, setError, setNotice]);

  const handleImportBackupFromFile = useCallback(async () => {
    try {
      setIsImportingBackup(true);
      setError(null);
      setNotice(null);

      const response = await getUntask().backup.importWithDialog({
        passphrase: importPassphrase.trim() || undefined,
      });

      if (response.canceled) {
        setNotice('Backup import canceled.');
        return;
      }

      setNotice('Backup restored. Reloading app state...');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import backup.');
    } finally {
      setIsImportingBackup(false);
    }
  }, [importPassphrase, setError, setNotice]);

  const handleRestoreBackup = useCallback(
    async (backup: BackupMetadataPayload) => {
      const confirmed = window.confirm(
        `Restore backup "${backup.filename}"? Current data will be replaced after a safety snapshot is created.`,
      );

      if (!confirmed) {
        return;
      }

      try {
        setRestoringBackupFilename(backup.filename);
        setError(null);
        setNotice(null);

        await getUntask().backup.import({
          source: backup.path,
          passphrase: importPassphrase.trim() || undefined,
        });

        setNotice(`Backup ${backup.filename} restored. Reloading app state...`);
      } catch (restoreError) {
        setError(restoreError instanceof Error ? restoreError.message : 'Failed to restore backup.');
      } finally {
        setRestoringBackupFilename(null);
      }
    },
    [importPassphrase, setError, setNotice],
  );

  return (
    <div role="tabpanel" id="settings-panel-backup" className="space-y-3">
      <SettingsSection title="Offsite Backup">
        <SettingsRow
          label="Destination folder"
          hint="Choose any cloud-synced folder (iCloud Drive, Dropbox, etc.)."
        >
          <div className="flex items-center gap-1.5">
            <Input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Select destination folder"
              className="h-7 w-[280px] text-[11px]"
              aria-label="Offsite backup destination folder"
              disabled={isLoadingOffsite || isSavingOffsite}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => void handlePickDestinationFolder()}
              disabled={isLoadingOffsite || isSavingOffsite}
            >
              Choose…
            </Button>
          </div>
        </SettingsRow>

        {cloudFolders.length > 0 ? (
          <SettingsRow label="Cloud suggestions" hint="Quick-apply detected folders.">
            <div className="flex flex-wrap gap-1.5">
              {cloudFolders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setDestination(folder)}
                  className="rounded border border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {folder}
                </button>
              ))}
            </div>
          </SettingsRow>
        ) : null}

        <SettingsRow label="Frequency" hint="How often scheduled backups run.">
          <SettingsSelect
            options={FREQUENCY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
            value={frequency}
            onChange={(value) => setFrequency(value as BackupSettingsFrequency)}
            disabled={isLoadingOffsite || isSavingOffsite}
            aria-label="Offsite backup frequency"
            className="w-32"
          />
        </SettingsRow>

        <SettingsRow label="Retention" hint="How many offsite backups to keep.">
          <SettingsSelect
            options={RETENTION_OPTIONS}
            value={retention}
            onChange={setRetention}
            disabled={isLoadingOffsite || isSavingOffsite}
            aria-label="Offsite backup retention"
            className="w-28"
          />
        </SettingsRow>

        <SettingsRow label="Last backup" hint="Last scheduled backup timestamp.">
          <p className="text-[11px] text-muted-foreground">
            {offsiteSettings?.lastRunAt ? new Date(offsiteSettings.lastRunAt).toLocaleString() : 'Never'}
          </p>
        </SettingsRow>

        <div className="flex items-center gap-1.5 px-2 py-2">
          <Button
            type="button"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => void saveOffsiteSettings()}
            disabled={isSavingOffsite || isLoadingOffsite}
          >
            {isSavingOffsite ? 'Saving…' : 'Save settings'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => void handleOffsiteBackupNow()}
            disabled={isRunningOffsiteBackup || isLoadingOffsite}
          >
            {isRunningOffsiteBackup ? 'Backing up…' : 'Back up now'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => void handleSelectRestoreFile()}
            disabled={isLoadingManifest || isRestoringOffsite}
          >
            {isLoadingManifest ? 'Reading backup…' : 'Restore from backup'}
          </Button>
        </div>

        {selectedOffsiteManifest && selectedOffsiteSource ? (
          <div className="mx-2 rounded-md border border-border/60 px-2 py-2">
            <p className="text-[11px] text-foreground">
              {formatBackupSummary(selectedOffsiteManifest)}
            </p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{selectedOffsiteSource}</p>
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => void handleConfirmOffsiteRestore()}
                disabled={isRestoringOffsite}
              >
                {isRestoringOffsite ? 'Restoring…' : 'Confirm restore'}
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Manual Export/Import">
        <SettingsRow label="Export passphrase" hint="Optional passphrase for encrypted exports.">
          <Input
            type="password"
            value={exportPassphrase}
            onChange={(event) => setExportPassphrase(event.target.value)}
            placeholder="Optional passphrase"
            className="h-7 w-44 text-[11px]"
            aria-label="Backup export passphrase"
          />
        </SettingsRow>
        <SettingsRow label="Import passphrase" hint="Required only for encrypted backups.">
          <Input
            type="password"
            value={importPassphrase}
            onChange={(event) => setImportPassphrase(event.target.value)}
            placeholder="Passphrase for encrypted backup"
            className="h-7 w-44 text-[11px]"
            aria-label="Backup import passphrase"
          />
        </SettingsRow>
        <div className="flex items-center gap-1.5 px-2 py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleExportBackup()}
            disabled={isExportingBackup}
            className="h-7 text-[11px]"
          >
            {isExportingBackup ? 'Exporting...' : 'Export'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleImportBackupFromFile()}
            disabled={isImportingBackup}
            className="h-7 text-[11px]"
          >
            {isImportingBackup ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Local Backups">
        <div className="flex items-center gap-1.5 px-2 py-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCreateBackup()}
            disabled={isCreatingBackup}
            className="h-7 text-[11px]"
          >
            {isCreatingBackup ? 'Creating...' : 'Create local backup'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void loadBackups()}
            disabled={isLoadingBackups}
            className="h-7 text-[11px]"
          >
            Refresh
          </Button>
        </div>

        {isLoadingBackups ? (
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground">Loading backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground">No backups found.</p>
          </div>
        ) : (
          backups.map((backup) => (
            <div
              key={backup.filename}
              className="flex items-center justify-between gap-3 px-2 py-2"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <span className="text-[13px] text-foreground">{backup.filename}</span>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {new Date(backup.createdAt).toLocaleString()} · {(backup.sizeBytes / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRestoreBackup(backup)}
                disabled={restoringBackupFilename !== null}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {restoringBackupFilename === backup.filename ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          ))
        )}
      </SettingsSection>
    </div>
  );
};
