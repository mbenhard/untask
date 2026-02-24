import { useCallback, useEffect, useRef, useState } from 'react';

import { getUntask } from '../../lib/untask';
import { cn } from '../../lib/utils';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

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
  entries: ShortcutHintEntry[];
};

const GLOBAL_SHORTCUT_SETTINGS: GlobalShortcutSetting[] = [
  {
    key: 'shortcut.toggleWindow',
    label: 'Toggle window',
    defaultAccelerator: 'CommandOrControl+Shift+Space',
    action: 'Show or hide the Untask window from anywhere in the OS.',
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
    entries: [
      { keys: '⌘ K', action: 'Toggle chat overlay' },
      { keys: '⌘ F', action: 'Search' },
      { keys: '⌘ N', action: 'New task (or note in Notes view)' },
      { keys: '⌘ ⇧ N', action: 'New note' },
      { keys: '⌘ 1', action: 'Today view' },
      { keys: '⌘ 2', action: 'Tasks view' },
      { keys: '⌘ 3', action: 'Inbox view' },
      { keys: '⌘ 4', action: 'Notes view' },
      { keys: '⌘ ,', action: 'Settings' },
      { keys: '⌘ ⇧ L', action: 'Toggle theme' },
      { keys: '⌘ Z', action: 'Undo assistant action', context: 'When chat is open' },
      { keys: 'Escape', action: 'Dismiss current layer (search, input, overlay)' },
    ],
  },
  {
    title: 'Notes editor',
    entries: [
      { keys: '⌘ Enter', action: 'Process with AI' },
      { keys: '⌘ ⌫', action: 'Archive' },
      { keys: '⌥ ↑ / ↓', action: 'Prev/next note' },
    ],
  },
  {
    title: 'Task list (when focused)',
    entries: [
      { keys: '↑ / ↓', action: 'Navigate' },
      { keys: 'Enter', action: 'Expand' },
      { keys: 'Space', action: 'Complete' },
      { keys: 'T', action: 'Today flag' },
      { keys: 'P', action: 'Cycle priority' },
      { keys: 'S', action: 'Cycle status' },
      { keys: 'E', action: 'Edit title' },
    ],
  },
];

const formatAccelerator = (value: string): string =>
  value
    .replace(/CommandOrControl/g, '⌘')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, '⌘')
    .replace(/\+/g, ' ');

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift']);

const CODE_TO_KEY: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
};

function codeToElectronKey(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('F') && /^F\d{1,2}$/.test(code)) return code;
  return CODE_TO_KEY[code] ?? null;
}

function keyEventToAccelerator(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (event.metaKey) parts.push('CommandOrControl');
  else if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  if (parts.length === 0) return null;

  const keyName = codeToElectronKey(event.code);
  if (!keyName) return null;

  parts.push(keyName);
  return parts.join('+');
}

// ─── Shortcut Recorder ─────────────────────────────────────

type ShortcutRecorderProps = {
  settingKey: string;
  currentAccelerator: string;
  defaultAccelerator: string;
  allResolvedShortcuts: Record<string, string>;
  onSave: (key: string, accelerator: string) => void;
};

