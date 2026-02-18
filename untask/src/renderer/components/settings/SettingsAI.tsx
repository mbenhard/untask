import { useCallback, useEffect, useState } from 'react';

import { getUntask } from '../../lib/untask';
import { selectAiEnabled, useAppStore } from '../../stores/appStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';

// ─── Provider types ──────────────────────────────────────────────────────────

type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

type CostTier = 'free' | 'cheap' | 'moderate' | 'premium';

type CuratedModel = {
  id: string;
  name: string;
  provider: ProviderType;
  costTier: CostTier;
  capabilities: ('tools' | 'vision' | 'reasoning')[];
  isDefault?: boolean;
  isRecommended?: boolean;
};

// ─── Static curated model list (mirrors main/ai/models.ts) ───────────────────

const CURATED_MODELS: readonly CuratedModel[] = [
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    costTier: 'cheap',
    capabilities: ['tools', 'vision'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'openrouter',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools'],
    isRecommended: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    costTier: 'cheap',
    capabilities: ['tools'],
    isRecommended: true,
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    name: 'Gemini 2.5 Flash',
    provider: 'openrouter',
    costTier: 'free',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'z-ai/glm-4.7-flash',
    name: 'GLM 4.7 Flash',
    provider: 'openrouter',
    costTier: 'free',
    capabilities: ['tools', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'llama3.3:70b',
    name: 'Llama 3.3 70B',
    provider: 'ollama',
    costTier: 'free',
    capabilities: ['tools'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'qwen3:8b',
    name: 'Qwen 3 8B',
    provider: 'ollama',
    costTier: 'free',
    capabilities: ['tools'],
    isRecommended: true,
  },
];

// ─── Provider metadata ────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<ProviderType, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

const PROVIDER_KEY_LINKS: Record<ProviderType, string | null> = {
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  ollama: 'https://ollama.com/download',
};

const PROVIDER_KEY_PLACEHOLDER: Record<ProviderType, string> = {
  openrouter: 'sk-or-...',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  ollama: '',
};

const COST_TIER_LABEL: Record<CostTier, string> = {
  free: 'Free',
  cheap: '$',
  moderate: '$$',
  premium: '$$$',
};

// ─── Setting key constants ────────────────────────────────────────────────────

const SETTING_KEY_AI_PROVIDER = 'ai_provider';
const SETTING_KEY_AI_OLLAMA_BASE_URL = 'ai_ollama_base_url';


const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCuratedModelsForProvider = (provider: ProviderType): CuratedModel[] =>
  CURATED_MODELS.filter((m) => m.provider === provider);

const buildModelLabel = (model: CuratedModel): string => {
  const caps: string[] = [];
  if (model.capabilities.includes('tools')) caps.push('tools');
  if (model.capabilities.includes('vision')) caps.push('vision');
  if (model.capabilities.includes('reasoning')) caps.push('reasoning');
  const capStr = caps.length > 0 ? ` · ${caps.join(', ')}` : '';
  const costStr = ` · ${COST_TIER_LABEL[model.costTier]}`;
  return `${model.name}${capStr}${costStr}`;
};

const isValidProvider = (value: string): value is ProviderType =>
  ['openrouter', 'openai', 'anthropic', 'ollama'].includes(value);

// ─── Component ────────────────────────────────────────────────────────────────

type SettingsAIProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export const SettingsAI = ({ setError, setNotice }: SettingsAIProps) => {
  const aiEnabled = useAppStore(selectAiEnabled);
  const setAiEnabledStore = useAppStore((state) => state.setAiEnabled);

  // AI enabled
  const [isLoadingAiEnabled, setIsLoadingAiEnabled] = useState(false);

  // Provider
  const [provider, setProvider] = useState<ProviderType>('openrouter');
  const [isLoadingProvider, setIsLoadingProvider] = useState(false);

  // API key state (for keyed providers)
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  const [apiKeyValidating, setApiKeyValidating] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Ollama base URL
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
  const [isLoadingOllamaUrl, setIsLoadingOllamaUrl] = useState(false);
  const [isSavingOllamaUrl, setIsSavingOllamaUrl] = useState(false);

  // Model
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);


  // Behavior
  const [autonomyMode, setAutonomyMode] = useState<'auto' | 'confirm'>('auto');
  const [isLoadingAutonomy, setIsLoadingAutonomy] = useState(false);
  const [retentionMode, setRetentionMode] = useState<'session' | '30d' | 'forever'>('session');
  const [isLoadingRetention, setIsLoadingRetention] = useState(false);

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const loadAiEnabled = useCallback(async () => {
    try {
      setIsLoadingAiEnabled(true);
      const result = await getUntask().settings.getAiEnabled();
      setAiEnabledStore(result.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load AI enabled setting.');
    } finally {
      setIsLoadingAiEnabled(false);
    }
  }, [setError, setAiEnabledStore]);

  const loadProvider = useCallback(async () => {
    try {
      setIsLoadingProvider(true);
      const stored = await getUntask().settings.get(SETTING_KEY_AI_PROVIDER);
      const resolved = stored && isValidProvider(stored) ? stored : 'openrouter';
      setProvider(resolved);
      return resolved;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load AI provider.');
      return 'openrouter' as ProviderType;
    } finally {
      setIsLoadingProvider(false);
    }
  }, [setError]);

  const loadApiKeyStatus = useCallback(async (prov: ProviderType) => {
    if (prov === 'ollama') return;
    try {
      setIsLoadingApiKey(true);
      setApiKeyValid(null);
      setApiKeyError(null);
      const result = await getUntask().apiKeys.has(prov);
      setHasApiKey(result.hasKey);
      setApiKeyInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check API key status.');
    } finally {
      setIsLoadingApiKey(false);
    }
  }, [setError]);

  const loadOllamaBaseUrl = useCallback(async () => {
    try {
      setIsLoadingOllamaUrl(true);
      const stored = await getUntask().settings.get(SETTING_KEY_AI_OLLAMA_BASE_URL);
      setOllamaBaseUrl(stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_OLLAMA_BASE_URL);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Ollama base URL.');
    } finally {
      setIsLoadingOllamaUrl(false);
    }
  }, [setError]);

  const loadSelectedModel = useCallback(async () => {
    try {
      setIsLoadingModel(true);
      const result = await getUntask().chat.getSelectedModel();
      setSelectedModelId(result.modelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load selected model.');
    } finally {
      setIsLoadingModel(false);
    }
  }, [setError]);



  const loadAutonomyMode = useCallback(async () => {
    try {
      setIsLoadingAutonomy(true);
      const result = await getUntask().chat.getAutonomyMode();
      setAutonomyMode(result.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load autonomy mode.');
    } finally {
      setIsLoadingAutonomy(false);
    }
  }, [setError]);

  const loadRetentionMode = useCallback(async () => {
    try {
      setIsLoadingRetention(true);
      const result = await getUntask().chat.getRetentionMode();
      setRetentionMode(result.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load retention mode.');
    } finally {
      setIsLoadingRetention(false);
    }
  }, [setError]);

  useEffect(() => {
    void (async () => {
      await loadAiEnabled();
      const resolvedProvider = await loadProvider();
      void loadApiKeyStatus(resolvedProvider);
      void loadOllamaBaseUrl();
      void loadSelectedModel();
      void loadAutonomyMode();
      void loadRetentionMode();
    })();
  }, [
    loadAiEnabled,
    loadProvider,
    loadApiKeyStatus,
    loadOllamaBaseUrl,
    loadSelectedModel,
    loadAutonomyMode,
    loadRetentionMode,
  ]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAiEnabledChange = useCallback(
    async (value: 'on' | 'off') => {
      const enabled = value === 'on';
      const previousEnabled = aiEnabled;
      setAiEnabledStore(enabled);
      setNotice(null);
      setError(null);

      try {
        await getUntask().settings.setAiEnabled(enabled);
        setNotice(enabled ? 'AI assistant enabled.' : 'AI assistant disabled. App works as pure task manager.');
      } catch (e) {
        setAiEnabledStore(previousEnabled);
        setError(e instanceof Error ? e.message : 'Failed to update AI enabled setting.');
      }
    },
    [aiEnabled, setError, setNotice, setAiEnabledStore],
  );

  const handleProviderChange = useCallback(
    async (value: string) => {
      if (!isValidProvider(value)) return;
      const previousProvider = provider;
      setProvider(value);
      setApiKeyInput('');
      setApiKeyValid(null);
      setApiKeyError(null);
      setNotice(null);
      setError(null);

      try {
        await getUntask().settings.set(SETTING_KEY_AI_PROVIDER, value);

        // Load key status for new provider
        if (value !== 'ollama') {
          await loadApiKeyStatus(value);
        }

        // Reset selected model to provider default
        const providerModels = getCuratedModelsForProvider(value);
        const defaultModel = providerModels.find((m) => m.isDefault) ?? providerModels[0];
        if (defaultModel) {
          const result = await getUntask().chat.setSelectedModel({ modelId: defaultModel.id });
          setSelectedModelId(result.modelId);
        }

        setNotice(`Provider changed to ${PROVIDER_LABELS[value]}.`);
      } catch (e) {
        setProvider(previousProvider);
        setError(e instanceof Error ? e.message : 'Failed to update provider.');
      }
    },
    [provider, setError, setNotice, loadApiKeyStatus],
  );

  const handleSaveApiKey = useCallback(async () => {
    const normalized = apiKeyInput.trim();
    if (normalized.length === 0) {
      setError(`Enter a ${PROVIDER_LABELS[provider]} API key before saving.`);
      return;
    }

    try {
      setIsSavingApiKey(true);
      setError(null);
      setNotice(null);
      setApiKeyError(null);
      await getUntask().apiKeys.set(provider, normalized);
      setHasApiKey(true);
      setApiKeyInput('');
      setApiKeyValid(null);
      setNotice(`${PROVIDER_LABELS[provider]} API key saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save API key.');
    } finally {
      setIsSavingApiKey(false);
    }
  }, [apiKeyInput, provider, setError, setNotice]);

  const handleValidateApiKey = useCallback(async () => {
    const normalized = apiKeyInput.trim();
    if (normalized.length === 0) {
      setError(`Enter a ${PROVIDER_LABELS[provider]} API key to validate.`);
      return;
    }

    try {
      setApiKeyValidating(true);
      setApiKeyValid(null);
      setApiKeyError(null);
      setError(null);
      setNotice(null);
      const result = await getUntask().apiKeys.validate(provider, normalized);
      setApiKeyValid(result.valid);
      if (!result.valid) {
        setApiKeyError(result.error ?? 'Key validation failed.');
      } else {
        setNotice('API key is valid.');
      }
    } catch (e) {
      setApiKeyValid(false);
      setApiKeyError(e instanceof Error ? e.message : 'Validation failed.');
    } finally {
      setApiKeyValidating(false);
    }
  }, [apiKeyInput, provider, setError, setNotice]);

  const handleClearApiKey = useCallback(async () => {
    try {
      setIsSavingApiKey(true);
      setError(null);
      setNotice(null);
      setApiKeyError(null);
      await getUntask().apiKeys.delete(provider);
      setHasApiKey(false);
      setApiKeyInput('');
      setApiKeyValid(null);
      setNotice(`${PROVIDER_LABELS[provider]} API key cleared.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear API key.');
    } finally {
      setIsSavingApiKey(false);
    }
  }, [provider, setError, setNotice]);

  const handleSaveOllamaUrl = useCallback(async () => {
    const normalized = ollamaBaseUrl.trim();
    if (normalized.length === 0) {
      setError('Enter a valid Ollama base URL.');
      return;
    }

    try {
      setIsSavingOllamaUrl(true);
      setError(null);
      setNotice(null);
      await getUntask().settings.set(SETTING_KEY_AI_OLLAMA_BASE_URL, normalized);
      setNotice('Ollama base URL saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save Ollama base URL.');
    } finally {
      setIsSavingOllamaUrl(false);
    }
  }, [ollamaBaseUrl, setError, setNotice]);

  const handleModelChange = useCallback(
    async (modelId: string) => {
      const previousId = selectedModelId;
      setSelectedModelId(modelId);
      setNotice(null);
      setError(null);

      try {
        const result = await getUntask().chat.setSelectedModel({ modelId });
        setSelectedModelId(result.modelId);
        setNotice('Model updated.');
      } catch (e) {
        setSelectedModelId(previousId);
        setError(e instanceof Error ? e.message : 'Failed to update model.');
      }
    },
    [selectedModelId, setError, setNotice],
  );



  const handleAutonomyChange = useCallback(
    async (mode: 'auto' | 'confirm') => {
      const previousMode = autonomyMode;
      setAutonomyMode(mode);
      setNotice(null);
      setError(null);

      try {
        const result = await getUntask().chat.setAutonomyMode({ mode });
        setAutonomyMode(result.mode);
        setNotice(`Autonomy mode set to ${result.mode}.`);
      } catch (e) {
        setAutonomyMode(previousMode);
        setError(e instanceof Error ? e.message : 'Failed to update autonomy mode.');
      }
    },
    [autonomyMode, setError, setNotice],
  );

  const handleRetentionChange = useCallback(
    async (mode: 'session' | '30d' | 'forever') => {
      const previousMode = retentionMode;
      setRetentionMode(mode);
      setNotice(null);
      setError(null);

      try {
        const result = await getUntask().chat.setRetentionMode({ mode });
        setRetentionMode(result.mode);
        setNotice(`Chat retention set to ${mode === '30d' ? '30 days' : mode}.`);
      } catch (e) {
        setRetentionMode(previousMode);
        setError(e instanceof Error ? e.message : 'Failed to update retention mode.');
      }
    },
    [retentionMode, setError, setNotice],
  );

  // ─── Derived values ──────────────────────────────────────────────────────────

  const providerModels = getCuratedModelsForProvider(provider);
  const modelOptions = providerModels.map((m) => ({
    value: m.id,
    label: buildModelLabel(m),
  }));

  const isKeyedProvider = provider !== 'ollama';
  const keyLink = PROVIDER_KEY_LINKS[provider];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div role="tabpanel" id="settings-panel-ai" className="space-y-3">

      {/* ── Assistant toggle ─────────────────────────────────────────────── */}
      <SettingsSection title="Assistant">
        <SettingsRow
          label="Enable AI assistant"
          hint="When off, the app works as a pure task manager. Chat history and memory are preserved."
          loading={isLoadingAiEnabled}
        >
          <SegmentedControl
            options={[
              { value: 'on' as const, label: 'On' },
              { value: 'off' as const, label: 'Off' },
            ]}
            value={aiEnabled ? 'on' : 'off'}
            onChange={(v) => void handleAiEnabledChange(v as 'on' | 'off')}
          />
        </SettingsRow>
      </SettingsSection>

      {aiEnabled ? (
        <>
          {/* ── Provider ──────────────────────────────────────────────────── */}
          <SettingsSection title="Provider">
            <SettingsRow label="AI provider" loading={isLoadingProvider}>
              <SettingsSelect
                options={[
                  { value: 'openrouter', label: 'OpenRouter' },
                  { value: 'openai', label: 'OpenAI' },
                  { value: 'anthropic', label: 'Anthropic' },
                  { value: 'ollama', label: 'Ollama (local)' },
                ]}
                value={provider}
                onChange={(v) => void handleProviderChange(v)}
                aria-label="AI provider"
              />
            </SettingsRow>
          </SettingsSection>

          {/* ── API Key / Connection ──────────────────────────────────────── */}
          <SettingsSection title={isKeyedProvider ? 'API Key' : 'Connection'}>
            <div className="px-2 py-2">
              {isKeyedProvider ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="password"
                      value={apiKeyInput}
                      onChange={(event) => {
                        setApiKeyInput(event.target.value);
                        setApiKeyValid(null);
                        setApiKeyError(null);
                      }}
                      placeholder={
                        isLoadingApiKey
                          ? 'Checking...'
                          : hasApiKey
                            ? 'Saved key (enter to replace)'
                            : PROVIDER_KEY_PLACEHOLDER[provider]
                      }
                      disabled={isLoadingApiKey || isSavingApiKey}
                      className="h-7 flex-1 text-[11px]"
                      aria-label={`${PROVIDER_LABELS[provider]} API key`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleValidateApiKey()}
                      disabled={isLoadingApiKey || isSavingApiKey || apiKeyValidating || apiKeyInput.trim().length === 0}
                      className="h-7 text-[11px]"
                    >
                      {apiKeyValidating ? 'Checking...' : 'Validate'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveApiKey()}
                      disabled={isLoadingApiKey || isSavingApiKey || apiKeyInput.trim().length === 0}
                      className="h-7 text-[11px]"
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleClearApiKey()}
                      disabled={isLoadingApiKey || isSavingApiKey || !hasApiKey}
                      className="h-7 text-[11px]"
                    >
                      Clear
                    </Button>
                  </div>

                  {/* Status line */}
                  <div className="flex items-center gap-1.5">
                    {apiKeyValid === true ? (
                      <span className="text-[11px] text-green-600 dark:text-green-400">Key is valid.</span>
                    ) : apiKeyError ? (
                      <span className="text-[11px] text-destructive">{apiKeyError}</span>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {isLoadingApiKey
                          ? 'Checking key status...'
                          : hasApiKey
                            ? 'A key is currently saved.'
                            : 'No key saved yet.'}
                      </p>
                    )}
                  </div>

                  {/* "Where do I get a key?" link */}
                  {keyLink ? (
                    <p className="text-[11px] text-muted-foreground">
                      <a
                        href={keyLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        Where do I get a {PROVIDER_LABELS[provider]} key?
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : (
                /* Ollama base URL */
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      value={ollamaBaseUrl}
                      onChange={(event) => setOllamaBaseUrl(event.target.value)}
                      placeholder={DEFAULT_OLLAMA_BASE_URL}
                      disabled={isLoadingOllamaUrl || isSavingOllamaUrl}
                      className="h-7 flex-1 text-[11px]"
                      aria-label="Ollama base URL"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveOllamaUrl()}
                      disabled={isLoadingOllamaUrl || isSavingOllamaUrl}
                      className="h-7 text-[11px]"
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Ollama runs locally. No API key required.{' '}
                    {keyLink ? (
                      <a
                        href={keyLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        Install Ollama
                      </a>
                    ) : null}
                  </p>
                </div>
              )}
            </div>
          </SettingsSection>

          {/* ── Model ─────────────────────────────────────────────────────── */}
          <SettingsSection title="Model">
            <SettingsRow label="Active model" loading={isLoadingModel}>
              <SettingsSelect
                options={
                  modelOptions.length > 0
                    ? modelOptions
                    : [{ value: selectedModelId ?? '', label: selectedModelId ?? '' }]
                }
                value={selectedModelId ?? ''}
                onChange={(v) => void handleModelChange(v)}
                aria-label="AI model"
                className="max-w-[260px]"
              />
            </SettingsRow>
          </SettingsSection>

          {/* ── Behavior ──────────────────────────────────────────────────── */}
          <SettingsSection title="Behavior">
            <SettingsRow label="Autonomy" loading={isLoadingAutonomy}>
              <SegmentedControl
                options={[
                  { value: 'auto' as const, label: 'Auto' },
                  { value: 'confirm' as const, label: 'Confirm' },
                ]}
                value={autonomyMode}
                onChange={(v) => void handleAutonomyChange(v as 'auto' | 'confirm')}
              />
            </SettingsRow>
            <SettingsRow label="Chat retention" loading={isLoadingRetention}>
              <SegmentedControl
                options={[
                  { value: 'session' as const, label: 'Session' },
                  { value: '30d' as const, label: '30 days' },
                  { value: 'forever' as const, label: 'Forever' },
                ]}
                value={retentionMode}
                onChange={(v) => void handleRetentionChange(v as 'session' | '30d' | 'forever')}
              />
            </SettingsRow>
          </SettingsSection>
        </>
      ) : null}
    </div>
  );
};
