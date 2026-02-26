import { useCallback, useEffect, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { PILL_SLIDE, fadeVariants, heightVariants } from '../../lib/animation';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { selectAiEnabled, useAppStore } from '../../stores/appStore';
import { ApiKeyManager, type OllamaConnectionStatus } from './ApiKeyManager';
import type { OllamaPullProgressPayload } from '../../../types/ipc';
import { ModelCatalogView, getCuratedModelsForProvider, type OllamaModelOption } from './ModelCatalogView';
import { ProviderSelector } from './ProviderSelector';
import { SegmentedControl } from './SegmentedControl';
import { SettingsMemoryTab } from './SettingsMemoryTab';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

// ─── Provider types ──────────────────────────────────────────────────────────

type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

// ─── Setting key constants ────────────────────────────────────────────────────

const SETTING_KEY_AI_PROVIDER = 'ai_provider';
const SETTING_KEY_AI_OLLAMA_BASE_URL = 'ai_ollama_base_url';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidProvider = (value: string): value is ProviderType =>
  ['openrouter', 'openai', 'anthropic', 'ollama'].includes(value);

// ─── Hook: AI tab state ──────────────────────────────────────────────────────

const useAITabState = (
  setError: (error: string | null) => void,
  setNotice: (notice: string | null) => void,
) => {
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

  // Ollama detection
  const [ollamaStatus, setOllamaStatus] = useState<OllamaConnectionStatus>('loading');
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([]);
  const [detectedBaseUrl, setDetectedBaseUrl] = useState<string>(DEFAULT_OLLAMA_BASE_URL);

  // Ollama pull
  const [pullProgress, setPullProgress] = useState<OllamaPullProgressPayload | null>(null);

  // Model
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  // Behavior
  const [autonomyMode, setAutonomyMode] = useState<'auto' | 'confirm'>('auto');
  const [isLoadingAutonomy, setIsLoadingAutonomy] = useState(false);
  const [retentionMode, setRetentionMode] = useState<'session' | '30d' | 'forever'>('session');
  const [isLoadingRetention, setIsLoadingRetention] = useState(false);

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'ai' | 'identity' | 'knowledge'>('ai');

  // ─── Loaders ──────────────────────────────────────────────────────────────

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

  const loadOllamaStatus = useCallback(async () => {
    try {
      setOllamaStatus('loading');
      const result = await getUntask().chat.getOllamaStatus();
      setOllamaStatus(result.status);
      setDetectedBaseUrl(result.baseUrl);
      setOllamaBaseUrl(result.baseUrl);
      setOllamaModels(
        result.models.map((m) => ({
          name: m.name,
          parameterSize: m.parameterSize,
          supportsTools: m.supportsTools,
        })),
      );
      return result;
    } catch {
      setOllamaStatus('not_running');
      return null;
    }
  }, []);

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

      if (resolvedProvider === 'ollama') {
        void loadOllamaStatus();
      }
    })();
  }, [
    loadAiEnabled,
    loadProvider,
    loadApiKeyStatus,
    loadOllamaBaseUrl,
    loadOllamaStatus,
    loadSelectedModel,
    loadAutonomyMode,
    loadRetentionMode,
  ]);

  // ─── Ollama pull progress listener ────────────────────────────────────────

  useEffect(() => {
    const unsub = getUntask().chat.onOllamaPullProgress((progress) => {
      setPullProgress(progress);
      if (progress.status === 'success') {
        void loadOllamaStatus();
        setTimeout(() => setPullProgress(null), 2000);
      } else if (progress.status === 'error') {
        setTimeout(() => setPullProgress(null), 5000);
      }
    });
    return unsub;
  }, [loadOllamaStatus]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

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

        if (value === 'ollama') {
          // Run detection and auto-select first model
          const detection = await loadOllamaStatus();
          if (detection?.defaultModelName) {
            const result = await getUntask().chat.setSelectedModel({ modelId: detection.defaultModelName });
            setSelectedModelId(result.modelId);
          }
        } else {
          // Load key status for new provider
          await loadApiKeyStatus(value);

          // Reset selected model to provider default
          const providerModels = getCuratedModelsForProvider(value);
          const defaultModel = providerModels.find((m) => m.isDefault) ?? providerModels[0];
          if (defaultModel) {
            const result = await getUntask().chat.setSelectedModel({ modelId: defaultModel.id });
            setSelectedModelId(result.modelId);
          }
        }

        setNotice(`Provider changed to ${PROVIDER_LABELS[value]}.`);
      } catch (e) {
        setProvider(previousProvider);
        setError(e instanceof Error ? e.message : 'Failed to update provider.');
      }
    },
    [provider, setError, setNotice, loadApiKeyStatus, loadOllamaStatus],
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

  const handleSaveOllamaUrl = useCallback(async (): Promise<boolean> => {
    const normalized = ollamaBaseUrl.trim();
    if (normalized.length === 0) {
      setError('Enter a valid Ollama base URL.');
      return false;
    }

    try {
      setIsSavingOllamaUrl(true);
      setError(null);
      setNotice(null);
      await getUntask().settings.set(SETTING_KEY_AI_OLLAMA_BASE_URL, normalized);
      setNotice('Ollama base URL saved.');
      // Re-run detection with new URL
      void loadOllamaStatus();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save Ollama base URL.');
      return false;
    } finally {
      setIsSavingOllamaUrl(false);
    }
  }, [ollamaBaseUrl, setError, setNotice, loadOllamaStatus]);

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

  const handleApiKeyInputChange = useCallback((value: string) => {
    setApiKeyInput(value);
    setApiKeyValid(null);
    setApiKeyError(null);
  }, []);

  const handlePullModel = useCallback(
    async (model: string) => {
      setError(null);
      setNotice(null);
      try {
        const result = await getUntask().chat.pullOllamaModel({ model });
        if (result.ok) {
          // Auto-select the newly pulled model after list refresh
          const status = await getUntask().chat.getOllamaStatus();
          const matchedModel = status.models.find(
            (m) => m.name === model || m.name === `${model}:latest` || m.name.startsWith(`${model}:`),
          );
          if (matchedModel) {
            const selectResult = await getUntask().chat.setSelectedModel({ modelId: matchedModel.name });
            setSelectedModelId(selectResult.modelId);
          }
        } else if (result.error) {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to pull model.');
      }
    },
    [setError, setNotice],
  );

  const handleCancelPull = useCallback(() => {
    void getUntask().chat.cancelOllamaPull();
    setPullProgress(null);
  }, []);

  return {
    // AI enabled
    aiEnabled,
    isLoadingAiEnabled,
    handleAiEnabledChange,
    // Provider
    provider,
    isLoadingProvider,
    handleProviderChange,
    // API key
    apiKeyInput,
    handleApiKeyInputChange,
    hasApiKey,
    isLoadingApiKey,
    isSavingApiKey,
    apiKeyValid,
    apiKeyValidating,
    apiKeyError,
    handleValidateApiKey,
    handleSaveApiKey,
    handleClearApiKey,
    // Ollama
    ollamaBaseUrl,
    setOllamaBaseUrl,
    isLoadingOllamaUrl,
    isSavingOllamaUrl,
    handleSaveOllamaUrl,
    ollamaStatus,
    ollamaModels,
    detectedBaseUrl,
    pullProgress,
    handlePullModel,
    handleCancelPull,
    // Model
    selectedModelId,
    isLoadingModel,
    handleModelChange,
    // Behavior
    autonomyMode,
    isLoadingAutonomy,
    handleAutonomyChange,
    retentionMode,
    isLoadingRetention,
    handleRetentionChange,
    // Sub-tabs
    activeSubTab,
    setActiveSubTab,
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

type SettingsAIProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export const SettingsAI = ({ setError, setNotice }: SettingsAIProps) => {
  const state = useAITabState(setError, setNotice);

  const isKeyedProvider = state.provider !== 'ollama';

  const renderSubTabContent = () => {
    switch (state.activeSubTab) {
      case 'identity':
        return <SettingsMemoryTab setError={setError} setNotice={setNotice} availableTabs={['identity']} />;
      case 'knowledge':
        return <SettingsMemoryTab setError={setError} setNotice={setNotice} availableTabs={['memory']} />;
      case 'ai':
      default:
        return (
          <>
            {/* ── Provider ──────────────────────────────────────────────────── */}
            <SettingsSection title="Provider">
              <ProviderSelector
                provider={state.provider}
                loading={state.isLoadingProvider}
                onChange={(v) => void state.handleProviderChange(v)}
              />
            </SettingsSection>

            {/* ── API Key / Connection ──────────────────────────────────────── */}
            <SettingsSection title={isKeyedProvider ? 'API Key' : 'Connection'}>
              <ApiKeyManager
                provider={state.provider}
                apiKeyInput={state.apiKeyInput}
                onApiKeyInputChange={state.handleApiKeyInputChange}
                hasApiKey={state.hasApiKey}
                isLoadingApiKey={state.isLoadingApiKey}
                isSavingApiKey={state.isSavingApiKey}
                apiKeyValid={state.apiKeyValid}
                apiKeyValidating={state.apiKeyValidating}
                apiKeyError={state.apiKeyError}
                onValidateApiKey={() => void state.handleValidateApiKey()}
                onSaveApiKey={() => void state.handleSaveApiKey()}
                onClearApiKey={() => void state.handleClearApiKey()}
                ollamaBaseUrl={state.ollamaBaseUrl}
                onOllamaBaseUrlChange={state.setOllamaBaseUrl}
                isLoadingOllamaUrl={state.isLoadingOllamaUrl}
                isSavingOllamaUrl={state.isSavingOllamaUrl}
                defaultOllamaBaseUrl={DEFAULT_OLLAMA_BASE_URL}
                onSaveOllamaUrl={() => state.handleSaveOllamaUrl()}
                ollamaStatus={state.ollamaStatus}
                detectedBaseUrl={state.detectedBaseUrl}
              />
            </SettingsSection>

            {/* ── Model ─────────────────────────────────────────────────────── */}
            <SettingsSection title="Model">
              <ModelCatalogView
                provider={state.provider}
                selectedModelId={state.selectedModelId}
                loading={state.isLoadingModel}
                onChange={(v) => void state.handleModelChange(v)}
                ollamaModels={state.ollamaModels}
                ollamaStatus={state.ollamaStatus}
                pullProgress={state.pullProgress}
                onPullModel={(m) => void state.handlePullModel(m)}
                onCancelPull={state.handleCancelPull}
              />
            </SettingsSection>

            {/* ── Behavior ──────────────────────────────────────────────────── */}
            <SettingsSection title="Behavior">
              <SettingsRow label="Autonomy" loading={state.isLoadingAutonomy}>
                <SegmentedControl
                  options={[
                    { value: 'auto' as const, label: 'Auto' },
                    { value: 'confirm' as const, label: 'Confirm' },
                  ]}
                  value={state.autonomyMode}
                  onChange={(v) => void state.handleAutonomyChange(v as 'auto' | 'confirm')}
                />
              </SettingsRow>
              <SettingsRow label="Chat retention" loading={state.isLoadingRetention}>
                <SegmentedControl
                  options={[
                    { value: 'session' as const, label: 'Session' },
                    { value: '30d' as const, label: '30 days' },
                    { value: 'forever' as const, label: 'Forever' },
                  ]}
                  value={state.retentionMode}
                  onChange={(v) => void state.handleRetentionChange(v as 'session' | '30d' | 'forever')}
                />
              </SettingsRow>
            </SettingsSection>

          </>
        );
    }
  };

  return (
    <div role="tabpanel" id="settings-panel-ai" className="space-y-3">
      <SettingsSection title="Assistant">
        <SettingsRow
          label="Enable AI assistant"
          hint="When off, the app works as a pure task manager. Chat history and memory are preserved."
          loading={state.isLoadingAiEnabled}
        >
          <SegmentedControl
            options={[
              { value: 'on' as const, label: 'On' },
              { value: 'off' as const, label: 'Off' },
            ]}
            value={state.aiEnabled ? 'on' : 'off'}
            onChange={(v) => void state.handleAiEnabledChange(v as 'on' | 'off')}
          />
        </SettingsRow>
      </SettingsSection>

      <AnimatePresence initial={false}>
        {state.aiEnabled && (
          <motion.div
            key="ai-config"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-3">
              <nav className="flex items-center gap-0.5" aria-label="Assistant sub-tabs">
                <button
                  type="button"
                  onClick={() => state.setActiveSubTab('ai')}
                  className={cn(
                    'relative rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    state.activeSubTab === 'ai'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80',
                  )}
                >
                  {state.activeSubTab === 'ai' && (
                    <motion.span layoutId="ai-sub-pill" className="absolute inset-0 rounded-md bg-accent" transition={PILL_SLIDE} aria-hidden="true" />
                  )}
                  <span className="relative">AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => state.setActiveSubTab('identity')}
                  className={cn(
                    'relative rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    state.activeSubTab === 'identity'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80',
                  )}
                >
                  {state.activeSubTab === 'identity' && (
                    <motion.span layoutId="ai-sub-pill" className="absolute inset-0 rounded-md bg-accent" transition={PILL_SLIDE} aria-hidden="true" />
                  )}
                  <span className="relative">Identity</span>
                </button>
                <button
                  type="button"
                  onClick={() => state.setActiveSubTab('knowledge')}
                  className={cn(
                    'relative rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    state.activeSubTab === 'knowledge'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80',
                  )}
                >
                  {state.activeSubTab === 'knowledge' && (
                    <motion.span layoutId="ai-sub-pill" className="absolute inset-0 rounded-md bg-accent" transition={PILL_SLIDE} aria-hidden="true" />
                  )}
                  <span className="relative">Knowledge</span>
                </button>
              </nav>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={state.activeSubTab}
                  variants={fadeVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.1 }}
                >
                  {renderSubTabContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
