import { useCallback, useEffect, useState } from 'react';

import type {
  SettingsMemoryEventPayload,
  SettingsMemoryHistoryRequestPayload,
  SettingsMemoryStatePayload,
} from '../../../types/ipc';
import { cn } from '../../lib/utils';
import { getFlusk } from '../../lib/flusk';
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

const EMPTY_MEMORY_STATE: SettingsMemoryStatePayload = {
  identity: '',
  memory: '',
};

type SettingsMemoryTabProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export const SettingsMemoryTab = ({ setError, setNotice }: SettingsMemoryTabProps) => {
  const [memorySubTab, setMemorySubTab] = useState<MemorySubTab>('identity');
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
      const next = await getFlusk().settings.getMemoryState();
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
    [memorySubTab, setError],
  );

  useEffect(() => {
    void loadMemoryState();
  }, [loadMemoryState]);

  useEffect(() => {
    void loadMemoryHistory();
  }, [loadMemoryHistory]);

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
    [draft, loadMemoryHistory, setError, setNotice],
  );

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
    <div role="tabpanel" id="settings-panel-memory" className="space-y-6">
      <nav className="flex items-center gap-0.5" aria-label="Memory layer tabs">
        {MEMORY_SUB_TABS.map((sub) => (
          <button
            key={sub}
            type="button"
            onClick={() => setMemorySubTab(sub)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] transition-colors',
              memorySubTab === sub
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
          >
            {MEMORY_FIELD_LABELS[sub]}
          </button>
        ))}
      </nav>

      <div className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          {MEMORY_FIELD_DESCRIPTIONS[memorySubTab]}
        </p>

        <Textarea
          value={draft[memorySubTab]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [memorySubTab]: event.target.value }))
          }
          className="min-h-52"
        />

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void saveField(memorySubTab)}
            disabled={isSaving}
            className="h-8 text-[11px]"
          >
            Save {MEMORY_FIELD_LABELS[memorySubTab]}
          </Button>
        </div>
      </div>

      <SettingsSection title={`Recent ${MEMORY_FIELD_LABELS[memorySubTab]} changes`}>
        <div className="flex items-center justify-end py-2">
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
          <div className="py-2.5">
            <p className="text-[11px] text-muted-foreground">Loading memory history...</p>
          </div>
        ) : memoryHistory.length === 0 ? (
          <div className="py-2.5">
            <p className="text-[11px] text-muted-foreground">No history yet.</p>
          </div>
        ) : (
          memoryHistory.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-[11px] text-muted-foreground">
                  {event.createdAt ?? 'unknown time'} · {event.source}
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
