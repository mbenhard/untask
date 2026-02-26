import { useEffect } from 'react';

import { Button } from '../ui/button';

type OnboardingShortcutsProps = {
  onNext: () => void;
};

export const OnboardingShortcuts = ({ onNext }: OnboardingShortcutsProps) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      onNext();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
        <div className="mb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            GLOBAL SHORTCUTS
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Cmd
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Shift
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Space
              </span>
            </div>
            <span className="text-[12px] text-muted-foreground">Summon Untask from anywhere</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Cmd
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Shift
              </span>
              <span className="rounded border border-border/60 bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                Q
              </span>
            </div>
            <span className="text-[12px] text-muted-foreground">Quick add a task</span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/70">Customizable in Settings -&gt; Shortcuts</p>

      <Button onClick={onNext} size="sm" className="mt-auto h-8 w-full text-[12px]">
        Continue
      </Button>
    </div>
  );
};
