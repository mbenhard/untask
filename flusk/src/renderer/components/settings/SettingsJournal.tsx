import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AiJournal } from '../../../types/models';
import type { SettingsReadJournalRequestPayload } from '../../../types/ipc';
import { getFlusk } from '../../lib/flusk';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';

const DEFAULT_JOURNAL_FILTERS: SettingsReadJournalRequestPayload = {
  limit: 20,
  days_back: 30,
};

type SettingsJournalProps = {
  setError: (error: string | null) => void;
};

export const SettingsJournal = ({ setError }: SettingsJournalProps) => {
  const [journalEntries, setJournalEntries] = useState<AiJournal[]>([]);
  const [journalFilters, setJournalFilters] = useState<SettingsReadJournalRequestPayload>(
    DEFAULT_JOURNAL_FILTERS,
  );
  const [isLoadingJournal, setIsLoadingJournal] = useState(false);

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
  }, [journalFilters, setError]);

  useEffect(() => {
    void loadJournal();
  }, [loadJournal]);

  const journalSummary = useMemo(() => {
    if (journalEntries.length === 0) {
      return 'No journal entries found for current filters.';
    }
    return `${journalEntries.length} entries loaded`;
  }, [journalEntries.length]);

  return (
    <div role="tabpanel" id="settings-panel-journal" className="space-y-6">
      <SettingsSection title="Filters">
        <SettingsRow label="Entries">
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
            className="h-8 w-16 text-[12px]"
            aria-label="Journal limit"
          />
        </SettingsRow>
        <SettingsRow label="Days back">
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
            className="h-8 w-16 text-[12px]"
            aria-label="Journal days back"
          />
        </SettingsRow>
        <SettingsRow label="Category">
          <SettingsSelect
            options={[
              { value: '', label: 'All categories' },
              { value: 'progress', label: 'progress' },
              { value: 'pattern', label: 'pattern' },
              { value: 'preference', label: 'preference' },
              { value: 'summary', label: 'summary' },
            ]}
            value={journalFilters.category ?? ''}
            onChange={(value) =>
              setJournalFilters((current) => ({
                ...current,
                category:
                  value.length > 0
                    ? (value as NonNullable<SettingsReadJournalRequestPayload['category']>)
                    : undefined,
              }))
            }
            aria-label="Journal category filter"
          />
        </SettingsRow>
        <div className="flex items-center justify-between py-2.5">
          <p className="text-[11px] text-muted-foreground">{journalSummary}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void loadJournal()}
            disabled={isLoadingJournal}
            className="h-7 text-[11px]"
          >
            Refresh
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Entries">
        {isLoadingJournal ? (
          <div className="py-2.5">
            <p className="text-[11px] text-muted-foreground">Loading journal...</p>
          </div>
        ) : journalEntries.length === 0 ? (
          <div className="py-2.5">
            <p className="text-[11px] text-muted-foreground">No entries.</p>
          </div>
        ) : (
          journalEntries.map((entry) => (
            <div key={entry.id} className="py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                {entry.category} · {entry.createdAt ?? 'unknown time'}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">
                {entry.content}
              </p>
            </div>
          ))
        )}
      </SettingsSection>
    </div>
  );
};
