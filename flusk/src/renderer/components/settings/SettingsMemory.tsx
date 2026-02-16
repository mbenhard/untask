import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { AiJournal } from '../../../types/models';
import type { ChatModelCatalogEntry } from '../../../types/chat';
import type {
  BackupMetadataPayload,
  SettingsMemoryStatePayload,
  SettingsReadJournalRequestPayload,
} from '../../../types/ipc';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useFocusTrap } from '../../hooks/useFocusTrap';

type SettingsMemoryProps = {
  onClose: () => void;
};

type SettingsTab = 'general' | 'ai' | 'memory' | 'journal' | 'chat' | 'shortcuts' | 'backup';

const TAB_ORDER: SettingsTab[] = ['general', 'ai', 'memory', 'journal', 'chat', 'shortcuts', 'backup'];

const TAB_LABELS: Record<SettingsTab, string> = {
  general: 'General',
  ai: 'AI',
  memory: 'Memory',
  journal: 'Journal',
  chat: 'Chat',
  shortcuts: 'Shortcuts',
  backup: 'Backup',
};

type ShortcutEntry = {
  key: string;
  label: string;
  defaultAccelerator: string;
};

const SHORTCUT_ENTRIES: ShortcutEntry[] = [
  { key: 'shortcut.toggleWindow', label: 'Toggle window', defaultAccelerator: 'CommandOrControl+Shift+Space' },
  { key: 'shortcut.quickAdd', label: 'Quick add', defaultAccelerator: 'CommandOrControl+Shift+A' },
];

const MEMORY_FIELD_LABELS: Record<'soul' | 'profile' | 'patterns', string> = {
  soul: 'Soul',
  profile: 'Profile',
  patterns: 'Patterns',
};

const EMPTY_MEMORY_STATE: SettingsMemoryStatePayload = {
  soul: '',
  profile: '',
  patterns: '',
};

const DEFAULT_JOURNAL_FILTERS: SettingsReadJournalRequestPayload = {
  limit: 20,
  days_back: 30,
};

const OPENROUTER_API_KEY_SETTING_KEY = 'ai_openrouter_key';

type MemorySubTab = 'soul' | 'profile' | 'patterns';

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};

