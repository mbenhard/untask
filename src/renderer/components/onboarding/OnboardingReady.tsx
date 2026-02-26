import { useEffect } from 'react';

import { BirdMascot } from '../chat/BirdMascot';
import { Button } from '../ui/button';
import { Key } from '../ui/Key';

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
    <div className="flex flex-col items-center gap-8 text-center">
      <BirdMascot size={36} animated variant="wobble" className="text-foreground/80" />

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

      <div className="flex w-full items-center gap-3">
        <Button onClick={onFinish} disabled={isFinishing} className="flex-1">
          {isFinishing ? 'Opening...' : 'Open App'}
        </Button>
        <Key k="enter" size="sm" className="opacity-40" />
      </div>
    </div>
  );
};
