import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';

import type { AiJournal } from '../../../types/models';
import type {
  SettingsMemoryStatePayload,
  SettingsReadJournalRequestPayload,
} from '../../../types/ipc';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

type SettingsMemoryProps = {
  onClose: () => void;
};

type MemoryTab = 'soul' | 'profile' | 'patterns' | 'journal' | 'app';

const TAB_ORDER: MemoryTab[] = ['soul', 'profile', 'patterns', 'journal', 'app'];

const TAB_LABELS: Record<MemoryTab, string> = {
  soul: 'Soul',
  profile: 'Profile',
  patterns: 'Patterns',
  journal: 'Journal',
  app: 'App',
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

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};

export const SettingsMemory = ({ onClose }: SettingsMemoryProps) => {
  const [activeTab, setActiveTab] = useState<MemoryTab>('soul');
  const [draft, setDraft] = useState<SettingsMemoryStatePayload>(EMPTY_MEMORY_STATE);
  const [journalEntries, setJournalEntries] = useState<AiJournal[]>([]);
  const [journalFilters, setJournalFilters] = useState<SettingsReadJournalRequestPayload>(
    DEFAULT_JOURNAL_FILTERS,
  );
  const [isLoadingMemory, setIsLoadingMemory] = useState(true);
  const [isLoadingJournal, setIsLoadingJournal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
  const [launchAtLoginApplied, setLaunchAtLoginApplied] = useState(false);
  const [launchAtLoginError, setLaunchAtLoginError] = useState<string | null>(null);
  const [isLoadingLaunchAtLogin, setIsLoadingLaunchAtLogin] = useState(false);
  const [isSavingLaunchAtLogin, setIsSavingLaunchAtLogin] = useState(false);
  const [openRouterApiKeyInput, setOpenRouterApiKeyInput] = useState('');
  const [hasOpenRouterApiKey, setHasOpenRouterApiKey] = useState(false);
  const [isLoadingOpenRouterApiKey, setIsLoadingOpenRouterApiKey] = useState(false);
  const [isSavingOpenRouterApiKey, setIsSavingOpenRouterApiKey] = useState(false);

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

  useEffect(() => {
    void loadMemoryState();
  }, [loadMemoryState]);

  useEffect(() => {
    if (activeTab !== 'journal') {
      return;
    }

    void loadJournal();
  }, [activeTab, loadJournal]);

  useEffect(() => {
    if (activeTab !== 'app') {
      return;
    }

    void loadLaunchAtLogin();
    void loadOpenRouterApiKey();
  }, [activeTab, loadLaunchAtLogin, loadOpenRouterApiKey]);

  const saveField = useCallback(
    async (field: 'soul' | 'profile' | 'patterns') => {
      try {
        setIsSaving(true);
        setNotice(null);
        setError(null);
        const updated = await flusk().settings.updateMemoryState({ [field]: draft[field] });
        setDraft(updated);
        setNotice(`${TAB_LABELS[field]} saved.`);
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

  const journalSummary = useMemo(() => {
    if (journalEntries.length === 0) {
      return 'No journal entries found for current filters.';
    }

    return `${journalEntries.length} entries loaded`;
  }, [journalEntries.length]);

  return (
    <section className="no-drag absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Memory Settings</h2>
          <p className="text-xs text-muted-foreground">
            Edit Soul, Profile, Patterns, and browse journal history.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      <nav className="flex items-center gap-2 border-b border-border px-4 py-2">
        {TAB_ORDER.map((tab) => (
          <Button
            key={tab}
            type="button"
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

        {isLoadingMemory && activeTab !== 'journal' ? (
          <p className="text-sm text-muted-foreground">Loading memory state...</p>
        ) : null}

        {activeTab === 'soul' ? (
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

        {activeTab === 'profile' ? (
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

        {activeTab === 'patterns' ? (
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

        {activeTab === 'journal' ? (
          <div className="space-y-3">
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

        {activeTab === 'app' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configure desktop startup behavior.
            </p>
            <div className="rounded-md border border-border bg-card px-3 py-3">
              <p className="text-sm text-foreground">OpenRouter API key</p>
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
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void loadLaunchAtLogin();
                  void loadOpenRouterApiKey();
                }}
                disabled={isLoadingLaunchAtLogin || isLoadingOpenRouterApiKey}
              >
                Refresh app settings
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