export const SettingsMemory = ({ onClose }: SettingsMemoryProps) => {
  const settingsRef = useRef<HTMLElement>(null);
  useFocusTrap(settingsRef, true);
  const prefersReducedMotion = useReducedMotion();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [memorySubTab, setMemorySubTab] = useState<MemorySubTab>('soul');
  const [draft, setDraft] = useState<SettingsMemoryStatePayload>(EMPTY_MEMORY_STATE);
  const [journalEntries, setJournalEntries] = useState<AiJournal[]>([]);
  const [journalFilters, setJournalFilters] = useState<SettingsReadJournalRequestPayload>(
    DEFAULT_JOURNAL_FILTERS,
  );

  // Loading / saving states
  const [isLoadingMemory, setIsLoadingMemory] = useState(true);
  const [isLoadingJournal, setIsLoadingJournal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // General tab state
  const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
  const [launchAtLoginApplied, setLaunchAtLoginApplied] = useState(false);
  const [launchAtLoginError, setLaunchAtLoginError] = useState<string | null>(null);
  const [isLoadingLaunchAtLogin, setIsLoadingLaunchAtLogin] = useState(false);
  const [isSavingLaunchAtLogin, setIsSavingLaunchAtLogin] = useState(false);

  // AI tab state
  const [openRouterApiKeyInput, setOpenRouterApiKeyInput] = useState('');
  const [hasOpenRouterApiKey, setHasOpenRouterApiKey] = useState(false);
  const [isLoadingOpenRouterApiKey, setIsLoadingOpenRouterApiKey] = useState(false);
  const [isSavingOpenRouterApiKey, setIsSavingOpenRouterApiKey] = useState(false);
  const [models, setModels] = useState<ChatModelCatalogEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [autonomyMode, setAutonomyMode] = useState<'manual' | 'safe' | 'autopilot'>('safe');
  const [isLoadingAutonomy, setIsLoadingAutonomy] = useState(false);

  // Chat tab state
  const [retentionMode, setRetentionMode] = useState<'session' | '30d' | 'forever'>('session');
  const [isLoadingRetention, setIsLoadingRetention] = useState(false);

  // Backup tab state
  const [backups, setBackups] = useState<BackupMetadataPayload[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState<string | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');

  // Shortcuts tab state
  const [shortcutDrafts, setShortcutDrafts] = useState<Record<string, string>>({});
  const [isLoadingShortcuts, setIsLoadingShortcuts] = useState(false);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);

  // ─── Load actions ────────────────────────────────────────

  const loadMemoryState = useCallback(async () => {
    try {
      setIsLoadingMemory(true);
      setError(null);
      const next = await flusk().settings.getMemoryState();
      setDraft(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load memory state.');
    } finally {
      setIsLoadingMemory(false);
    }
  }, []);

  const loadJournal = useCallback(async () => {
    try {
      setIsLoadingJournal(true);
      setError(null);
      const response = await flusk().settings.readJournal(journalFilters);
      setJournalEntries(response.entries);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load journal.');
    } finally {
      setIsLoadingJournal(false);
    }
  }, [journalFilters]);

  const loadLaunchAtLogin = useCallback(async () => {
    try {
      setIsLoadingLaunchAtLogin(true);
      setLaunchAtLoginError(null);
      const result = await flusk().app.getLaunchAtLogin();
      setLaunchAtLoginEnabled(result.enabled);
      setLaunchAtLoginApplied(result.applied);
      if (result.error) {
        setLaunchAtLoginError(result.error);
      }
    } catch (loadError) {
      setLaunchAtLoginError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load launch-at-login settings.',
      );
    } finally {
      setIsLoadingLaunchAtLogin(false);
    }
  }, []);

  const loadOpenRouterApiKey = useCallback(async () => {
    try {
      setIsLoadingOpenRouterApiKey(true);
      setError(null);
      const stored = await flusk().settings.get(OPENROUTER_API_KEY_SETTING_KEY);
      setHasOpenRouterApiKey(Boolean(stored && stored.trim().length > 0));
      setOpenRouterApiKeyInput('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load OpenRouter API key.');
    } finally {
      setIsLoadingOpenRouterApiKey(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      setIsLoadingModels(true);
      const catalog = await flusk().chat.getModels();
      setModels(catalog);
      const selected = catalog.find((m) => m.selected);
      if (selected) {
        setSelectedModelId(selected.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load models.');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  const loadAutonomyMode = useCallback(async () => {
    try {
      setIsLoadingAutonomy(true);
      const result = await flusk().chat.getAutonomyMode();
      setAutonomyMode(result.mode);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load autonomy mode.');
    } finally {
      setIsLoadingAutonomy(false);
    }
  }, []);

  const loadRetentionMode = useCallback(async () => {
    try {
      setIsLoadingRetention(true);
      const result = await flusk().chat.getRetentionMode();
      setRetentionMode(result.mode);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load retention mode.');
    } finally {
      setIsLoadingRetention(false);
    }
  }, []);

  const loadShortcuts = useCallback(async () => {
    try {
      setIsLoadingShortcuts(true);
      setError(null);
      const drafts: Record<string, string> = {};
      for (const entry of SHORTCUT_ENTRIES) {
        const stored = await flusk().settings.get(entry.key);
        drafts[entry.key] = stored && stored.trim().length > 0
          ? stored
          : entry.defaultAccelerator;
      }
      setShortcutDrafts(drafts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load shortcuts.');
    } finally {
      setIsLoadingShortcuts(false);
    }
  }, []);

  const saveShortcut = useCallback(async (key: string, value: string) => {
    try {
      setIsSavingShortcut(true);
      setError(null);
      setNotice(null);
      await flusk().settings.set(key, value);
      setNotice('Shortcut saved. Restart app to apply.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save shortcut.');
    } finally {
      setIsSavingShortcut(false);
    }
  }, []);

  const resetShortcut = useCallback(async (key: string, defaultValue: string) => {
    setShortcutDrafts((current) => ({ ...current, [key]: defaultValue }));
    try {
      setIsSavingShortcut(true);
      setError(null);
      setNotice(null);
      await flusk().settings.set(key, defaultValue);
      setNotice('Shortcut reset to default. Restart app to apply.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to reset shortcut.');
    } finally {
      setIsSavingShortcut(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      setIsLoadingBackups(true);
      setError(null);
      const result = await flusk().backup.list();
      setBackups(result.backups);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load backups.');
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  const handleCreateBackup = useCallback(async () => {
    try {
      setIsCreatingBackup(true);
      setError(null);
      setNotice(null);
      await flusk().backup.create();
      setNotice('Backup created successfully.');
      await loadBackups();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create backup.');
    } finally {
      setIsCreatingBackup(false);
    }
  }, [loadBackups]);

  const handleExportBackup = useCallback(async () => {
    try {
      setIsExportingBackup(true);
      setError(null);
      setNotice(null);

      const response = await flusk().backup.exportWithDialog({
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
  }, [exportPassphrase]);

  const handleImportBackupFromFile = useCallback(async () => {
    try {
      setIsImportingBackup(true);
      setError(null);
      setNotice(null);

      const response = await flusk().backup.importWithDialog({
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
  }, [importPassphrase]);

  const handleRestoreBackup = useCallback(async (backup: BackupMetadataPayload) => {
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

      await flusk().backup.import({
        source: backup.path,
        passphrase: importPassphrase.trim() || undefined,
      });

      setNotice(`Backup ${backup.filename} restored. Reloading app state...`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Failed to restore backup.');
    } finally {
      setRestoringBackupFilename(null);
    }
  }, [importPassphrase]);

  // ─── Lifecycle effects ───────────────────────────────────

  useEffect(() => {
    void loadMemoryState();
  }, [loadMemoryState]);

  useEffect(() => {
    if (activeTab === 'general') {
      void loadLaunchAtLogin();
    }
  }, [activeTab, loadLaunchAtLogin]);

  useEffect(() => {
    if (activeTab === 'ai') {
      void loadOpenRouterApiKey();
      void loadModels();
      void loadAutonomyMode();
    }
  }, [activeTab, loadOpenRouterApiKey, loadModels, loadAutonomyMode]);

  useEffect(() => {
    if (activeTab === 'journal') {
      void loadJournal();
    }
  }, [activeTab, loadJournal]);

  useEffect(() => {
    if (activeTab === 'chat') {
      void loadRetentionMode();
    }
  }, [activeTab, loadRetentionMode]);

  useEffect(() => {
    if (activeTab === 'shortcuts') {
      void loadShortcuts();
    }
  }, [activeTab, loadShortcuts]);

  useEffect(() => {
    if (activeTab === 'backup') {
      void loadBackups();
    }
  }, [activeTab, loadBackups]);

  // ─── Save actions ────────────────────────────────────────

  const saveField = useCallback(
    async (field: 'soul' | 'profile' | 'patterns') => {
      try {
        setIsSaving(true);
        setNotice(null);
        setError(null);
        const updated = await flusk().settings.updateMemoryState({ [field]: draft[field] });
        setDraft(updated);
        setNotice(`${MEMORY_FIELD_LABELS[field]} saved.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save memory.');
      } finally {
        setIsSaving(false);
      }
    },
    [draft],
  );

  const resetSoulField = useCallback(async () => {
    try {
      setIsSaving(true);
      setNotice(null);
      setError(null);
      const updated = await flusk().settings.resetSoul();
      setDraft(updated);
      setNotice('Soul reset to default.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Failed to reset soul.');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleLaunchAtLoginChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const nextEnabled = event.target.checked;
      const previousEnabled = launchAtLoginEnabled;

      setLaunchAtLoginEnabled(nextEnabled);
      setNotice(null);
      setLaunchAtLoginError(null);

      try {
        setIsSavingLaunchAtLogin(true);
        const result = await flusk().app.setLaunchAtLogin(nextEnabled);
        setLaunchAtLoginEnabled(result.enabled);
        setLaunchAtLoginApplied(result.applied);
        if (result.error) {
          setLaunchAtLoginError(result.error);
          setNotice('Preference saved, but this runtime could not apply it.');
          return;
        }

        setNotice(
          result.enabled ? 'Launch at login enabled.' : 'Launch at login disabled.',
        );
      } catch (saveError) {
        setLaunchAtLoginEnabled(previousEnabled);
        setLaunchAtLoginError(
          saveError instanceof Error
            ? saveError.message
            : 'Failed to update launch-at-login setting.',
        );
      } finally {
        setIsSavingLaunchAtLogin(false);
      }
    },
    [launchAtLoginEnabled],
  );

  const saveOpenRouterApiKey = useCallback(async () => {
    const normalized = openRouterApiKeyInput.trim();
    if (normalized.length === 0) {
      setError('Enter an OpenRouter API key before saving.');
      return;
    }

    try {
      setIsSavingOpenRouterApiKey(true);
      setError(null);
      setNotice(null);
      await flusk().settings.set(OPENROUTER_API_KEY_SETTING_KEY, normalized);
      setHasOpenRouterApiKey(true);
      setOpenRouterApiKeyInput('');
      setNotice('OpenRouter API key saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save OpenRouter API key.');
    } finally {
      setIsSavingOpenRouterApiKey(false);
    }
  }, [openRouterApiKeyInput]);

  const clearOpenRouterApiKey = useCallback(async () => {
    try {
      setIsSavingOpenRouterApiKey(true);
      setError(null);
      setNotice(null);
      await flusk().settings.set(OPENROUTER_API_KEY_SETTING_KEY, '');
      setHasOpenRouterApiKey(false);
      setOpenRouterApiKeyInput('');
      setNotice('OpenRouter API key cleared.');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Failed to clear OpenRouter API key.');
    } finally {
      setIsSavingOpenRouterApiKey(false);
    }
  }, []);

  const handleModelChange = useCallback(async (modelId: string) => {
    const previousId = selectedModelId;
    setSelectedModelId(modelId);
    setNotice(null);
    setError(null);

    try {
      const result = await flusk().chat.setSelectedModel({ modelId });
      setSelectedModelId(result.modelId);
      setNotice('Model updated.');
    } catch (saveError) {
      setSelectedModelId(previousId);
      setError(saveError instanceof Error ? saveError.message : 'Failed to update model.');
    }
  }, [selectedModelId]);

  const handleAutonomyChange = useCallback(async (mode: 'manual' | 'safe' | 'autopilot') => {
    const previousMode = autonomyMode;
    setAutonomyMode(mode);
    setNotice(null);
    setError(null);

    try {
      const result = await flusk().chat.setAutonomyMode({ mode });
      setAutonomyMode(result.mode);
      setNotice(`Autonomy mode set to ${result.mode}.`);
    } catch (saveError) {
      setAutonomyMode(previousMode);
      setError(saveError instanceof Error ? saveError.message : 'Failed to update autonomy mode.');
    }
  }, [autonomyMode]);

  const handleRetentionChange = useCallback(async (mode: 'session' | '30d' | 'forever') => {
    const previousMode = retentionMode;
    setRetentionMode(mode);
    setNotice(null);
    setError(null);

    try {
      const result = await flusk().chat.setRetentionMode({ mode });
      setRetentionMode(result.mode);
      setNotice(`Chat retention set to ${mode === '30d' ? '30 days' : mode}.`);
    } catch (saveError) {
      setRetentionMode(previousMode);
      setError(saveError instanceof Error ? saveError.message : 'Failed to update retention mode.');
    }
  }, [retentionMode]);

  const journalSummary = useMemo(() => {
    if (journalEntries.length === 0) {
      return 'No journal entries found for current filters.';
    }

    return `${journalEntries.length} entries loaded`;
  }, [journalEntries.length]);

  // ─── Render ──────────────────────────────────────────────

  return (
    <section
      ref={settingsRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="no-drag absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-sm"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 id="settings-title" className="text-sm font-semibold text-foreground">Settings</h2>
          <p className="text-xs text-muted-foreground">
            General, AI, memory, journal, and chat configuration.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      <nav className="flex items-center gap-2 border-b border-border px-4 py-2" role="tablist" aria-label="Settings sections">
        {TAB_ORDER.map((tab) => (
          <Button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`settings-panel-${tab}`}
            variant={activeTab === tab ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </Button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-3 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground">
            {notice}
          </p>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
          >
            {/* ─── General tab ─────────────────────────────── */}
            {activeTab === 'general' ? (
              <div role="tabpanel" id="settings-panel-general" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Configure desktop startup behavior.
                </p>
                <div className="rounded-md border border-border bg-card px-3 py-3">
                  <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                    <span>Launch Flusk at login</span>
                    <input
                      type="checkbox"
                      checked={launchAtLoginEnabled}
                      onChange={(event) => void handleLaunchAtLoginChange(event)}
                      disabled={isLoadingLaunchAtLogin || isSavingLaunchAtLogin}
                      className="h-4 w-4 rounded border border-input bg-background accent-foreground"
                    />
                  </label>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {isLoadingLaunchAtLogin
                      ? 'Checking availability...'
                      : launchAtLoginApplied
                        ? 'Supported in this runtime.'
                        : 'Not supported in this runtime (preference is still saved).'}
                  </p>

                  {launchAtLoginError ? (
                    <p className="mt-2 text-xs text-destructive">{launchAtLoginError}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ─── AI tab ──────────────────────────────────── */}
            {activeTab === 'ai' ? (
              <div role="tabpanel" id="settings-panel-ai" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Configure AI model, autonomy mode, and API credentials.
                </p>

                {/* Model selector */}
                <div className="rounded-md border border-border bg-card px-3 py-3">
                  <p className="text-sm font-medium text-foreground">Model</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select the AI model used for chat responses.
                  </p>
                  {isLoadingModels ? (
                    <p className="mt-2 text-xs text-muted-foreground">Loading models...</p>
                  ) : (
                    <select
                      value={selectedModelId ?? ''}
                      onChange={(event) => void handleModelChange(event.target.value)}
                      className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      aria-label="AI model"
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Autonomy mode */}
                <div className="rounded-md border border-border bg-card px-3 py-3">
                  <p className="text-sm font-medium text-foreground">Autonomy mode</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Controls how much the AI can act on its own.
                  </p>
                  {isLoadingAutonomy ? (
                    <p className="mt-2 text-xs text-muted-foreground">Loading...</p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      {(['manual', 'safe', 'autopilot'] as const).map((mode) => (
                        <Button
                          key={mode}
                          type="button"
                          variant={autonomyMode === mode ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => void handleAutonomyChange(mode)}
                        >
                          {mode === 'manual' ? 'Manual' : mode === 'safe' ? 'Safe' : 'Autopilot'}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {/* API key */}
                <div className="rounded-md border border-border bg-card px-3 py-3">
                  <p className="text-sm font-medium text-foreground">OpenRouter API key</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used for AI chat requests when the shell environment variable is not set.
                  </p>
                  <Input
                    type="password"
                    value={openRouterApiKeyInput}
                    onChange={(event) => setOpenRouterApiKeyInput(event.target.value)}
                    placeholder={hasOpenRouterApiKey ? 'Saved key (enter to replace)' : 'sk-or-...'}
                    disabled={isLoadingOpenRouterApiKey || isSavingOpenRouterApiKey}
                    className="mt-3"
                    aria-label="OpenRouter API key"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isLoadingOpenRouterApiKey
                      ? 'Checking key status...'
                      : hasOpenRouterApiKey
                        ? 'A key is currently saved.'
                        : 'No key saved yet.'}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveOpenRouterApiKey()}
                      disabled={isLoadingOpenRouterApiKey || isSavingOpenRouterApiKey}
                    >
                      Save key
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void clearOpenRouterApiKey()}
                      disabled={isLoadingOpenRouterApiKey || isSavingOpenRouterApiKey || !hasOpenRouterApiKey}
                    >
                      Clear key
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ─── Memory tab ──────────────────────────────── */}
            {activeTab === 'memory' ? (
              <div role="tabpanel" id="settings-panel-memory" className="space-y-3">
                {isLoadingMemory ? (
                  <p className="text-sm text-muted-foreground">Loading memory state...</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {(['soul', 'profile', 'patterns'] as const).map((sub) => (
                        <Button
                          key={sub}
                          type="button"
                          variant={memorySubTab === sub ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setMemorySubTab(sub)}
                        >
                          {MEMORY_FIELD_LABELS[sub]}
                        </Button>
                      ))}
                    </div>

                    {memorySubTab === 'soul' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Soul is your editable personality overlay on top of base assistant contracts.
                        </p>
                        <Textarea
                          value={draft.soul}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, soul: event.target.value }))
                          }
                          className="min-h-52"
                        />
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" onClick={() => void saveField('soul')} disabled={isSaving}>
                            Save Soul
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => void resetSoulField()} disabled={isSaving}>
                            Reset Soul
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {memorySubTab === 'profile' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Profile stores durable user facts and preferences.
                        </p>
                        <Textarea
                          value={draft.profile}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, profile: event.target.value }))
                          }
                          className="min-h-52"
                        />
                        <Button type="button" size="sm" onClick={() => void saveField('profile')} disabled={isSaving}>
                          Save Profile
                        </Button>
                      </div>
                    ) : null}

                    {memorySubTab === 'patterns' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Patterns capture repeated workflows and recurring structures.
                        </p>
                        <Textarea
                          value={draft.patterns}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, patterns: event.target.value }))
                          }
                          className="min-h-52"
                        />
                        <Button type="button" size="sm" onClick={() => void saveField('patterns')} disabled={isSaving}>
                          Save Patterns
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {/* ─── Journal tab ─────────────────────────────── */}
            {activeTab === 'journal' ? (
              <div role="tabpanel" id="settings-panel-journal" className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={journalFilters.limit ?? 20}
                    onChange={(event) =>
                      setJournalFilters((current) => ({
                        ...current,
                        limit: Number(event.target.value) || 20,
                      }))
                    }
                    aria-label="Journal limit"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={journalFilters.days_back ?? 30}
                    onChange={(event) =>
                      setJournalFilters((current) => ({
                        ...current,
                        days_back: Number(event.target.value) || 30,
                      }))
                    }
                    aria-label="Journal days back"
                  />
                  <select
                    value={journalFilters.category ?? ''}
                    onChange={(event) =>
                      setJournalFilters((current) => ({
                        ...current,
                        category:
                          event.target.value.length > 0
                            ? (event.target.value as NonNullable<
                                SettingsReadJournalRequestPayload['category']
                              >)
                            : undefined,
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    aria-label="Journal category filter"
                  >
                    <option value="">All categories</option>
                    <option value="progress">progress</option>
                    <option value="pattern">pattern</option>
                    <option value="preference">preference</option>
                    <option value="summary">summary</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{journalSummary}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadJournal()} disabled={isLoadingJournal}>
                    Refresh
                  </Button>
                </div>
                <div className="space-y-2">
                  {isLoadingJournal ? (
                    <p className="text-sm text-muted-foreground">Loading journal...</p>
                  ) : null}
                  {!isLoadingJournal && journalEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No entries.</p>
                  ) : null}
                  {journalEntries.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-md border border-border bg-card px-3 py-2"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {entry.category} · {entry.createdAt ?? 'unknown time'}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {entry.content}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ─── Chat tab ────────────────────────────────── */}
            {activeTab === 'chat' ? (
              <div role="tabpanel" id="settings-panel-chat" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Configure chat message retention.
                </p>
                <div className="rounded-md border border-border bg-card px-3 py-3">
                  <p className="text-sm font-medium text-foreground">Retention period</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    How long chat messages are stored before being cleaned up.
                  </p>
                  {isLoadingRetention ? (
                    <p className="mt-2 text-xs text-muted-foreground">Loading...</p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      {([
                        { mode: 'session' as const, label: 'Session only' },
                        { mode: '30d' as const, label: '30 days' },
                        { mode: 'forever' as const, label: 'Forever' },
                      ]).map(({ mode, label }) => (
                        <Button
                          key={mode}
                          type="button"
                          variant={retentionMode === mode ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => void handleRetentionChange(mode)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ─── Shortcuts tab ────────────────────────────── */}
            {activeTab === 'shortcuts' ? (
              <div role="tabpanel" id="settings-panel-shortcuts" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Configure global keyboard shortcuts. Changes take effect after restart.
                </p>
                {isLoadingShortcuts ? (
                  <p className="text-sm text-muted-foreground">Loading shortcuts...</p>
                ) : (
                  SHORTCUT_ENTRIES.map((entry) => (
                    <div
                      key={entry.key}
                      className="rounded-md border border-border bg-card px-3 py-3"
                    >
                      <p className="text-sm font-medium text-foreground">{entry.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Default: {entry.defaultAccelerator}
                      </p>
                      <Input
                        type="text"
                        value={shortcutDrafts[entry.key] ?? entry.defaultAccelerator}
                        onChange={(event) =>
                          setShortcutDrafts((current) => ({
                            ...current,
                            [entry.key]: event.target.value,
                          }))
                        }
                        className="mt-2"
                        aria-label={`${entry.label} shortcut`}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveShortcut(entry.key, shortcutDrafts[entry.key] ?? entry.defaultAccelerator)}
                          disabled={isSavingShortcut}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void resetShortcut(entry.key, entry.defaultAccelerator)}
                          disabled={isSavingShortcut}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {/* ─── Backup tab ──────────────────────────────── */}
            {activeTab === 'backup' ? (
              <div role="tabpanel" id="settings-panel-backup" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Database backups are created daily and the 30 most recent are kept.
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleCreateBackup()}
                    disabled={isCreatingBackup}
                  >
                    {isCreatingBackup ? 'Creating...' : 'Create backup now'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleExportBackup()}
                    disabled={isExportingBackup}
                  >
                    {isExportingBackup ? 'Exporting...' : 'Export backup'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleImportBackupFromFile()}
                    disabled={isImportingBackup || restoringBackupFilename !== null}
                  >
                    {isImportingBackup ? 'Importing...' : 'Import backup'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadBackups()}
                    disabled={isLoadingBackups}
                  >
                    Refresh
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border bg-card px-3 py-3">
                    <p className="text-sm font-medium text-foreground">Export encryption</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional passphrase used for encrypted export files.
                    </p>
                    <Input
                      type="password"
                      value={exportPassphrase}
                      onChange={(event) => setExportPassphrase(event.target.value)}
                      placeholder="Optional passphrase"
                      className="mt-2"
                      aria-label="Backup export passphrase"
                    />
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-3">
                    <p className="text-sm font-medium text-foreground">Import passphrase</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Required only when importing encrypted backups.
                    </p>
                    <Input
                      type="password"
                      value={importPassphrase}
                      onChange={(event) => setImportPassphrase(event.target.value)}
                      placeholder="Passphrase for encrypted backup"
                      className="mt-2"
                      aria-label="Backup import passphrase"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {isLoadingBackups ? (
                    <p className="text-sm text-muted-foreground">Loading backups...</p>
                  ) : null}
                  {!isLoadingBackups && backups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No backups found.</p>
                  ) : null}
                  {backups.map((backup) => (
                    <div
                      key={backup.filename}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                    >
                      <div>
                        <p className="text-sm text-foreground">{backup.filename}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(backup.createdAt).toLocaleString()} &middot;{' '}
                          {(backup.sizeBytes / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRestoreBackup(backup)}
                        disabled={restoringBackupFilename !== null}
                      >
                        {restoringBackupFilename === backup.filename ? 'Restoring...' : 'Restore'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};
