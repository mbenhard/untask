import { useEffect } from 'react';
import { useState } from 'react';

import { Check, Lock } from 'lucide-react';

import { getUntask } from '../../lib/untask';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type Provider = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

const PROVIDER_OPTIONS: { value: Provider; label: string; monogram: string }[] = [
  { value: 'openrouter', label: 'OpenRouter', monogram: 'OR' },
  { value: 'openai', label: 'OpenAI', monogram: 'OA' },
  { value: 'anthropic', label: 'Anthropic', monogram: 'AN' },
  { value: 'ollama', label: 'Ollama (local)', monogram: 'OL' },
];

const PROVIDER_HINTS: Record<Provider, string> = {
  openrouter: 'Get a key at openrouter.ai — access to many models with one key.',
  openai: 'Get a key at platform.openai.com.',
  anthropic: 'Get a key at console.anthropic.com.',
  ollama: 'No key needed. Make sure Ollama is running locally.',
};

const PROVIDER_PLACEHOLDERS: Record<Provider, string> = {
  openrouter: 'sk-or-...',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  ollama: '',
};

type OnboardingProviderProps = {
  onNext: (provider: Provider, keyOrUrl: string) => void;
  onSkip: () => void;
};

export const OnboardingProvider = ({ onNext, onSkip }: OnboardingProviderProps) => {
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [keyInput, setKeyInput] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [isValidating, setIsValidating] = useState(false);
  const [validationState, setValidationState] = useState<'idle' | 'valid' | 'error'>('idle');
  const [validationError, setValidationError] = useState('');

  const isOllama = provider === 'ollama';
  const effectiveValue = isOllama ? ollamaUrl : keyInput;
  const canValidate = !isOllama && keyInput.trim().length > 0;
  const canContinue = isOllama
    ? ollamaUrl.trim().length > 0
    : keyInput.trim().length > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && canContinue) {
        e.preventDefault();
        onNext(provider, effectiveValue.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canContinue, provider, effectiveValue, onNext, onSkip]);

  const handleProviderChange = (next: Provider) => {
    setProvider(next);
    setKeyInput('');
    setValidationState('idle');
    setValidationError('');
  };

  const handleValidate = async () => {
    const key = keyInput.trim();
    if (key.length === 0) return;

    setIsValidating(true);
    setValidationState('idle');
    setValidationError('');

    try {
      const result = await getUntask().apiKeys.validate(provider, key);
      if (result.valid) {
        setValidationState('valid');
      } else {
        setValidationState('error');
        setValidationError(result.error ?? 'Key appears to be invalid.');
      }
    } catch (err) {
      setValidationState('error');
      setValidationError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = () => {
    onNext(provider, effectiveValue.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Connect AI provider</h2>
        <p className="text-xs text-muted-foreground">
          Choose where the AI assistant gets its intelligence.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-foreground">Provider</span>
          <div className="grid grid-cols-2 gap-1.5">
            {PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleProviderChange(opt.value)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left',
                  provider === opt.value
                    ? 'border-foreground/30 bg-accent text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="font-mono text-[10px] opacity-40">{opt.monogram}</span>
                <span>{opt.label}</span>
                {opt.value === 'openrouter' && (
                  <span className="ml-auto text-[10px] text-muted-foreground/60">Recommended</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{PROVIDER_HINTS[provider]}</p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="size-3 shrink-0 opacity-50" />
          <span>Your key is stored locally on this device. Never sent to our servers.</span>
        </div>

        {isOllama ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="onboarding-ollama-url" className="text-xs font-medium text-foreground">
              Ollama base URL
            </label>
            <Input
              id="onboarding-ollama-url"
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="h-9 text-sm"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="onboarding-api-key" className="text-xs font-medium text-foreground">
              API key
            </label>
            <div className="flex gap-2">
              <Input
                id="onboarding-api-key"
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setValidationState('idle');
                  setValidationError('');
                }}
                placeholder={PROVIDER_PLACEHOLDERS[provider]}
                className={cn(
                  'h-9 flex-1 text-sm',
                  validationState === 'valid' && 'border-green-500/50 dark:border-green-400/50',
                  validationState === 'error' && 'border-destructive/50',
                )}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleValidate()}
                disabled={!canValidate || isValidating}
                className="h-9 shrink-0 text-xs"
              >
                {isValidating ? 'Checking...' : 'Validate'}
              </Button>
            </div>

            {validationState === 'valid' ? (
              <p className="flex items-center gap-1 text-[11px] text-green-500 dark:text-green-400">
                <Check className="size-3" />
                Key is valid
              </p>
            ) : validationState === 'error' ? (
              <p className="text-[11px] text-destructive">
                {validationError}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={handleContinue} disabled={!canContinue} className="w-full">
          Continue
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};
