import { useCallback, useEffect, useState } from 'react';

import { getFlusk } from '../../lib/flusk';
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
    action: 'Show or hide the Flusk window from anywhere in the OS.',
  },
  {
    key: 'shortcut.quickAdd',
    label: 'Quick add',
    defaultAccelerator: 'CommandOrControl+Shift+Q',
    action: 'Open quick add and prefill from clipboard when available.',
  },
];

const SHORTCUT_HINT_SECTIONS: ShortcutHintSection[] = [
  {
    title: 'App-wide',
    entries: [
      { keys: 'Cmd/Ctrl + K', action: 'Toggle chat overlay and focus chat input.' },
      { keys: 'Cmd/Ctrl + F', action: 'Open or close Search.' },
      { keys: 'Cmd/Ctrl + N', action: 'Jump to Notes view.' },
      { keys: 'Cmd/Ctrl + Shift + N', action: 'Create a new note and open it.' },
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
      { keys: 'Cmd/Ctrl + Shift + L', action: 'Toggle light/dark theme.' },
      {
        keys: 'N',
        action: 'Open new-task input.',
        context: 'Only in Today, Tasks, or Inbox while chat is in peek mode and Search is closed.',
      },
    ],
  },
  {
    title: 'Notes',
    entries: [
      {
        keys: 'Cmd/Ctrl + Enter',
        action: 'Process active note with AI.',
        context: 'Only in Notes editor.',
      },
      {
        keys: 'Cmd/Ctrl + Shift + A',
        action: 'Archive active note.',
        context: 'Only in Notes editor.',
      },
      {
        keys: 'Alt + Arrow Up / Arrow Down',
        action: 'Open previous or next active note.',
        context: 'Only in Notes editor.',
      },
      {
        keys: 'Escape',
        action: 'Return from note editor to notes list.',
        context: 'Only in Notes editor while chat overlay is peeked.',
      },
      {
        keys: 'J / K',
        action: 'Move selected note up or down in the list.',
        context: 'Notes view only, while not typing and chat overlay is peeked.',
      },
      {
        keys: 'Enter',
        action: 'Open the currently selected note in the list.',
        context: 'Notes view only while chat overlay is peeked.',
      },
    ],
  },
  {
    title: 'Task list',
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
    entries: [
      { keys: 'Arrow Up / Arrow Down', action: 'Move selected result.' },
      { keys: 'Enter', action: 'Open the selected result.' },
      { keys: 'Escape', action: 'Close Search.' },
    ],
  },
  {
    title: 'Input actions',
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

type SettingsShortcutsProps = {
  setError: (error: string | null) => void;
};

export const SettingsShortcuts = ({ setError }: SettingsShortcutsProps) => {
  const [resolvedShortcuts, setResolvedShortcuts] = useState<Record<string, string>>({});
  const [isLoadingShortcuts, setIsLoadingShortcuts] = useState(false);

  const loadShortcuts = useCallback(async () => {
    try {
      setIsLoadingShortcuts(true);
      setError(null);
      const resolved: Record<string, string> = {};
      for (const entry of GLOBAL_SHORTCUT_SETTINGS) {
        const stored = await getFlusk().settings.get(entry.key);
        resolved[entry.key] =
          stored && stored.trim().length > 0 ? stored : entry.defaultAccelerator;
      }
      setResolvedShortcuts(resolved);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load shortcuts.');
    } finally {
      setIsLoadingShortcuts(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadShortcuts();
  }, [loadShortcuts]);

  if (isLoadingShortcuts) {
    return (
      <div role="tabpanel" id="settings-panel-shortcuts">
        <p className="text-[11px] text-muted-foreground">Loading shortcuts...</p>
      </div>
    );
  }

  return (
    <div role="tabpanel" id="settings-panel-shortcuts" className="space-y-6">
      <SettingsSection title="Global (system)">
        {GLOBAL_SHORTCUT_SETTINGS.map((entry) => {
          const activeValue = resolvedShortcuts[entry.key] ?? entry.defaultAccelerator;
          return (
            <SettingsRow
              key={entry.key}
              label={entry.label}
              hint={entry.action}
            >
              <code className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                {formatAccelerator(activeValue)}
              </code>
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
              <code className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                {entry.keys}
              </code>
            </SettingsRow>
          ))}
        </SettingsSection>
      ))}
    </div>
  );
};
