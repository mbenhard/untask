import { useCallback, useEffect, useState } from 'react';

import type {
  SettingsMemoryEventPayload,
  SettingsMemoryHistoryRequestPayload,
  SettingsMemoryStatePayload,
} from '../../../types/ipc';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { SettingsSection } from './SettingsSection';

const MEMORY_FIELD_LABELS: Record<'identity' | 'memory', string> = {
  identity: 'Identity',
  memory: 'Knowledge',
};

const MEMORY_FIELD_DESCRIPTIONS: Record<MemorySubTab, string> = {
  identity: 'Always injected in the assistant prompt. Keep it concise and outcome-driven.',
  memory: 'What your assistant knows about you. Auto-maintained.',
};

const MEMORY_SUB_TABS = ['identity', 'memory'] as const;
type MemorySubTab = (typeof MEMORY_SUB_TABS)[number];

type SettingsMemoryTabProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  availableTabs?: readonly MemorySubTab[];
};

const EMPTY_MEMORY_STATE: SettingsMemoryStatePayload = {
  identity: '',
  memory: '',
};

export const SettingsMemoryTab = ({ setError, setNotice, availableTabs = MEMORY_SUB_TABS }: SettingsMemoryTabProps) => {
  const defaultTab = availableTabs[0];
  const [memorySubTab, setMemorySubTab] = useState<MemorySubTab>(defaultTab);
  const [draft, setDraft] = useState<SettingsMemoryStatePayload>(EMPTY_MEMORY_STATE);
  const [memoryHistory, setMemoryHistory] = useState<SettingsMemoryEventPayload[]>([]);

  const [isLoadingMemory, setIsLoadingMemory] = useState(true);
  const [isLoadingMemoryHistory, setIsLoadingMemoryHistory] = useState(false);
  const [isUndoingMemory, setIsUndoingMemory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadMemoryState = useCallback(async () => {
    try {
      setIsLoadingMemory(true);
      setError(null);
      const next = await getUntask().settings.getMemoryState();
      setDraft(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load memory state.');
    } finally {
      setIsLoadingMemory(false);
    }
  }, [setError]);

  const loadMemoryHistory = useCallback(
    async (options?: SettingsMemoryHistoryRequestPayload) => {
      try {
        setIsLoadingMemoryHistory(true);
        setError(null);
        const response = await getUntask().settings.getMemoryHistory({
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
    [memorySubTab, setError],
  );

  useEffect(() => {
    if (!availableTabs.includes(memorySubTab)) {
      setMemorySubTab(availableTabs[0]);
    }
  }, [availableTabs, memorySubTab]);

  useEffect(() => {
    void loadMemoryState();
  }, [loadMemoryState]);

  useEffect(() => {
    void loadMemoryHistory();
  }, [loadMemoryHistory]);

  const showSubTabNav = availableTabs.length > 1;

  const saveField = useCallback(
    async (field: MemorySubTab) => {
      try {
        setIsSaving(true);
        setNotice(null);
        setError(null);
        const updated = await getUntask().settings.updateMemoryState({ [field]: draft[field] });
        setDraft(updated);
        setNotice(`${MEMORY_FIELD_LABELS[field]} saved.`);
        await loadMemoryHistory({ layer: field });
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save memory.');
      } finally {
        setIsSaving(false);
      }
    },
    [draft, loadMemoryHistory, setError, setNotice],
  );

  const undoMemoryChange = useCallback(
    async (eventId?: string) => {
      try {
        setIsUndoingMemory(true);
        setNotice(null);
        setError(null);
        const result = await getUntask().settings.undoMemoryEvent(
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
    [loadMemoryHistory, setError, setNotice],
  );

  if (isLoadingMemory) {
    return (
      <div role="tabpanel" id="settings-panel-memory">
        <p className="text-[11px] text-muted-foreground">Loading memory state...</p>
      </div>
    );
  }

  return (
    <div role="tabpanel" id="settings-panel-memory" className="space-y-3">
      {showSubTabNav && (
        <nav className="flex items-center gap-0.5" aria-label="Memory layer tabs">
          {MEMORY_SUB_TABS.filter((sub) => availableTabs.includes(sub)).map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setMemorySubTab(sub)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                memorySubTab === sub
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              {MEMORY_FIELD_LABELS[sub]}
            </button>
          ))}
        </nav>
      )}

      <div className="space-y-1.5">
        <p className="px-0.5 text-[11px] text-muted-foreground">
          {MEMORY_FIELD_DESCRIPTIONS[memorySubTab]}
        </p>

        <Textarea
          value={draft[memorySubTab]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [memorySubTab]: event.target.value }))
          }
          className="min-h-40 text-[13px]"
        />

        <Button
          type="button"
          size="sm"
          onClick={() => void saveField(memorySubTab)}
          disabled={isSaving}
          className="h-7 text-[11px]"
        >
          Save {MEMORY_FIELD_LABELS[memorySubTab]}
        </Button>
      </div>

      <SettingsSection title={`Recent ${MEMORY_FIELD_LABELS[memorySubTab]} changes`}>
        <div className="flex items-center justify-end px-2 py-1">
          <button
            type="button"
            onClick={() => void undoMemoryChange()}
            disabled={isUndoingMemory || isLoadingMemoryHistory}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            Undo latest
          </button>
        </div>

        {isLoadingMemoryHistory ? (
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground">Loading history...</p>
          </div>
        ) : memoryHistory.length === 0 ? (
          <div className="px-2 py-2">
            <p className="text-[11px] text-muted-foreground">No history yet.</p>
          </div>
        ) : (
          memoryHistory.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 px-2 py-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-mono text-[10px] text-muted-foreground">
                  {event.createdAt ?? 'unknown'} · {event.source}
                </p>
                <p className="line-clamp-2 text-[13px] text-foreground/90">
                  {event.after.trim().length > 0 ? event.after : '(empty)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void undoMemoryChange(event.id)}
                disabled={isUndoingMemory}
                className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Undo
              </button>
            </div>
          ))
        )}
      </SettingsSection>
    </div>
  );
};
