import { useState } from 'react';

import { cn } from '../../lib/utils';
import { SettingsGeneral } from './SettingsGeneral';
import { SettingsAI } from './SettingsAI';
import { SettingsMemoryTab } from './SettingsMemoryTab';
import { SettingsJournal } from './SettingsJournal';
import { SettingsShortcuts } from './SettingsShortcuts';
import { SettingsBackup } from './SettingsBackup';

type SettingsTab = 'general' | 'ai' | 'memory' | 'journal' | 'shortcuts' | 'backup';

const TAB_ORDER: SettingsTab[] = ['general', 'ai', 'memory', 'journal', 'shortcuts', 'backup'];

const TAB_LABELS: Record<SettingsTab, string> = {
  general: 'General',
  ai: 'AI',
  memory: 'Memory',
  journal: 'Journal',
  shortcuts: 'Shortcuts',
  backup: 'Backup',
};

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tabContent = (() => {
    switch (activeTab) {
      case 'general':
        return <SettingsGeneral setError={setError} setNotice={setNotice} />;
      case 'ai':
        return <SettingsAI setError={setError} setNotice={setNotice} />;
      case 'memory':
        return <SettingsMemoryTab setError={setError} setNotice={setNotice} />;
      case 'journal':
        return <SettingsJournal setError={setError} />;
      case 'shortcuts':
        return <SettingsShortcuts setError={setError} />;
      case 'backup':
        return <SettingsBackup setError={setError} setNotice={setNotice} />;
    }
  })();

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <nav className="flex items-center gap-0.5" role="tablist" aria-label="Settings sections">
          {TAB_ORDER.map((tab) => {
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab}`}
                onClick={() => {
                  setActiveTab(tab);
                  setError(null);
                  setNotice(null);
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </nav>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground">
            {notice}
          </p>
        ) : null}

        {tabContent}
      </div>
    </div>
  );
};
