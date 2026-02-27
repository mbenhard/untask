import { useCallback, useEffect, useState } from 'react';

import type {
  SettingsMemoryEventPayload,
  SettingsMemoryHistoryRequestPayload,
  SettingsMemoryStatePayload,
} from '../../../types/ipc';
import {
  buildIdentityString,
  COMMUNICATION_OPTIONS,
  ROLE_OPTIONS,
  type CommunicationStyle,
  type Role,
} from '../../lib/identity';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { SectionLabel } from '../onboarding/onboarding-shared';
import { SettingsCard } from './SettingsCard';
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

  // Identity picker state
  const [pickerRole, setPickerRole] = useState<Role | null>(null);
  const [pickerStyle, setPickerStyle] = useState<CommunicationStyle | null>(null);
  const [pickerFocus, setPickerFocus] = useState('');
  const [pickerUserName, setPickerUserName] = useState('');
  const [isPickerLoaded, setIsPickerLoaded] = useState(false);

  // Collapsible history
  const [historyExpanded, setHistoryExpanded] = useState(false);

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

  // Load identity picker values when on the identity sub-tab
  useEffect(() => {
    if (memorySubTab !== 'identity') return;
    if (isPickerLoaded) return;

    let cancelled = false;
    const load = async () => {
      try {
        const settings = getUntask().settings;
        const [userName, roleLabel, styleLabel, focus] = await Promise.all([
          settings.get('user.name').catch(() => ''),
          settings.get('user.role').catch(() => ''),
          settings.get('communication.style').catch(() => ''),
          settings.get('user.focus').catch(() => ''),
        ]);
        if (cancelled) return;

        setPickerUserName((userName as string) || '');
        setPickerFocus((focus as string) || '');

        // Reverse-map stored labels back to enum values
        const matchedRole = ROLE_OPTIONS.find(
          (o) => o.label.toLowerCase() === ((roleLabel as string) || '').toLowerCase(),
        );
        setPickerRole(matchedRole?.value ?? null);

        const matchedStyle = COMMUNICATION_OPTIONS.find(
          (o) => o.label.toLowerCase() === ((styleLabel as string) || '').toLowerCase(),
        );
        setPickerStyle(matchedStyle?.value ?? null);
        setIsPickerLoaded(true);
      } catch {
        // Non-fatal — picker stays empty
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [memorySubTab, isPickerLoaded]);

  // Reset history + picker state when switching sub-tabs
  useEffect(() => {
    setHistoryExpanded(false);
    setIsPickerLoaded(false);
  }, [memorySubTab]);

  const handlePickerChange = useCallback(
    (nextRole: Role | null, nextStyle: CommunicationStyle | null, nextFocus: string) => {
      const identity = buildIdentityString(pickerUserName, nextRole, nextStyle, nextFocus);
      setDraft((current) => ({ ...current, identity: identity }));

      // Persist individual picker values (fire-and-forget)
      const settings = getUntask().settings;
      const roleLabel = nextRole ? ROLE_OPTIONS.find((o) => o.value === nextRole)?.label ?? '' : '';
      const styleLabel = nextStyle ? COMMUNICATION_OPTIONS.find((o) => o.value === nextStyle)?.label ?? '' : '';
      void settings.set('user.role', roleLabel);
      void settings.set('communication.style', styleLabel);
      void settings.set('user.focus', nextFocus.trim());
    },
    [pickerUserName],
  );

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

      {/* Identity picker — only shown on the identity sub-tab */}
      {memorySubTab === 'identity' && isPickerLoaded && (
        <SettingsSection title="Profile">
          <div className="flex flex-col gap-3 px-3 py-3">
            {/* ROLE */}
            <div>
              <SectionLabel>Role</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={pickerRole === opt.value}
                    onClick={() => {
                      const next = pickerRole === opt.value ? null : opt.value;
                      setPickerRole(next);
                      handlePickerChange(next, pickerStyle, pickerFocus);
                    }}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-[12px] transition-[background-color,color]',
                      pickerRole === opt.value
                        ? 'border-foreground/40 bg-accent text-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TONE */}
            <div>
              <SectionLabel>Tone</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {COMMUNICATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={pickerStyle === opt.value}
                    onClick={() => {
                      const next = pickerStyle === opt.value ? null : opt.value;
                      setPickerStyle(next);
                      handlePickerChange(pickerRole, next, pickerFocus);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] transition-[background-color,color]',
                      pickerStyle === opt.value
                        ? 'border-foreground/40 bg-accent text-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>{opt.shortLabel}</span>
                    <span className="text-[11px] opacity-50">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* FOCUS */}
            <div>
              <SectionLabel>Focus</SectionLabel>
              <Input
                type="text"
                placeholder="e.g. shipping a startup, finishing my thesis..."
                value={pickerFocus}
                onChange={(e) => {
                  const next = e.target.value;
                  setPickerFocus(next);
                  handlePickerChange(pickerRole, pickerStyle, next);
                }}
                className="h-8 text-[13px]"
              />
            </div>
          </div>
        </SettingsSection>
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

      {/* Collapsible history section */}
      <section className="space-y-1.5">
        <button
          type="button"
          onClick={() => setHistoryExpanded((prev) => !prev)}
          className="flex w-full items-center gap-1.5 px-0.5 text-left"
        >
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Recent {MEMORY_FIELD_LABELS[memorySubTab]} changes
            {!isLoadingMemoryHistory && ` (${memoryHistory.length})`}
          </h3>
          <svg
            aria-hidden="true"
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
              historyExpanded && 'rotate-180',
            )}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4.5 L6 7.5 L9 4.5" />
          </svg>
        </button>

        {historyExpanded && (
          <SettingsCard>
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
          </SettingsCard>
        )}
      </section>
    </div>
  );
};
