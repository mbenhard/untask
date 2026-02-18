import { useEffect } from 'react';

import { BirdMascot } from '../chat/BirdMascot';
import { Button } from '../ui/button';

type OnboardingSummary = {
  userName: string;
  aiEnabled: boolean;
  providerName: string | null;
  roleName: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

type OnboardingReadyProps = {
  onFinish: () => void;
  isFinishing: boolean;
  summary: OnboardingSummary;
};

export const OnboardingReady = ({ onFinish, isFinishing, summary }: OnboardingReadyProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isFinishing) {
        e.preventDefault();
        onFinish();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFinish, isFinishing]);

  const providerDisplay = summary.providerName
    ? PROVIDER_LABELS[summary.providerName] ?? summary.providerName
    : null;

  const hasSummaryData = summary.userName || summary.aiEnabled || providerDisplay || summary.roleName;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <BirdMascot size={48} animated variant="double-tap" className="text-foreground/80" />

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">You're all set.</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your workspace is ready. Let's get to work.
        </p>
      </div>

      {hasSummaryData ? (
        <div className="w-full rounded-md border border-border bg-accent/50 p-3">
          <div className="flex flex-col gap-1.5">
            {summary.userName ? (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Name</span>
                <span className="text-xs text-foreground">{summary.userName}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">AI</span>
              <span className="text-xs text-foreground">{summary.aiEnabled ? 'Enabled' : 'Off'}</span>
            </div>
            {providerDisplay ? (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Provider</span>
                <span className="text-xs text-foreground">{providerDisplay}</span>
              </div>
            ) : null}
            {summary.roleName ? (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Role</span>
                <span className="text-xs text-foreground">{summary.roleName}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex w-full flex-col gap-2 rounded-md border border-border/50 bg-accent/30 px-3 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Keyboard shortcuts</span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Cmd+N</kbd>
            <span className="text-[11px] text-muted-foreground">New task</span>
          </div>
          <div className="flex items-center justify-between">
            <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Cmd+K</kbd>
            <span className="text-[11px] text-muted-foreground">Chat</span>
          </div>
          <div className="flex items-center justify-between">
            <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Up/Down</kbd>
            <span className="text-[11px] text-muted-foreground">Navigate</span>
          </div>
        </div>
      </div>

      <Button onClick={onFinish} disabled={isFinishing} className="w-full">
        {isFinishing ? 'Opening...' : 'Open App'}
      </Button>

      <div className="flex items-center justify-center gap-4 text-muted-foreground/50">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
          <span className="text-[10px]">Open App</span>
        </span>
      </div>
    </div>
  );
};
