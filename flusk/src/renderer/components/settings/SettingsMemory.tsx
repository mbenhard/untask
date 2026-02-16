import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { AiJournal } from '../../../types/models';
import type { ChatModelCatalogEntry } from '../../../types/chat';
import type {
  BackupMetadataPayload,
  SettingsMemoryEventPayload,
  SettingsMemoryHistoryRequestPayload,
  SettingsMemoryStatePayload,
  SettingsReadJournalRequestPayload,
  WindowDismissMode,
} from '../../../types/ipc';
import { cn } from '../../lib/utils';
import { getFlusk } from '../../lib/flusk';
import {
  MONO_FONT_OPTIONS,
  SANS_FONT_OPTIONS,
  TYPOGRAPHY_PRESET_OPTIONS,
  getMonoFontLabel,
  getSansFontLabel,
  getTypographySelectionFromPreset,
  parseMonoFontId,
  parseSansFontId,
  type TypographyPresetId,
} from '../../lib/typography';
import { useTypography } from '../providers/TypographyProvider';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

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

type GlobalShortcutSetting = {
  key: string;
  label: string;
  defaultAccelerator: string;
  action: string;
};

type ShortcutHintEntry = {
  keys: string;
  action: string;
  context?: string;
};

type ShortcutHintSection = {
  title: string;
  description: string;
  entries: ShortcutHintEntry[];
};

const GLOBAL_SHORTCUT_SETTINGS: GlobalShortcutSetting[] = [
  {
    key: 'shortcut.toggleWindow',
    label: 'Toggle window',
    defaultAccelerator: 'CommandOrControl+Shift+Space',
    action: 'Show or hide the Flusk window from anywhere in the OS.',
  },
  {
    key: 'shortcut.quickAdd',
    label: 'Quick add',
    defaultAccelerator: 'CommandOrControl+Shift+A',
    action: 'Open quick add and prefill from clipboard when available.',
  },
];

const SHORTCUT_HINT_SECTIONS: ShortcutHintSection[] = [
  {
    title: 'App-wide',
    description: 'These work while the Flusk window is focused.',
    entries: [
      { keys: 'Cmd/Ctrl + K', action: 'Toggle chat overlay and focus chat input.' },
      { keys: 'Cmd/Ctrl + F', action: 'Open or close Search.' },
      { keys: 'Cmd/Ctrl + N', action: 'Jump to Scratchpad view.' },
      {
        keys: 'Cmd/Ctrl + Z',
        action: 'Undo the last assistant action.',
        context: 'Only when chat overlay is open and you are not typing in an input.',
      },
      {
        keys: 'Escape',
        action: 'Layered dismiss: search -> clear chat input -> leave settings -> close chat overlay -> hide window.',
      },
      { keys: '1', action: 'Go to Today view.' },
      { keys: '2', action: 'Go to Tasks view.' },
      { keys: '3', action: 'Go to Inbox view.' },
      { keys: '4', action: 'Toggle chat overlay (peek/open).' },
      { keys: ',', action: 'Open Settings view.' },
      {
        keys: 'N',
        action: 'Open new-task input.',
        context: 'Only in Today, Tasks, or Inbox while chat is in peek mode and Search is closed.',
      },
    ],
  },
  {
    title: 'Task list (focused list)',
    description: 'These work when a task list has keyboard focus.',
    entries: [
      { keys: 'Arrow Up / Arrow Down', action: 'Move focus between tasks.' },
      { keys: 'Enter', action: 'Expand or collapse focused task.' },
      { keys: 'Space', action: 'Toggle complete or reopen focused task.' },
      { keys: 'T', action: 'Toggle Today flag on focused task.' },
      { keys: 'P', action: 'Cycle focused task priority.' },
      { keys: 'S', action: 'Cycle focused task status.' },
      { keys: 'E', action: 'Edit focused task title.' },
      { keys: 'Escape', action: 'Collapse expanded task, then blur list focus.' },
    ],
  },
  {
    title: 'Search modal',
    description: 'These work while Search is open.',
    entries: [
      { keys: 'Arrow Up / Arrow Down', action: 'Move selected result.' },
      { keys: 'Enter', action: 'Open the selected result.' },
      { keys: 'Escape', action: 'Close Search.' },
    ],
  },
  {
    title: 'Input actions',
    description: 'Contextual input shortcuts.',
    entries: [
      { keys: 'Enter', action: 'Send chat message from chat input.' },
      { keys: 'Shift + Enter', action: 'Insert newline in chat input.' },
      { keys: 'Enter', action: 'Submit inline task input.' },
      { keys: 'Escape', action: 'Cancel inline task input.' },
      { keys: 'Enter', action: 'Save task title/client inline edits.' },
      { keys: 'Escape', action: 'Cancel task title/client inline edits.' },
    ],
  },
];