const ShortcutRecorder = ({
  settingKey,
  currentAccelerator,
  defaultAccelerator,
  allResolvedShortcuts,
  onSave,
}: ShortcutRecorderProps) => {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<HTMLDivElement>(null);

  const startRecording = useCallback(() => {
    setRecording(true);
    setPending(null);
    setError(null);
  }, []);

  const cancelRecording = useCallback(() => {
    setRecording(false);
    setPending(null);
    setError(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!pending) return;
    onSave(settingKey, pending);
    setRecording(false);
    setPending(null);
    setError(null);
  }, [pending, onSave, settingKey]);

  const handleReset = useCallback(() => {
    onSave(settingKey, defaultAccelerator);
  }, [onSave, settingKey, defaultAccelerator]);

  useEffect(() => {
    if (!recording) return;

    const handler = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (MODIFIER_KEYS.has(event.key)) return;

      if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        cancelRecording();
        return;
      }

      const accelerator = keyEventToAccelerator(event);
      if (!accelerator) {
        setError('Include at least one modifier (⌘, ⌥, or ⇧).');
        return;
      }

      const conflict = GLOBAL_SHORTCUT_SETTINGS.find(
        (s) =>
          s.key !== settingKey &&
          (allResolvedShortcuts[s.key] ?? s.defaultAccelerator) === accelerator,
      );
      if (conflict) {
        setError(`Conflicts with "${conflict.label}".`);
        return;
      }

      setError(null);
      setPending(accelerator);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, settingKey, allResolvedShortcuts, cancelRecording]);

  useEffect(() => {
    if (recording) {
      recorderRef.current?.focus();
    }
  }, [recording]);

  const isDefault = currentAccelerator === defaultAccelerator;

  if (recording) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          ref={recorderRef}
          tabIndex={0}
          className={cn(
            'rounded-sm border px-2 py-0.5 font-mono text-[10px] outline-none transition-colors',
            pending
              ? 'border-foreground/30 bg-muted/40 text-foreground'
              : 'animate-pulse border-foreground/20 bg-muted/20 text-muted-foreground',
          )}
        >
          {pending ? formatAccelerator(pending) : 'Press a shortcut\u2026'}
        </div>
        {error ? (
          <span role="alert" className="text-[10px] text-destructive">{error}</span>
        ) : null}
        {pending ? (
          <button
            type="button"
            onClick={handleSave}
            className="rounded px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-accent"
          >
            Save
          </button>
        ) : null}
        <button
          type="button"
          onClick={cancelRecording}
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <code className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {formatAccelerator(currentAccelerator)}
      </code>
      <button
        type="button"
        onClick={startRecording}
        className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Record
      </button>
      {!isDefault ? (
        <button
          type="button"
          onClick={handleReset}
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────

type SettingsShortcutsProps = {
  setError: (error: string | null) => void;
};

export const SettingsShortcuts = ({ setError }: SettingsShortcutsProps) => {
  const [resolvedShortcuts, setResolvedShortcuts] = useState<Record<string, string>>({});
  const [registrationStatus, setRegistrationStatus] = useState<Record<string, boolean>>({});
  const [isLoadingShortcuts, setIsLoadingShortcuts] = useState(false);

  const loadShortcuts = useCallback(async () => {
    try {
      setIsLoadingShortcuts(true);
      setError(null);
      const resolved: Record<string, string> = {};
      for (const entry of GLOBAL_SHORTCUT_SETTINGS) {
        const stored = await getUntask().settings.get(entry.key);
        resolved[entry.key] =
          stored && stored.trim().length > 0 ? stored : entry.defaultAccelerator;
      }
      setResolvedShortcuts(resolved);
      const status = await getUntask().shortcuts.getRegistrationStatus();
      setRegistrationStatus(status.status);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load shortcuts.');
    } finally {
      setIsLoadingShortcuts(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadShortcuts();
  }, [loadShortcuts]);

  const handleSaveShortcut = useCallback(
    async (key: string, accelerator: string) => {
      try {
        setError(null);
        await getUntask().settings.set(key, accelerator);
        await getUntask().shortcuts.reRegister();
        setResolvedShortcuts((prev) => ({ ...prev, [key]: accelerator }));
        const status = await getUntask().shortcuts.getRegistrationStatus();
        setRegistrationStatus(status.status);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save shortcut.');
      }
    },
    [setError],
  );

  if (isLoadingShortcuts) {
    return (
      <div role="tabpanel" id="settings-panel-shortcuts">
        <p className="text-[11px] text-muted-foreground">Loading shortcuts...</p>
      </div>
    );
  }

  return (
    <div role="tabpanel" id="settings-panel-shortcuts" className="space-y-3">
      <SettingsSection title="Global (system)">
        {GLOBAL_SHORTCUT_SETTINGS.map((entry) => {
          const activeValue = resolvedShortcuts[entry.key] ?? entry.defaultAccelerator;
          const isRegistered = registrationStatus[entry.key] ?? true;
          return (
            <SettingsRow
              key={entry.key}
              label={entry.label}
              hint={entry.action}
            >
              <div className="flex flex-col gap-0.5">
                <ShortcutRecorder
                  settingKey={entry.key}
                  currentAccelerator={activeValue}
                  defaultAccelerator={entry.defaultAccelerator}
                  allResolvedShortcuts={resolvedShortcuts}
                  onSave={(key, acc) => void handleSaveShortcut(key, acc)}
                />
                {!isRegistered && (
                  <span className="text-[11px] text-destructive">
                    Shortcut may conflict with system or another app
                  </span>
                )}
              </div>
            </SettingsRow>
          );
        })}
      </SettingsSection>

      {SHORTCUT_HINT_SECTIONS.map((section) => (
        <SettingsSection key={section.title} title={section.title}>
          {section.entries.map((entry, index) => (
            <SettingsRow
              key={`${entry.keys}-${index}`}
              label={entry.action}
              hint={entry.context}
            >
              <code className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {entry.keys}
              </code>
            </SettingsRow>
          ))}
        </SettingsSection>
      ))}
    </div>
  );
};
