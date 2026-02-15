import { useCallback, useEffect, useMemo, useState } from 'react';

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

type MemoryTab = 'soul' | 'profile' | 'patterns' | 'journal';

const TAB_ORDER: MemoryTab[] = ['soul', 'profile', 'patterns', 'journal'];

const TAB_LABELS: Record<MemoryTab, string> = {
  soul: 'Soul',
  profile: 'Profile',
  patterns: 'Patterns',
  journal: 'Journal',
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

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }

  return window.flusk;
};

export const SettingsMemory = ({ onClose }: SettingsMemoryProps): JSX.Element => {
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

  useEffect(() => {
    void loadMemoryState();
  }, [loadMemoryState]);

  useEffect(() => {
    if (activeTab !== 'journal') {
      return;
    }

    void loadJournal();
  }, [activeTab, loadJournal]);

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
      </div>
    </section>
  );
};
