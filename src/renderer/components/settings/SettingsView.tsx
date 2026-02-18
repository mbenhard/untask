import { useState } from 'react';

import { cn } from '../../lib/utils';
import { SettingsGeneral } from './SettingsGeneral';
import { SettingsTasks } from './SettingsTasks';
import { SettingsAI } from './SettingsAI';
import { SettingsMemoryTab } from './SettingsMemoryTab';
import { SettingsShortcuts } from './SettingsShortcuts';
import { SettingsBackup } from './SettingsBackup';

type SettingsTab = 'general' | 'tasks' | 'ai' | 'memory' | 'shortcuts' | 'backup';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'ai', label: 'Assistant' },
  { id: 'memory', label: 'Knowledge' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'backup', label: 'Backup' },
];

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tabContent = (() => {
    switch (activeTab) {
      case 'general':
        return <SettingsGeneral setError={setError} setNotice={setNotice} />;
      case 'tasks':
        return <SettingsTasks setError={setError} setNotice={setNotice} />;
      case 'ai':
        return <SettingsAI setError={setError} setNotice={setNotice} />;
      case 'memory':
        return <SettingsMemoryTab setError={setError} setNotice={setNotice} />;
      case 'shortcuts':
        return <SettingsShortcuts setError={setError} />;
      case 'backup':
        return <SettingsBackup setError={setError} setNotice={setNotice} />;
    }
  })();

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {/* Tab strip */}
        <nav className="flex items-center gap-0.5" aria-label="Settings tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setError(null);
                  setNotice(null);
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

        {/* Messages */}
        {(error || notice) && (
          <div className="space-y-1.5">
            {error && (
              <div
                className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}
            {notice && (
              <div
                className="rounded-md border border-border/40 px-2 py-1.5 text-[11px] text-muted-foreground"
                role="status"
              >
                {notice}
              </div>
            )}
          </div>
        )}

        {tabContent}

        {/* Footer / Credits */}
        <footer className="mt-12 mb-6 flex flex-col items-center gap-2 border-t border-border/40 pt-6 text-center">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Signed by</span>
            <span className="font-medium text-foreground">Marcus</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const email = atob('bWFyY3VzQG9mZmJyYW5kLmRlc2lnbg==');
              void navigator.clipboard.writeText(email);
              setNotice('Email copied to clipboard');
              setTimeout(() => setNotice(null), 2000);
            }}
            className="font-mono text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            marcus@offbrand.design
          </button>

          <div className="mt-2 font-mono text-[10px] text-muted-foreground/40">
            untask v0.1.6 • MIT Licensed
          </div>
        </footer>
      </div>
    </div>
  );
};
