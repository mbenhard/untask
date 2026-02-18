import { useCallback, useEffect, useState } from 'react';

import type { BackupMetadataPayload } from '../../../types/ipc';
import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

type SettingsBackupProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export const SettingsBackup = ({ setError, setNotice }: SettingsBackupProps) => {
  const [backups, setBackups] = useState<BackupMetadataPayload[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState<string | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');

  const loadBackups = useCallback(async () => {
    try {
      setIsLoadingBackups(true);
      setError(null);
      const result = await getUntask().backup.list();
      setBackups(result.backups);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load backups.');
    } finally {
      setIsLoadingBackups(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = useCallback(async () => {
    try {
      setIsCreatingBackup(true);
      setError(null);
      setNotice(null);
      await getUntask().backup.create();
      setNotice('Backup created successfully.');
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
    <div role="tabpanel" id="settings-panel-backup" className="space-y-6">
      <SettingsSection title="Actions">
        <div className="flex items-center gap-2 py-2.5">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCreateBackup()}
            disabled={isCreatingBackup}
            className="h-8 text-[11px]"
          >
            {isCreatingBackup ? 'Creating...' : 'Create backup'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleExportBackup()}
            disabled={isExportingBackup}
            className="h-8 text-[11px]"
          >
            {isExportingBackup ? 'Exporting...' : 'Export'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleImportBackupFromFile()}
            disabled={isImportingBackup || restoringBackupFilename !== null}
            className="h-8 text-[11px]"
          >
            {isImportingBackup ? 'Importing...' : 'Import'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void loadBackups()}
            disabled={isLoadingBackups}
            className="h-8 text-[11px]"
          >
            Refresh
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Encryption">
        <SettingsRow label="Export passphrase" hint="Optional passphrase for encrypted exports.">
          <Input
            type="password"
            value={exportPassphrase}
            onChange={(event) => setExportPassphrase(event.target.value)}
            placeholder="Optional passphrase"
            className="h-8 w-48 text-[12px]"
            aria-label="Backup export passphrase"
          />
        </SettingsRow>
        <SettingsRow label="Import passphrase" hint="Required only for encrypted backups.">
          <Input
            type="password"
            value={importPassphrase}
            onChange={(event) => setImportPassphrase(event.target.value)}
            placeholder="Passphrase for encrypted backup"
            className="h-8 w-48 text-[12px]"
            aria-label="Backup import passphrase"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Backups">
        {isLoadingBackups ? (
          <div className="py-2.5">
            <p className="text-[11px] text-muted-foreground">Loading backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-2.5">
            <p className="text-[11px] text-muted-foreground">No backups found.</p>
          </div>
        ) : (
          backups.map((backup) => (
            <div
              key={backup.filename}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <span className="text-[13px] text-foreground">{backup.filename}</span>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(backup.createdAt).toLocaleString()} &middot;{' '}
                  {(backup.sizeBytes / 1024).toFixed(1)} KB
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