const formatAccelerator = (value: string): string =>
  value
    .replace(/CommandOrControl/g, 'Cmd/Ctrl')
    .replace(/Command/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/\+/g, ' + ');

const MEMORY_FIELD_LABELS: Record<
  'identity' | 'memory' | 'soul' | 'profile' | 'patterns',
  string
> = {
  identity: 'Identity',
  memory: 'Memory',
  soul: 'Soul',
  profile: 'Profile',
  patterns: 'Patterns',
};

const MEMORY_SUB_TABS = ['identity', 'memory', 'soul', 'profile', 'patterns'] as const;

const EMPTY_MEMORY_STATE: SettingsMemoryStatePayload = {
  soul: '',
  profile: '',
  patterns: '',
  identity: '',
  memory: '',
};

const DEFAULT_JOURNAL_FILTERS: SettingsReadJournalRequestPayload = {
  limit: 20,
  days_back: 30,
};

const OPENROUTER_API_KEY_SETTING_KEY = 'ai_openrouter_key';

type MemorySubTab = (typeof MEMORY_SUB_TABS)[number];

export const SettingsMemory = () => {
  const prefersReducedMotion = useReducedMotion();
  const typography = useTypography();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [memorySubTab, setMemorySubTab] = useState<MemorySubTab>('identity');
  const [draft, setDraft] = useState<SettingsMemoryStatePayload>(EMPTY_MEMORY_STATE);
  const [memoryHistory, setMemoryHistory] = useState<SettingsMemoryEventPayload[]>([]);
  const [journalEntries, setJournalEntries] = useState<AiJournal[]>([]);
  const [journalFilters, setJournalFilters] = useState<SettingsReadJournalRequestPayload>(
    DEFAULT_JOURNAL_FILTERS,
  );

  // Loading / saving states
  const [isLoadingMemory, setIsLoadingMemory] = useState(true);
  const [isLoadingMemoryHistory, setIsLoadingMemoryHistory] = useState(false);
  const [isUndoingMemory, setIsUndoingMemory] = useState(false);
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
  const [windowDismissMode, setWindowDismissModeState] = useState<WindowDismissMode>('persistent');
  const [isLoadingWindowDismissMode, setIsLoadingWindowDismissMode] = useState(false);
  const [isSavingWindowDismissMode, setIsSavingWindowDismissMode] = useState(false);
  const [isSavingTypography, setIsSavingTypography] = useState(false);

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
  const [resolvedShortcuts, setResolvedShortcuts] = useState<Record<string, string>>({});
  const [isLoadingShortcuts, setIsLoadingShortcuts] = useState(false);

  // ─── Load actions ────────────────────────────────────────

  const loadMemoryState = useCallback(async () => {
    try {
      setIsLoadingMemory(true);
      setError(null);
      const next = await getFlusk().settings.getMemoryState();
      setDraft(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load memory state.');
    } finally {
      setIsLoadingMemory(false);
    }
  }, []);

  const loadMemoryHistory = useCallback(
    async (options?: SettingsMemoryHistoryRequestPayload) => {
      try {
        setIsLoadingMemoryHistory(true);
        setError(null);
        const response = await getFlusk().settings.getMemoryHistory({
          layer: memorySubTab,
          limit: 20,
          ...options,
        });
        setMemoryHistory(response.events);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load memory history.');
      } finally {
        setIsLoadingMemoryHistory(false);
      }
    },
    [memorySubTab],
  );

  const loadJournal = useCallback(async () => {
    try {
      setIsLoadingJournal(true);
      setError(null);
      const response = await getFlusk().settings.readJournal(journalFilters);
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
      const result = await getFlusk().app.getLaunchAtLogin();
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
      const stored = await getFlusk().settings.get(OPENROUTER_API_KEY_SETTING_KEY);
      setHasOpenRouterApiKey(Boolean(stored && stored.trim().length > 0));
      setOpenRouterApiKeyInput('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load OpenRouter API key.');
    } finally {
      setIsLoadingOpenRouterApiKey(false);
    }
  }, []);

  const loadWindowDismissMode = useCallback(async () => {
    try {
      setIsLoadingWindowDismissMode(true);
      setError(null);
      const result = await getFlusk().app.getWindowDismissMode();
      setWindowDismissModeState(result.mode);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load window behavior setting.',
      );
    } finally {
      setIsLoadingWindowDismissMode(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      setIsLoadingModels(true);
      const catalog = await getFlusk().chat.getModels();
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
      const result = await getFlusk().chat.getAutonomyMode();
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
      const result = await getFlusk().chat.getRetentionMode();
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
      const resolved: Record<string, string> = {};
      for (const entry of GLOBAL_SHORTCUT_SETTINGS) {
        const stored = await getFlusk().settings.get(entry.key);
        resolved[entry.key] = stored && stored.trim().length > 0
          ? stored
          : entry.defaultAccelerator;
      }
      setResolvedShortcuts(resolved);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load shortcuts.');
    } finally {
      setIsLoadingShortcuts(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      setIsLoadingBackups(true);
      setError(null);
      const result = await getFlusk().backup.list();
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
      await getFlusk().backup.create();
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

      const response = await getFlusk().backup.exportWithDialog({
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

      const response = await getFlusk().backup.importWithDialog({
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

      await getFlusk().backup.import({
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
    if (activeTab === 'memory') {
      void loadMemoryHistory();
    }
  }, [activeTab, loadMemoryHistory]);

  useEffect(() => {
    if (activeTab === 'general') {
      void loadLaunchAtLogin();
      void loadWindowDismissMode();
    }
  }, [activeTab, loadLaunchAtLogin, loadWindowDismissMode]);

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
    async (field: MemorySubTab) => {
      try {
        setIsSaving(true);
        setNotice(null);
        setError(null);
        const updated = await getFlusk().settings.updateMemoryState({ [field]: draft[field] });
        setDraft(updated);
        setNotice(`${MEMORY_FIELD_LABELS[field]} saved.`);
        await loadMemoryHistory({ layer: field });
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save memory.');
      } finally {
        setIsSaving(false);
      }
    },
    [draft, loadMemoryHistory],
  );

  const resetSoulField = useCallback(async () => {
    try {
      setIsSaving(true);
      setNotice(null);
      setError(null);
      const updated = await getFlusk().settings.resetSoul();
      setDraft(updated);
      setNotice('Soul reset to default.');
      await loadMemoryHistory({ layer: 'soul' });
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Failed to reset soul.');
    } finally {
      setIsSaving(false);
    }
  }, [loadMemoryHistory]);

  const undoMemoryChange = useCallback(
    async (eventId?: string) => {
      try {
        setIsUndoingMemory(true);
        setNotice(null);
        setError(null);
        const result = await getFlusk().settings.undoMemoryEvent(
          eventId ? { eventId } : { steps: 1 },
        );
        setDraft(result.state);
        setNotice(
          result.revertedEventIds.length > 0
            ? `Reverted ${result.revertedEventIds.length} memory change(s).`
            : 'No memory change was reverted.',
        );
        await loadMemoryHistory();
      } catch (undoError) {
        setError(undoError instanceof Error ? undoError.message : 'Failed to undo memory change.');
      } finally {
        setIsUndoingMemory(false);
      }
    },
    [loadMemoryHistory],
  );

  const handleLaunchAtLoginChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const nextEnabled = event.target.checked;
      const previousEnabled = launchAtLoginEnabled;

      setLaunchAtLoginEnabled(nextEnabled);
      setNotice(null);
      setLaunchAtLoginError(null);

      try {
        setIsSavingLaunchAtLogin(true);
        const result = await getFlusk().app.setLaunchAtLogin(nextEnabled);
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

  const handleWindowDismissModeChange = useCallback(
    async (mode: WindowDismissMode) => {
      const previousMode = windowDismissMode;
      setWindowDismissModeState(mode);
      setNotice(null);
      setError(null);

      try {
        setIsSavingWindowDismissMode(true);
        const result = await getFlusk().app.setWindowDismissMode(mode);
        setWindowDismissModeState(result.mode);
        setNotice(
          result.mode === 'persistent'
            ? 'Window dismiss mode set to Persistent.'
            : 'Window dismiss mode set to Quick-hide.',
        );
      } catch (saveError) {
        setWindowDismissModeState(previousMode);
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Failed to update window behavior setting.',
        );
      } finally {
        setIsSavingWindowDismissMode(false);
      }
    },
    [windowDismissMode],
  );

  const handleSansFontChange = useCallback(
    async (value: string) => {
      const nextSansId = parseSansFontId(value);
      if (!nextSansId) {
        setError('Invalid body font selection.');
        return;
      }

      try {
        setIsSavingTypography(true);
        setNotice(null);
        setError(null);
        await typography.setSans(nextSansId);
        setNotice(`Body font set to ${getSansFontLabel(nextSansId)}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to update body font.');
      } finally {
        setIsSavingTypography(false);
      }
    },
    [typography],
  );

  const handleMonoFontChange = useCallback(
    async (value: string) => {
      const nextMonoId = parseMonoFontId(value);
      if (!nextMonoId) {
        setError('Invalid mono font selection.');
        return;
      }

      try {
        setIsSavingTypography(true);
        setNotice(null);
        setError(null);
        await typography.setMono(nextMonoId);
        setNotice(`Mono font set to ${getMonoFontLabel(nextMonoId)}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to update mono font.');
      } finally {
        setIsSavingTypography(false);
      }
    },
    [typography],
  );

  const handleTypographyPresetChange = useCallback(
    async (presetId: TypographyPresetId) => {
      const presetLabel =
        TYPOGRAPHY_PRESET_OPTIONS.find((option) => option.id === presetId)?.label ?? presetId;

      try {
        setIsSavingTypography(true);
        setNotice(null);
        setError(null);
        await typography.applyPreset(presetId);
        setNotice(`Typography preset set to ${presetLabel}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to update typography preset.');
      } finally {
        setIsSavingTypography(false);
      }
    },
    [typography],
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
      await getFlusk().settings.set(OPENROUTER_API_KEY_SETTING_KEY, normalized);
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
      await getFlusk().settings.set(OPENROUTER_API_KEY_SETTING_KEY, '');
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
      const result = await getFlusk().chat.setSelectedModel({ modelId });
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
      const result = await getFlusk().chat.setAutonomyMode({ mode });
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
      const result = await getFlusk().chat.setRetentionMode({ mode });
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
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <nav className="flex items-center gap-1" role="tablist" aria-label="Settings sections">
          {TAB_ORDER.map((tab) => {
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative rounded-md px-2.5 py-1.5 text-xs font-medium tracking-[0.01em] transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </nav>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground">
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
                  Configure desktop startup, typography, and window behavior.
                </p>
                <div className="rounded-md border border-border/60 px-3 py-3">
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

                <div className="rounded-md border border-border/60 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">Window dismiss mode</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose how Flusk behaves when the window loses focus.
                  </p>
                  {isLoadingWindowDismissMode ? (
                    <p className="mt-2 text-xs text-muted-foreground">Loading window behavior...</p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={windowDismissMode === 'persistent' ? 'default' : 'outline'}
                        onClick={() => void handleWindowDismissModeChange('persistent')}
                        disabled={isSavingWindowDismissMode}
                      >
                        Persistent
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={windowDismissMode === 'quick-hide' ? 'default' : 'outline'}
                        onClick={() => void handleWindowDismissModeChange('quick-hide')}
                        disabled={isSavingWindowDismissMode}
                      >
                        Quick-hide
                      </Button>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {windowDismissMode === 'persistent'
                      ? 'Persistent: Stay visible when focus changes.'
                      : 'Quick-hide: Hide when window loses focus.'}
                  </p>
                </div>

                <div className="rounded-md border border-border/60 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">Typography</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose app-wide body and monospace fonts.
                  </p>

                  {!typography.isReady ? (
                    <p className="mt-2 text-xs text-muted-foreground">Loading typography settings...</p>
                  ) : (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Body font</span>
                          <select
                            value={typography.sansId}
                            onChange={(event) => void handleSansFontChange(event.target.value)}
                            disabled={isSavingTypography}
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                            aria-label="Body font"
                          >
                            {SANS_FONT_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Mono font</span>
                          <select
                            value={typography.monoId}
                            onChange={(event) => void handleMonoFontChange(event.target.value)}
                            disabled={isSavingTypography}
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                            aria-label="Mono font"
                          >
                            {MONO_FONT_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {TYPOGRAPHY_PRESET_OPTIONS.map((preset) => {
                          const selection = getTypographySelectionFromPreset(preset.id);
                          const isActivePreset =
                            selection.sansId === typography.sansId &&
                            selection.monoId === typography.monoId;

                          return (
                            <Button
                              key={preset.id}
                              type="button"
                              size="sm"
                              variant={isActivePreset ? 'default' : 'outline'}
                              onClick={() => void handleTypographyPresetChange(preset.id)}
                              disabled={isSavingTypography}
                            >
                              {preset.label}
                            </Button>
                          );
                        })}
                      </div>

                      <div className="mt-3 rounded-md border border-border/50 bg-muted/20 px-3 py-3">
                        <p className="text-sm text-foreground">
                          The quick brown fox jumps over 13 invoices due this week.
                        </p>
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                          quick.add --client="Northwind" --due=tomorrow --priority=high
                        </p>
                      </div>
                    </>
                  )}

                  {typography.error ? (
                    <p className="mt-2 text-xs text-destructive">{typography.error}</p>
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
                <div className="rounded-md border border-border/60 px-3 py-3">
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
                <div className="rounded-md border border-border/60 px-3 py-3">
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
                <div className="rounded-md border border-border/60 px-3 py-3">
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
                      {MEMORY_SUB_TABS.map((sub) => (
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

                    {memorySubTab === 'identity' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Identity is always injected in the assistant prompt. Keep it concise and outcome-driven.
                        </p>
                        <Textarea
                          value={draft.identity}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, identity: event.target.value }))
                          }
                          className="min-h-64"
                        />
                        <Button type="button" size="sm" onClick={() => void saveField('identity')} disabled={isSaving}>
                          Save Identity
                        </Button>
                      </div>
                    ) : null}

                    {memorySubTab === 'memory' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Memory is loaded on-demand for client context, preferences, and workflows.
                        </p>
                        <Textarea
                          value={draft.memory}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, memory: event.target.value }))
                          }
                          className="min-h-64"
                        />
                        <Button type="button" size="sm" onClick={() => void saveField('memory')} disabled={isSaving}>
                          Save Memory
                        </Button>
                      </div>
                    ) : null}

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

                    <div className="rounded-md border border-border/60 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Recent {MEMORY_FIELD_LABELS[memorySubTab]} changes
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void undoMemoryChange()}
                          disabled={isUndoingMemory || isLoadingMemoryHistory}
                        >
                          Undo latest
                        </Button>
                      </div>

                      {isLoadingMemoryHistory ? (
                        <p className="text-xs text-muted-foreground">Loading memory history...</p>
                      ) : null}

                      {!isLoadingMemoryHistory && memoryHistory.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No history yet.</p>
                      ) : null}

                      {!isLoadingMemoryHistory && memoryHistory.length > 0 ? (
                        <div className="space-y-2">
                          {memoryHistory.map((event) => (
                            <article
                              key={event.id}
                              className="rounded-md border border-border/50 px-2 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">
                                  {event.createdAt ?? 'unknown time'} · {event.source}
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void undoMemoryChange(event.id)}
                                  disabled={isUndoingMemory}
                                >
                                  Undo
                                </Button>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-foreground/90">
                                {event.after.trim().length > 0 ? event.after : '(empty)'}
                              </p>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
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
                      className="rounded-md border border-border/60 px-3 py-2"
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
                <div className="rounded-md border border-border/60 px-3 py-3">
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
                  Read-only shortcut reference for all currently supported keyboard controls.
                </p>

                {isLoadingShortcuts ? (
                  <p className="text-sm text-muted-foreground">Loading global shortcut values...</p>
                ) : null}

                <div className="space-y-3">
                  <section className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-sm font-medium text-foreground">Global (system)</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Works when Flusk is hidden or unfocused.
                    </p>
                    <div className="mt-3 space-y-2">
                      {GLOBAL_SHORTCUT_SETTINGS.map((entry) => {
                        const activeValue = resolvedShortcuts[entry.key] ?? entry.defaultAccelerator;
                        return (
                          <div
                            key={entry.key}
                            className="flex items-start justify-between gap-3 rounded-md border border-border/40 px-2 py-2"
                          >
                            <div className="space-y-1">
                              <p className="text-sm text-foreground">{entry.label}</p>
                              <p className="text-xs text-muted-foreground">{entry.action}</p>
                              {activeValue !== entry.defaultAccelerator ? (
                                <p className="text-[11px] text-muted-foreground">
                                  Default: {formatAccelerator(entry.defaultAccelerator)}
                                </p>
                              ) : null}
                            </div>
                            <code className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                              {formatAccelerator(activeValue)}
                            </code>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {SHORTCUT_HINT_SECTIONS.map((section) => (
                    <section
                      key={section.title}
                      className="rounded-md border border-border/60 px-3 py-3"
                    >
                      <p className="text-sm font-medium text-foreground">{section.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
                      <div className="mt-3 space-y-2">
                        {section.entries.map((entry) => (
                          <div
                            key={`${section.title}-${entry.keys}-${entry.action}`}
                            className="flex items-start justify-between gap-3 rounded-md border border-border/40 px-2 py-2"
                          >
                            <div className="space-y-1">
                              <p className="text-xs text-foreground">{entry.action}</p>
                              {entry.context ? (
                                <p className="text-[11px] text-muted-foreground">{entry.context}</p>
                              ) : null}
                            </div>
                            <code className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                              {entry.keys}
                            </code>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
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
                  <div className="rounded-md border border-border/60 px-3 py-3">
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
                  <div className="rounded-md border border-border/60 px-3 py-3">
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
                      className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
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
    </div>
  );
};
