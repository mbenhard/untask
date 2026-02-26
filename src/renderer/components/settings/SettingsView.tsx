import { useState, useCallback, useEffect } from 'react';

import { cn } from '../../lib/utils';
import { useToastStore } from '../../stores/toastStore';

// Fetch version at module load so it's ready before first paint.
let _cachedVersion = '';
if (typeof window !== 'undefined' && window.untask) {
  void window.untask.app.getVersion().then((v) => { _cachedVersion = v; });
}
import { SettingsGeneral } from './SettingsGeneral';
import { SettingsTasks } from './SettingsTasks';
import { SettingsAI } from './SettingsAI';
import { SettingsShortcuts } from './SettingsShortcuts';
import { SettingsBackup } from './SettingsBackup';
import { SettingsReminders } from './SettingsReminders';

type SettingsTab = 'general' | 'tasks' | 'reminders' | 'assistant' | 'shortcuts' | 'backup';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'backup', label: 'Backup' },
];

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [error, setError] = useState<string | null>(null);
  const showToast = useToastStore((s) => s.showToast);
  const setNotice = useCallback(
    (notice: string | null) => { if (notice) showToast(notice); },
    [showToast],
  );
  const [version, setVersion] = useState(_cachedVersion);

  useEffect(() => {
    // If module-level fetch hasn't resolved yet, pick it up here.
    if (!version) {
      window.untask?.app.getVersion().then(setVersion);
    }
  }, [version]);

  const tabContent = (() => {
    switch (activeTab) {
      case 'general':
        return <SettingsGeneral setError={setError} setNotice={setNotice} />;
      case 'tasks':
        return <SettingsTasks />;
      case 'reminders':
        return <SettingsReminders setError={setError} setNotice={setNotice} />;
      case 'assistant':
        return <SettingsAI setError={setError} setNotice={setNotice} />;
      case 'shortcuts':
        return <SettingsShortcuts setError={setError} />;
      case 'backup':
        return <SettingsBackup setError={setError} setNotice={setNotice} />;
    }
  })();

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3">
        {/* Tab strip */}
        <nav className="flex items-center gap-0.5" aria-label="Settings tabs" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.id);
                  setError(null);
                }}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Error banner */}
        {error && (
          <div
            id="settings-error"
            className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <div role="tabpanel" className="flex-1">
          {tabContent}
        </div>

        {/* Footer / Credits */}
        <footer className="mt-12 mb-6 flex flex-col items-center gap-2 pt-6 text-center">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-muted-foreground">Love from</span>
            <a
              href="https://unta.sk/support"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground transition-colors hover:underline"
            >
              Marcus
            </a>
            {version && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground/60">{version}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground/60">
            <a
              href="https://unta.sk/support"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Support
            </a>
            <span className="text-muted-foreground/30">·</span>
            <a
              href="https://unta.sk/changelog"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Changelog
            </a>
            <span className="text-muted-foreground/30">·</span>
            <a
              href="https://github.com/mbenhard/untask"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
