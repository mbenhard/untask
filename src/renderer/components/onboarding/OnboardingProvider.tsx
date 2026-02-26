import { useEffect, useState } from 'react';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

import { onboardingCardVariants, onboardingStaggerContainer } from '../../lib/animation';
import { getUntask } from '../../lib/untask';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getCuratedModelsForProvider, buildModelOptions } from '../settings/ModelCatalogView';

type Provider = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

const PROVIDER_OPTIONS: { value: Provider; label: string; monogram: string }[] = [
  { value: 'openrouter', label: 'OpenRouter', monogram: 'OR' },
  { value: 'openai', label: 'OpenAI', monogram: 'OA' },
  { value: 'anthropic', label: 'Anthropic', monogram: 'AN' },
  { value: 'ollama', label: 'Ollama (local)', monogram: 'OL' },
];

const PROVIDER_HINTS: Record<Provider, string> = {
  openrouter: 'One key, many models. Get one at openrouter.ai.',
  openai: 'API key from platform.openai.com.',
  anthropic: 'API key from console.anthropic.com.',
  ollama: 'No key needed. Ollama must be running locally.',
};

const PROVIDER_PLACEHOLDERS: Record<Provider, string> = {
  openrouter: 'sk-or-...',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  ollama: '',
};

import type { OnboardingNavProps } from './OnboardingFlow';

type OnboardingProviderProps = {
  onNext: (provider: Provider, keyOrUrl: string, modelId: string) => void;
  onSkip: () => void;
  nav: OnboardingNavProps;
  isActive: boolean;
};

export const OnboardingProvider = ({ onNext, onSkip, nav, isActive }: OnboardingProviderProps) => {
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [keyInput, setKeyInput] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationState, setValidationState] = useState<'idle' | 'valid' | 'error'>('idle');
  const [validationError, setValidationError] = useState('');
  const prefersReducedMotion = useReducedMotion();

  const isOllama = provider === 'ollama';
  const effectiveValue = isOllama ? ollamaUrl : keyInput;
  const canValidate = !isOllama && keyInput.trim().length > 0;
  const canContinue = isOllama
    ? ollamaUrl.trim().length > 0 && selectedModelId.trim().length > 0
    : keyInput.trim().length > 0 && selectedModelId.trim().length > 0;

  useEffect(() => {
    const models = getCuratedModelsForProvider(provider);
    const defaultModel = models.find((m) => m.id === 'anthropic/claude-haiku-4-5') ?? models[0];
    setSelectedModelId(defaultModel?.id ?? '');
  }, [provider]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (e.key === 'Enter' && canContinue) {
        e.preventDefault();
        onNext(provider, effectiveValue.trim(), selectedModelId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canContinue, provider, effectiveValue, selectedModelId, onNext, isActive]);

  const handleProviderChange = (next: Provider) => {
    setProvider(next);
    setKeyInput('');
    setValidationState('idle');
    setValidationError('');
    const models = getCuratedModelsForProvider(next);
    const defaultModel = models.find((m) => m.id === 'anthropic/claude-haiku-4-5') ?? models[0];
    setSelectedModelId(defaultModel?.id ?? '');
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
    onNext(provider, effectiveValue.trim(), selectedModelId);
  };

  const Wrapper = prefersReducedMotion ? 'div' : motion.div;
  const Card = prefersReducedMotion ? 'div' : motion.div;
  const staggerProps = prefersReducedMotion
    ? {}
    : { variants: onboardingStaggerContainer, initial: 'enter', animate: isActive ? 'center' : 'enter' };
  const cardProps = prefersReducedMotion ? {} : { variants: onboardingCardVariants };

  return (
    <Wrapper {...staggerProps} className="flex flex-col gap-2">
      <Card {...cardProps} className="grid grid-cols-2 gap-2">
        {PROVIDER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleProviderChange(opt.value)}
            className={cn(
              'rounded-md border border-dashed border-border/60 bg-background px-3 py-2 text-left transition-colors',
              provider === opt.value && 'border-solid border-foreground/40 bg-accent/30',
            )}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {opt.monogram}
              </span>
              <span className="text-[13px] text-foreground">{opt.label}</span>
              {opt.value === 'openrouter' ? (
                <span className="ml-auto rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Recommended
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">{PROVIDER_HINTS[opt.value]}</p>
          </button>
        ))}
      </Card>

      <Card {...cardProps} className="rounded-md border border-dashed border-border/60 bg-background px-3 py-3">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            {isOllama ? 'SERVER URL' : 'API KEY'}
          </span>
        {isOllama ? (
          <Input
            id="onboarding-ollama-url"
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="h-8 text-[13px]"
          />
        ) : (
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
                'h-8 flex-1 text-[13px]',
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
              className="h-8 border-dashed border-border/60 px-3 text-[12px]"
            >
              {isValidating ? 'Checking...' : 'Validate'}
            </Button>
          </div>
        )}
        {validationState === 'valid' ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-green-500 dark:text-green-400">
            <Check className="size-3" />
            Key is valid
          </p>
        ) : null}
        {validationState === 'error' ? (
          <p className="mt-1 text-[11px] text-destructive">{validationError}</p>
        ) : null}

        <div className="mt-3">
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
            MODEL
          </span>
          {isOllama ? (
            <select
              id="onboarding-model"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-[13px]"
            >
              <option value="" disabled>
                Select a model
              </option>
              <option value="llama3.1:8b">llama3.1:8b · 8B</option>
              <option value="mistral:7b">mistral:7b · 7B</option>
              <option value="qwen3:8b">qwen3:8b · 8B</option>
              <option value="qwen3:14b">qwen3:14b · 14B</option>
            </select>
          ) : (
            <select
              id="onboarding-model"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-[13px]"
            >
              {buildModelOptions(provider, selectedModelId).map((group, idx) => (
                'options' in group ? (
                  <optgroup key={idx} label={group.label}>
                    {group.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={group.value} value={group.value}>
                    {group.label}
                  </option>
                )
              ))}
            </select>
          )}
        </div>
      </Card>

      <Card {...cardProps} className="flex flex-col items-center gap-2 pt-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={nav.onBack}
            disabled={!nav.canGoBack}
            className="h-8 border-dashed border-border/60 bg-transparent px-4 text-[12px] hover:bg-accent/50"
          >
            Back
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue} size="sm" className="h-8 px-6 text-[12px]">
            Continue
          </Button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip for now
        </button>
      </Card>
    </Wrapper>
  );
};
